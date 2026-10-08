import { describe, expect, it } from "vitest";
import { fillBrown, fillPink } from "@/interaction/sound/noise";

const seeded = (seed = 1) => () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

function energy(data: Float32Array, from: number, to: number) {
  // diferença de primeira ordem = proxy de energia em altas frequências
  let sum = 0;
  for (let i = from + 1; i < to; i += 1) sum += (data[i] - data[i - 1]) ** 2;
  return sum / (to - from);
}

describe("ruído marrom e rosa", () => {
  it("ficam entre −1 e 1 e não são silêncio", () => {
    for (const fill of [fillBrown, fillPink]) {
      const data = new Float32Array(20000);
      fill(data, seeded());
      expect(Math.max(...data)).toBeLessThanOrEqual(1);
      expect(Math.min(...data)).toBeGreaterThanOrEqual(-1);
      expect(Math.max(...data)).toBeGreaterThan(0.1);
    }
  });
  it("marrom é mais grave (menos energia em alta frequência) que rosa", () => {
    const brown = new Float32Array(20000);
    const pink = new Float32Array(20000);
    fillBrown(brown, seeded(3));
    fillPink(pink, seeded(3));
    const rms = (d: Float32Array) => Math.sqrt(d.reduce((a, v) => a + v * v, 0) / d.length);
    const nb = energy(brown, 0, brown.length) / rms(brown) ** 2;
    const np = energy(pink, 0, pink.length) / rms(pink) ** 2;
    expect(nb).toBeLessThan(np);
  });
});
