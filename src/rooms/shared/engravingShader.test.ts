import { describe, expect, it } from "vitest";
import {
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
