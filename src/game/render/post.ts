import type * as THREE from "three";

/** 0 gravura · 1 PSX · 2 ASCII (contrato §4). */
export type PostModeValue = 0 | 1 | 2;

export type PostOptions = {
  /** Família da fonte do atlas ASCII (o engine passa a JetBrains Mono do site; sem ela, monospace). */
  font?: string;
};

export type Post = {
  material: THREE.ShaderMaterial;
  setMode(m: PostModeValue): void;
  /** Tamanho do render target baixo (grade do Bayer e do grão no modo PSX). */
  setLow(w: number, h: number): void;
  /** Tamanho do canvas em pixels de dispositivo e o DPR: linhas da gravura e células do ASCII. */
  setOutput(w: number, h: number, dpr: number): void;
  setFade(v: number): void;
  setGlitch(v: number): void;
  /** Tempo em segundos (grão e glitch). */
  tick(t: number): void;
  setInput(texture: THREE.Texture | null): void;
  dispose(): void;
};

/** Valores do protótipo 7 (aprovado). */
export const POST_DEFAULTS = { levels: 24, low: [640, 480], gap: 4, cell: 8 } as const;

/** Rampa e atlas do ASCII do protótipo 7: 10 glifos de 32 px numa faixa de 320 × 32, desenhados em canvas. */
const RAMP = " .:-=+*#%@";
const ATLAS_CELL = 32;

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4( position.xy, 0.0, 1.0 );
}`;

// Portado do protótipo 7. A cena chega linear no render target (o 0.186 decodifica e grava em linear); `tx`
// aplica a gama 1/2.2 do protótipo e todo o resto (Bayer, níveis, vinheta, grão, gravura, ASCII) acontece no
// espaço com gama, como lá. Sem `colorspace_fragment`: a saída já está codificada para a tela.
const FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse;
uniform sampler2D uAtlas;
uniform vec2 uRes;
uniform vec2 uLow;
uniform float uTime;
uniform float uMode;
uniform float uGap;
uniform float uCell;
uniform float uGlitch;
uniform float uFade;
uniform float uLevels;
varying vec2 vUv;
float h1( float n ) { return fract( sin( n ) * 43758.5453 ); }
float bayer2( vec2 a ) { a = floor( a ); return fract( dot( a, vec2( 0.5, a.y * 0.75 ) ) ); }
float bayer4( vec2 a ) { return bayer2( 0.5 * a ) * 0.25 + bayer2( a ); }
vec3 tx( vec2 uv ) { return pow( max( texture2D( tDiffuse, clamp( uv, 0.0, 1.0 ) ).rgb, 0.0 ), vec3( 0.4545 ) ); }
void main() {
  vec2 uv = vUv;
  float split = 0.0;
  if ( uGlitch > 0.0 ) {
    float band = floor( uv.y * 24.0 );
    float r = h1( band * 91.3 + floor( uTime * 24.0 ) * 13.7 );
    if ( r < uGlitch * 0.6 ) uv.x += ( r - 0.3 ) * 0.12 * uGlitch;
    split = uGlitch * 0.01;
  }
  vec2 frag = uv * uRes;
  vec3 bg = vec3( 0.063, 0.039, 0.031 );
  vec3 col;
  if ( uMode < 0.5 ) {
    // gravura: linhas horizontais cuja espessura segue a luminância; vermelho forte vira tinta vermelha
    float cy = ( floor( frag.y / uGap ) + 0.5 ) * uGap;
    vec3 c = tx( vec2( uv.x, cy / uRes.y ) );
    float lum = dot( c, vec3( 0.299, 0.587, 0.114 ) );
    float t = clamp( pow( lum, 0.6 ) * 1.9, 0.0, 1.0 ) * uGap * 0.98;
    float row = abs( mod( frag.y, uGap ) - uGap * 0.5 );
    float line = ( 1.0 - smoothstep( t * 0.5 - 0.5, t * 0.5 + 0.5, row ) ) * step( 0.04, lum );
    bool red = c.r > 0.2 && c.r > c.g * 1.7;
    col = mix( mix( bg, vec3( 0.227, 0.114, 0.059 ), ( 1.0 - smoothstep( 0.0, 0.8, row ) ) * 0.3 ), red ? vec3( 0.80, 0.16, 0.07 ) : vec3( 0.925, 0.894, 0.839 ), line );
  } else if ( uMode < 1.5 ) {
    // PSX: Bayer 4x4 na grade baixa, uLevels níveis, viragem fria/quente, vinheta e grão
    vec3 c = vec3( tx( uv + vec2( split, 0.0 ) ).r, tx( uv ).g, tx( uv - vec2( split, 0.0 ) ).b );
    vec2 lp = floor( uv * uLow );
    c += ( bayer4( lp ) - 0.5 ) / uLevels;
    c = floor( c * uLevels + 0.5 ) / uLevels;
    float l = dot( c, vec3( 0.299, 0.587, 0.114 ) );
    c = mix( c * vec3( 0.9, 0.98, 1.1 ), c * vec3( 1.06, 1.0, 0.9 ), smoothstep( 0.08, 0.55, l ) );
    float v = smoothstep( 0.98, 0.32, distance( uv, vec2( 0.5 ) ) );
    c *= mix( 0.32, 1.0, v );
    c += ( h1( dot( lp, vec2( 12.9898, 78.233 ) ) + floor( uTime * 18.0 ) ) - 0.5 ) * 0.035;
    col = c;
  } else {
    // ASCII: células de uCell px, glifo pela luminância
    vec2 cid = floor( frag / uCell );
    vec3 c = tx( ( cid + 0.5 ) * uCell / uRes );
    float lum = dot( c, vec3( 0.299, 0.587, 0.114 ) );
    float idx = floor( clamp( pow( lum, 0.7 ) * 1.7, 0.0, 0.999 ) * 10.0 );
    vec2 inC = fract( frag / uCell );
    float g = texture2D( uAtlas, vec2( ( idx + inC.x ) / 10.0, inC.y ) ).r;
    bool red = c.r > 0.2 && c.r > c.g * 1.7;
    col = mix( bg, red ? vec3( 0.85, 0.2, 0.09 ) : vec3( 0.925, 0.894, 0.839 ), g );
  }
  gl_FragColor = vec4( col * uFade, 1.0 );
}`;

function drawAtlas(canvas: HTMLCanvasElement, font: string) {
  const g = canvas.getContext("2d");
  if (!g) return;
  g.fillStyle = "#000";
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = "#fff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `600 26px ${font}`;
  for (let i = 0; i < RAMP.length; i++) g.fillText(RAMP[i], i * ATLAS_CELL + ATLAS_CELL / 2, 17);
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));

/**
 * Passe final do jogo (quad ortográfico): gravura, PSX e ASCII do protótipo 7. Texto nunca passa por aqui
 * (DOM por cima). Quem chama é dono do material e chama `dispose` (material e atlas).
 */
export function createPost(three: typeof THREE, opts: PostOptions = {}): Post {
  const font = opts.font?.trim() ? `${opts.font}, monospace` : "monospace";
  const atlasCanvas = document.createElement("canvas");
  atlasCanvas.width = ATLAS_CELL * RAMP.length;
  atlasCanvas.height = ATLAS_CELL;
  drawAtlas(atlasCanvas, font);
  const atlas = new three.CanvasTexture(atlasCanvas);
  atlas.generateMipmaps = false;
  atlas.minFilter = three.LinearFilter;
  atlas.magFilter = three.LinearFilter;
  // Dados (máscara do glifo), não cor.
  atlas.colorSpace = three.NoColorSpace;
  let disposed = false;
  // A fonte do site pode ainda não ter chegado: redesenha quando chegar (falha = fica a monospace).
  if (opts.font && typeof document !== "undefined" && document.fonts) {
    document.fonts
      .load(`600 26px ${font}`)
      .then(() => {
        if (disposed) return;
        drawAtlas(atlasCanvas, font);
        atlas.needsUpdate = true;
      })
      .catch(() => {});
  }

  const material = new three.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      uAtlas: { value: atlas },
      uRes: { value: new three.Vector2(1, 1) },
      uLow: { value: new three.Vector2(POST_DEFAULTS.low[0], POST_DEFAULTS.low[1]) },
      uTime: { value: 0 },
      uMode: { value: 1 },
      uGap: { value: POST_DEFAULTS.gap },
      uCell: { value: POST_DEFAULTS.cell },
      uGlitch: { value: 0 },
      uFade: { value: 1 },
      uLevels: { value: POST_DEFAULTS.levels },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });
  const u = material.uniforms;

  return {
    material,
    setMode(m) {
      u.uMode.value = m;
    },
    setLow(w, h) {
      u.uLow.value.set(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
    },
    setOutput(w, h, dpr) {
      u.uRes.value.set(Math.max(1, w), Math.max(1, h));
      // Como o protótipo: as linhas da gravura e as células do ASCII crescem com o DPR.
      u.uGap.value = Math.max(3, Math.round(3 * dpr));
      u.uCell.value = Math.max(6, Math.round(7 * dpr));
    },
    setFade(v) {
      u.uFade.value = clamp01(v);
    },
    setGlitch(v) {
      u.uGlitch.value = clamp01(v);
    },
    tick(t) {
      u.uTime.value = Number.isFinite(t) ? t : 0;
    },
    setInput(texture) {
      u.tDiffuse.value = texture;
    },
    dispose() {
      disposed = true;
      material.dispose();
      atlas.dispose();
    },
  };
}
