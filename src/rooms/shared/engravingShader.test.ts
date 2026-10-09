import { describe, expect, it } from "vitest";
import {
  ENGRAVING_LENS_MARKS,
  ENGRAVING_LENS_WASH,
  ENGRAVING_TRAIL_POINTS,
  buildEngravingFragment,
  engravingLineCount,
  hexToVec3,
} from "@/rooms/shared/engravingShader";

describe("engravingLineCount", () => {
  it("uma linha a cada 4,6 px CSS no desktop e 6 px no toque", () => {
    expect(engravingLineCount(460, false)).toBeCloseTo(100);
    expect(engravingLineCount(600, true)).toBeCloseTo(100);
  });
});

describe("buildEngravingFragment", () => {
  it("com tinta: rastro de 24 pontos", () => {
    const glsl = buildEngravingFragment({ ink: true });
    expect(ENGRAVING_TRAIL_POINTS).toBe(24);
    expect(glsl).toContain("#define USE_INK");
    expect(glsl).toContain("uniform vec3 uTrail[24];");
  });
  it("sem tinta: não declara o rastro ativo", () => {
    expect(buildEngravingFragment({ ink: false })).not.toContain("#define USE_INK");
  });
  it("mantém as curvas do protótipo", () => {
    const glsl = buildEngravingFragment({ ink: true });
    for (const piece of [
      "smoothstep(0.16, 0.0, r)",
      "* f * 0.012",
      "smoothstep(0.03, 0.62, luma(c))",
      "(1.0 - l) * 0.98 - 0.06",
      "step(l, 0.2)",
      "smoothstep(0.12, 0.5, ink) * k * 0.85",
      "smoothstep(0.6, 1.2, ink)",
    ]) {
      expect(glsl).toContain(piece);
    }
  });
});

describe("hexToVec3", () => {
  it("osso vira o 'bone' do protótipo", () => {
    const [r, g, b] = hexToVec3("#ece4d6");
    expect(r).toBeCloseTo(0.925, 3);
    expect(g).toBeCloseTo(0.894, 3);
    expect(b).toBeCloseTo(0.839, 3);
  });
  it("cor inválida lança", () => {
    expect(() => hexToVec3("osso")).toThrow();
  });
});

describe("buildEngravingFragment — lente (Câmara, spec 7.5)", () => {
  const glsl = buildEngravingFragment({ ink: false, lens: true });
  it("liga USE_LENS com lente, tamanho e 24 marcas", () => {
    expect(ENGRAVING_LENS_MARKS).toBe(24);
    expect(glsl).toContain("#define USE_LENS");
    expect(glsl).toContain("uniform vec3 uLens;");
    expect(glsl).toContain("uniform vec2 uSize;");
    expect(glsl).toContain("uniform vec4 uMarks[24];");
  });
  it("cor real dentro da lente, borda de 2 px em osso e marcas lavando 35%", () => {
    expect(ENGRAVING_LENS_WASH).toBe(0.35);
    expect(glsl).toContain("smoothstep(uLens.z - 2.5, uLens.z - 2.0, dl)");
    expect(glsl).toContain("mix(col, uBone, on * ring)");
    expect(glsl).toContain("mix(col, real, mark * 0.35)");
  });
  it("sem tinta nem troca", () => {
    expect(glsl).not.toContain("#define USE_INK");
    expect(glsl).not.toContain("#define USE_SWAP");
  });
});

describe("buildEngravingFragment — troca (Relicário, spec 7.4)", () => {
  const glsl = buildEngravingFragment({ ink: false, swap: true });
  it("liga USE_SWAP e funde as fontes antes da gravura", () => {
    expect(glsl).toContain("#define USE_SWAP");
    expect(glsl).toContain("uniform sampler2D uTexNext;");
    expect(glsl).toContain("uniform vec4 uCropNext;");
    expect(glsl).toContain("c = mix(c, texture2D(uTexNext, uCropNext.xy + s * uCropNext.zw).rgb, uSwap);");
    expect(glsl).not.toContain("#define USE_LENS");
  });
});

describe("buildEngravingFragment — Gravura inalterada", () => {
  it("a variante da Fase 2 não liga lente nem troca", () => {
    const glsl = buildEngravingFragment({ ink: true });
    expect(glsl).not.toContain("#define USE_LENS");
    expect(glsl).not.toContain("#define USE_SWAP");
  });
  it("as curvas do protótipo existem em todas as variantes", () => {
    for (const glsl of [
      buildEngravingFragment({ ink: false, lens: true }),
      buildEngravingFragment({ ink: false, swap: true }),
    ]) {
      expect(glsl).toContain("smoothstep(0.03, 0.62, luma(c))");
      expect(glsl).toContain("(1.0 - l) * 0.98 - 0.06");
      expect(glsl).toContain("step(l, 0.2)");
    }
  });
});
