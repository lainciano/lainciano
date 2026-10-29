import { describe, expect, it } from "vitest";
import type { SurfaceMaterial } from "../world/surfaces";
import { FOOTSTEP_TAKES, footstepParams, nextSeed, stepInterval, takeOf } from "./footsteps";

const SURFACES: SurfaceMaterial[] = ["granilite", "tapete", "madeira", "tabua-solta", "metal", "papel", "vidro", "tecido", "ceramica"];

describe("stepInterval", () => {
  it("andar a 1,4 m/s dá ~0,55 s", () => {
    expect(stepInterval(1.4, false)).toBeCloseTo(0.55, 2);
  });
  it("correr é mais rápido que andar (~0,34 s)", () => {
    expect(stepInterval(2.6, false)).toBeLessThan(stepInterval(1.4, false));
    expect(stepInterval(2.6, false)).toBeCloseTo(0.34, 2);
  });
  it("agachado espaça ×1,4", () => {
    expect(stepInterval(1.4, true)).toBeCloseTo(stepInterval(1.4, false) * 1.4, 6);
    expect(stepInterval(1.4, true)).toBeGreaterThan(stepInterval(1.4, false));
  });
  it("velocidade inválida ou zero não explode", () => {
    for (const v of [0, -1, Number.NaN, Infinity]) {
      const s = stepInterval(v, false);
      expect(Number.isFinite(s)).toBe(true);
      expect(s).toBeGreaterThan(0);
    }
  });
});

describe("footstepParams", () => {
  it("a mesma semente dá os mesmos parâmetros", () => {
    for (const s of SURFACES) expect(footstepParams(s, 7)).toEqual(footstepParams(s, 7));
  });
  it("tapete é mais baixo que granilite em toda tomada", () => {
    for (let seed = 0; seed < 8; seed++) expect(footstepParams("tapete", seed).gain).toBeLessThan(footstepParams("granilite", seed).gain);
  });
  it("cada superfície tem de 3 a 5 tomadas diferentes", () => {
    for (const s of SURFACES) {
      const takes = new Set(Array.from({ length: 200 }, (_, seed) => JSON.stringify(footstepParams(s, seed))));
      expect(takes.size, s).toBeGreaterThanOrEqual(3);
      expect(takes.size, s).toBeLessThanOrEqual(5);
    }
  });
  it("só a tábua solta range", () => {
    for (const s of SURFACES) {
      const creak = footstepParams(s, 1).creak;
      if (s === "tabua-solta") {
        expect(creak).toBeDefined();
        expect(creak!.to).toBeLessThan(creak!.from);
      } else expect(creak, s).toBeUndefined();
    }
  });
  it("parâmetros sempre finitos e positivos", () => {
    for (const s of SURFACES) for (const seed of [0, 1, 2.7, -3, Number.NaN, 1e9]) {
      const p = footstepParams(s, seed);
      for (const v of [p.filter, p.q, p.gain, p.dur]) expect(v).toBeGreaterThan(0);
      expect(p.gain).toBeLessThanOrEqual(1);
    }
  });
});

describe("nextSeed", () => {
  it("nunca repete a tomada anterior e cobre todas", () => {
    let seed = 0;
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) {
      const next = nextSeed(seed, (i * 0.6180339887) % 1);
      expect(takeOf(next)).not.toBe(takeOf(seed));
      expect(next).toBeLessThan(FOOTSTEP_TAKES);
      seen.add(takeOf(next));
      seed = next;
    }
    expect(seen.size).toBe(FOOTSTEP_TAKES);
  });
  it("rand perto de 1 continua dentro das tomadas", () => {
    expect(takeOf(nextSeed(2, 0.9999999))).not.toBe(2);
  });
});
