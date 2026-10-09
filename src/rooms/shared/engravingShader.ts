/** Pontos do rastro do cursor (protótipo: N = 24). */
export const ENGRAVING_TRAIL_POINTS = 24;

/** Marcas da área revelada pela lente (Câmara, spec 7.5: "fica marcada por alguns segundos"). */
export const ENGRAVING_LENS_MARKS = 24;

/** Quanto da cor real as marcas mostram (lavagem sobre a gravura). */
export const ENGRAVING_LENS_WASH = 0.35;

type EngravingOptions = {
  /** Rastro do cursor + tinta (Gravura). */
  ink: boolean;
  /** Lente que revela a cor real + marcas que desvanecem (Câmara). Supõe ink: false. */
  lens?: boolean;
  /** Fusão entre duas texturas (troca de captura em 250 ms, Relicário). */
  swap?: boolean;
};

/** Espaço entre linhas em px CSS: 4,6 no desktop (spec 7.3); no toque, menos linhas (spec 6.5). */
export const ENGRAVING_LINE_SPACING = { fine: 4.6, coarse: 6 } as const;

export function engravingLineCount(heightPx: number, coarse: boolean): number {
  return heightPx / (coarse ? ENGRAVING_LINE_SPACING.coarse : ENGRAVING_LINE_SPACING.fine);
}

/** "#rrggbb" → [r, g, b] em 0–1 (cores dos tokens para o shader). */
export function hexToVec3(hex: string): [number, number, number] {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) throw new Error(`cor inválida: ${hex}`);
  const n = Number.parseInt(match[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export const ENGRAVING_VERTEX = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }";

/**
 * Fragment da gravura (protótipo salas.html, gravura()): linhas horizontais onduladas com espessura
 * pela luminância, hachura cruzada onde luma < 0.2 e, com `ink`, rastro do cursor que desloca as
 * linhas e acumula tinta (> 0.12 avermelha, > 0.6 vira sangue sólido). `swap` funde a fonte com uma
 * segunda textura antes da gravura; `lens` mostra a cor real dentro de um círculo com borda de 2 px.
 */
export function buildEngravingFragment({ ink, lens = false, swap = false }: EngravingOptions): string {
  const n = ENGRAVING_TRAIL_POINTS;
  const m = ENGRAVING_LENS_MARKS;
  const defines = [ink && "#define USE_INK", lens && "#define USE_LENS", swap && "#define USE_SWAP"]
    .filter(Boolean)
    .join("\n");
  return `
precision highp float;
${defines}
uniform sampler2D uTex; uniform float uTime; uniform float uAspect; uniform float uLines; uniform float uMotion;
uniform vec4 uCrop;
uniform vec3 uBone; uniform vec3 uBlack; uniform vec3 uBlood; uniform vec3 uClot;
#ifdef USE_INK
uniform vec3 uTrail[${n}];
#endif
#ifdef USE_SWAP
uniform sampler2D uTexNext;
uniform vec4 uCropNext;
uniform float uSwap;
#endif
#ifdef USE_LENS
uniform vec3 uLens;
uniform vec2 uSize;
uniform vec4 uMarks[${m}];
#endif
varying vec2 vUv;
float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
void main(){
  vec2 uv = vUv; float ink = 0.0; vec2 disp = vec2(0.0);
#ifdef USE_INK
  for (int i = 0; i < ${n}; i++) {
    vec3 t = uTrail[i]; vec2 d = uv - t.xy; d.x *= uAspect;
    float r = length(d); float f = t.z * smoothstep(0.16, 0.0, r);
    ink += f; disp += (d / (r + 0.001)) * f * 0.012;
  }
#endif
  vec2 s = clamp(uv - disp, 0.0, 1.0);
  vec3 c = texture2D(uTex, uCrop.xy + s * uCrop.zw).rgb;
#ifdef USE_SWAP
  c = mix(c, texture2D(uTexNext, uCropNext.xy + s * uCropNext.zw).rgb, uSwap);
#endif
  vec3 real = c;
  float l = smoothstep(0.03, 0.62, luma(c));
  float w = sin(s.x * 24.0 + uTime * 0.6 * uMotion) * 0.0022 + sin(s.x * 7.0 + l * 3.0) * 0.004;
  float band = fract((s.y + w) * uLines);
  float dist = abs(band - 0.5) * 2.0;
  float thick = (1.0 - l) * 0.98 - 0.06;
  float lineInk = 1.0 - smoothstep(thick - 0.07, thick + 0.07, dist);
  float band2 = fract((s.x * uAspect + s.y) * uLines * 0.7);
  float cross = (1.0 - smoothstep(0.1, 0.22, abs(band2 - 0.5) * 2.0)) * step(l, 0.2);
  float k = clamp(lineInk + cross, 0.0, 1.0);
  vec3 col = mix(uBone, uBlack, k);
  col = mix(col, uBlood, smoothstep(0.12, 0.5, ink) * k * 0.85);
  float b = smoothstep(0.6, 1.2, ink);
  col = mix(col, mix(uBlood, uClot, k), b);
#ifdef USE_LENS
  float mark = 0.0;
  for (int i = 0; i < ${m}; i++) {
    vec4 mk = uMarks[i];
    float dm = length((uv - mk.xy) * uSize);
    mark = max(mark, mk.w * (1.0 - smoothstep(mk.z - 2.0, mk.z, dm)));
  }
  col = mix(col, real, mark * ${ENGRAVING_LENS_WASH.toFixed(2)});
  float dl = length((uv - uLens.xy) * uSize);
  float on = step(1.0, uLens.z);
  col = mix(col, real, on * (1.0 - smoothstep(uLens.z - 1.0, uLens.z, dl)));
  float ring = smoothstep(uLens.z - 2.5, uLens.z - 2.0, dl) * (1.0 - smoothstep(uLens.z, uLens.z + 0.5, dl));
  col = mix(col, uBone, on * ring);
#endif
  gl_FragColor = vec4(col, 1.0);
}`;
}
