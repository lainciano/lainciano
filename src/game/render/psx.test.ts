import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { applyPsx, createPsxUniforms, patchPsxFragment, patchPsxVertex, PSX_DEFAULTS } from "./psx";

// Os shaders reais do three 0.186 (o que o onBeforeCompile recebe), não cópias.
const phongVertex = THREE.ShaderLib.phong.vertexShader;
const phongFragment = THREE.ShaderLib.phong.fragmentShader;
const basicVertex = THREE.ShaderLib.basic.vertexShader;
const basicFragment = THREE.ShaderLib.basic.fragmentShader;

const PROJECT = "#include <project_vertex>";

describe("valores do protótipo 7", () => {
  it("snap (280, 160) e afim 0.28", () => {
    expect(PSX_DEFAULTS).toEqual({ snap: [280, 160], affine: 0.28 });
  });

  it("os uniforms nascem com os valores padrão e o snap ligado", () => {
    const u = createPsxUniforms(THREE);
    expect(u.uSnap.value).toBe(1);
    expect([u.uSnapRes.value.x, u.uSnapRes.value.y]).toEqual([280, 160]);
    expect(u.uAff.value).toBe(0.28);
  });
});

describe("patchPsxVertex", () => {
  it("declara o uSnapRes e encaixa o snap logo depois do project_vertex", () => {
    const out = patchPsxVertex(phongVertex, false);
    expect(out).toContain("uniform vec2 uSnapRes");
    expect(out).toContain("uniform float uSnap");
    const project = out.indexOf(PROJECT);
    const snap = out.indexOf("floor(");
    expect(project).toBeGreaterThan(-1);
    expect(snap).toBeGreaterThan(project);
    // O snap fica entre o project_vertex e o include seguinte (antes de qualquer uso do gl_Position).
    expect(snap).toBeLessThan(out.indexOf("#include <logdepthbuf_vertex>"));
    expect(out.match(/uSnapRes \+ 0\.5/g)).toHaveLength(1);
  });

  it("sem map não declara nem escreve o vAff", () => {
    const out = patchPsxVertex(phongVertex, false);
    expect(out).not.toContain("vAff");
  });

  it("com map declara varying vec3 vAff e o calcula a partir do vMapUv do 0.186", () => {
    const out = patchPsxVertex(phongVertex, true);
    expect(out).toContain("varying vec3 vAff");
    expect(out).toMatch(/vAff = vec3\( vMapUv \* gl_Position\.w, gl_Position\.w \)/);
    expect(out.indexOf("vAff = ")).toBeGreaterThan(out.indexOf(PROJECT));
    // O vUv do r128 não existe mais para o map.
    expect(out).not.toMatch(/vAff = vec3\( vUv/);
  });

  it("serve também ao MeshBasicMaterial", () => {
    const out = patchPsxVertex(basicVertex, true);
    expect(out).toContain("uniform vec2 uSnapRes");
    expect(out.indexOf("floor(")).toBeGreaterThan(out.indexOf(PROJECT));
  });

  it("patchar duas vezes não duplica (marcador // psx)", () => {
    const once = patchPsxVertex(phongVertex, true);
    expect(patchPsxVertex(once, true)).toBe(once);
    expect(once.startsWith("// psx")).toBe(true);
  });

  it("sem project_vertex não há onde encaixar: falha alto, não em silêncio", () => {
    expect(() => patchPsxVertex("void main() { gl_Position = vec4(0.0); }", false)).toThrow(/project_vertex/);
  });
});

describe("patchPsxFragment", () => {
  it("troca o map_fragment por uma amostra que mistura vMapUv e a coordenada afim", () => {
    const out = patchPsxFragment(phongFragment);
    expect(out).not.toContain("#include <map_fragment>");
    expect(out).toContain("uniform float uAff");
    expect(out).toContain("varying vec3 vAff");
    expect(out).toMatch(/texture2D\( map, mix\( vMapUv, vAff\.xy \/ vAff\.z, uAff \) \)/);
    expect(out).toContain("diffuseColor *= sampledDiffuseColor");
  });

  it("não usa o mapTexelToLinear do r128 (a cor vem do texture.colorSpace)", () => {
    expect(patchPsxFragment(phongFragment)).not.toContain("mapTexelToLinear");
    expect(patchPsxFragment(basicFragment)).not.toContain("mapTexelToLinear");
  });

  it("guarda a decodificação de vídeo do chunk original", () => {
    expect(patchPsxFragment(phongFragment)).toContain("DECODE_VIDEO_TEXTURE");
  });

  it("é idempotente", () => {
    const once = patchPsxFragment(phongFragment);
    expect(patchPsxFragment(once)).toBe(once);
  });

  it("sem map_fragment falha alto", () => {
    expect(() => patchPsxFragment("void main() { gl_FragColor = vec4(1.0); }")).toThrow(/map_fragment/);
  });
});

describe("applyPsx", () => {
  type Shader = { uniforms: Record<string, THREE.IUniform>; vertexShader: string; fragmentShader: string };
  const compile = (mat: THREE.Material, base: { vertexShader: string; fragmentShader: string }): Shader => {
    const shader: Shader = { uniforms: {}, vertexShader: base.vertexShader, fragmentShader: base.fragmentShader };
    mat.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    return shader;
  };

  it("devolve o mesmo material e liga os uniforms compartilhados (mudar um muda todos)", () => {
    const u = createPsxUniforms(THREE);
    const a = applyPsx(new THREE.MeshPhongMaterial(), u);
    const b = applyPsx(new THREE.MeshBasicMaterial(), u);
    expect(a).toBeInstanceOf(THREE.MeshPhongMaterial);
    const sa = compile(a, THREE.ShaderLib.phong);
    const sb = compile(b, THREE.ShaderLib.basic);
    expect(sa.uniforms.uSnapRes).toBe(u.uSnapRes);
    expect(sb.uniforms.uSnap).toBe(u.uSnap);
    u.uSnap.value = 0;
    expect(sa.uniforms.uSnap.value).toBe(0);
  });

  it("sem map: só o vértice muda; com map: o fragmento ganha a textura afim", () => {
    const u = createPsxUniforms(THREE);
    const plain = compile(applyPsx(new THREE.MeshPhongMaterial(), u), THREE.ShaderLib.phong);
    expect(plain.fragmentShader).toBe(phongFragment);
    expect(plain.vertexShader).toContain("uSnapRes");

    const mapped = compile(applyPsx(new THREE.MeshPhongMaterial({ map: new THREE.Texture() }), u), THREE.ShaderLib.phong);
    expect(mapped.fragmentShader).toContain("vAff.xy / vAff.z");
    expect(mapped.uniforms.uAff).toBe(u.uAff);
  });

  it("customProgramCacheKey distingue com e sem map (e segue o map trocado depois)", () => {
    const u = createPsxUniforms(THREE);
    const mat = applyPsx(new THREE.MeshPhongMaterial(), u);
    const without = mat.customProgramCacheKey();
    mat.map = new THREE.Texture();
    const withMap = mat.customProgramCacheKey();
    expect(without).not.toBe(withMap);
    expect(without).toContain("psx");
    expect(withMap).toContain("psx");
  });
});
