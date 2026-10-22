import type * as THREE from "three";

/**
 * PSX do protótipo 7, portado para o three 0.186 (contrato §4): tremor de vértice (o gl_Position é preso a
 * uma grade em espaço de tela) e textura afim leve (a UV deixa de ser corrigida pela perspectiva).
 * Este módulo não importa three em tempo de execução: só reescreve texto de shader e liga uniforms.
 */
export const PSX_DEFAULTS = { snap: [280, 160], affine: 0.28 } as const;

/** Compartilhados por todos os materiais PSX: mudar um valor muda a cena inteira. */
export type PsxUniforms = {
  /** 1 liga o tremor; 0 desliga (gravura, ASCII e, depois, exame de objeto). */
  uSnap: THREE.IUniform<number>;
  /** Grade do tremor em NDC (o engine ajusta o x ao aspecto, como o protótipo). */
  uSnapRes: THREE.IUniform<THREE.Vector2>;
  /** 0 = UV correta; 1 = afim pura. */
  uAff: THREE.IUniform<number>;
};

const MARK = "// psx";
const PROJECT = "#include <project_vertex>";
const MAP_FRAGMENT = "#include <map_fragment>";

export function createPsxUniforms(three: Pick<typeof THREE, "Vector2">): PsxUniforms {
  return {
    uSnap: { value: 1 },
    uSnapRes: { value: new three.Vector2(PSX_DEFAULTS.snap[0], PSX_DEFAULTS.snap[1]) },
    uAff: { value: PSX_DEFAULTS.affine },
  };
}

/**
 * Prende o vértice projetado à grade `uSnapRes` logo depois do `project_vertex`. Com `withMap`, guarda a UV
 * multiplicada por w (`vAff`) para o fragmento desfazer a correção de perspectiva. No 0.186 a UV do map é
 * `vMapUv` (já com o `mapTransform`), não o `vUv` do r128.
 */
export function patchPsxVertex(src: string, withMap: boolean): string {
  if (src.startsWith(MARK)) return src;
  if (!src.includes(PROJECT)) throw new Error("psx: o vertex shader não tem #include <project_vertex>");
  const head = `${MARK}\nuniform float uSnap;\nuniform vec2 uSnapRes;\n${withMap ? "#ifdef USE_MAP\nvarying vec3 vAff;\n#endif\n" : ""}`;
  const snap = [
    PROJECT,
    "if ( uSnap > 0.5 ) {",
    "\tvec4 psxPos = gl_Position;",
    "\tpsxPos.xyz /= psxPos.w;",
    "\tpsxPos.xy = floor( psxPos.xy * uSnapRes + 0.5 ) / uSnapRes;",
    "\tpsxPos.xyz *= psxPos.w;",
    "\tgl_Position = psxPos;",
    "}",
    ...(withMap ? ["#ifdef USE_MAP", "\tvAff = vec3( vMapUv * gl_Position.w, gl_Position.w );", "#endif"] : []),
  ].join("\n");
  return head + src.replace(PROJECT, snap);
}

/**
 * Troca o `map_fragment` por uma amostra entre a UV correta e a afim (`uAff`). Sem `mapTexelToLinear`: no
 * 0.186 a decodificação de cor é do `texture.colorSpace` (o hardware decodifica sRGB); o caso de vídeo do
 * chunk original fica.
 */
export function patchPsxFragment(src: string): string {
  if (src.startsWith(MARK)) return src;
  if (!src.includes(MAP_FRAGMENT)) throw new Error("psx: o fragment shader não tem #include <map_fragment>");
  const head = `${MARK}\n#ifdef USE_MAP\nuniform float uAff;\nvarying vec3 vAff;\n#endif\n`;
  const sample = [
    "#ifdef USE_MAP",
    "\tvec4 sampledDiffuseColor = texture2D( map, mix( vMapUv, vAff.xy / vAff.z, uAff ) );",
    "\t#ifdef DECODE_VIDEO_TEXTURE",
    "\t\tsampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );",
    "\t#endif",
    "\tdiffuseColor *= sampledDiffuseColor;",
    "#endif",
  ].join("\n");
  return head + src.replace(MAP_FRAGMENT, sample);
}

const hasMap = (mat: THREE.Material) => !!(mat as THREE.Material & { map?: THREE.Texture | null }).map;

/**
 * Liga o PSX num material (Phong, Basic ou qualquer um com `project_vertex`/`map_fragment`). O `map` é lido na
 * hora de compilar, então trocar o map depois também vale; o `customProgramCacheKey` separa os dois programas.
 */
export function applyPsx<T extends THREE.Material>(mat: T, uniforms: PsxUniforms): T {
  mat.onBeforeCompile = (shader) => {
    const withMap = hasMap(mat);
    shader.uniforms.uSnap = uniforms.uSnap;
    shader.uniforms.uSnapRes = uniforms.uSnapRes;
    shader.uniforms.uAff = uniforms.uAff;
    shader.vertexShader = patchPsxVertex(shader.vertexShader, withMap);
    if (withMap) shader.fragmentShader = patchPsxFragment(shader.fragmentShader);
  };
  mat.customProgramCacheKey = () => (hasMap(mat) ? "psx-m" : "psx");
  mat.needsUpdate = true;
  return mat;
}
