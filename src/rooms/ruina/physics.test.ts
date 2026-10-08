import { describe, expect, it } from "vitest";
import {
  IMPACT,
  RUINA,
  arenaWalls,
  fixedSteps,
  impactGain,
  isDoubleTap,
  isThrown,
  opensCase,
  pushForce,
} from "@/rooms/ruina/physics";

describe("RUINA", () => {
  it("mantém os números aprovados do protótipo (salas.html, ruina())", () => {
    expect(RUINA).toMatchObject({
      gravityY: 1.15,
      wallThickness: 200,
      bodyScale: 0.92,
      chamferRadius: 3,
      restitution: 0.25,
      friction: 0.6,
      densitySlab: 0.004,
      densityGlyph: 0.0016,
      initialSpin: 0.08,
      dragStiffness: 0.18,
      dragDamping: 0.08,
      pushRadius: 110,
      pushForce: 0.0009,
      throwLimitY: -60,
      doubleTapMs: 380,
      collapseRatio: 0.6,
      collapseDelayMs: 500,
      shakePx: 6,
      restoreDuration: 0.7,
      restoreStagger: 0.02,
    });
  });
});

describe("isThrown (relíquia Arremesso)", () => {
  it("só acima de 60 px do topo da arena", () => {
    expect(isThrown(-61)).toBe(true);
    expect(isThrown(-60)).toBe(false);
    expect(isThrown(10)).toBe(false);
  });
});

describe("toque duplo (relíquia Case)", () => {
  it("mesmo corpo em menos de 380 ms", () => {
    expect(isDoubleTap({ id: 7, time: 1000 }, 7, 1379)).toBe(true);
    expect(isDoubleTap({ id: 7, time: 1000 }, 7, 1380)).toBe(false);
    expect(isDoubleTap({ id: 7, time: 1000 }, 8, 1100)).toBe(false);
    expect(isDoubleTap(null, 7, 1100)).toBe(false);
  });
  it("só laje abre case; letra não", () => {
    expect(opensCase(true, { id: 1, time: 0 }, 1, 200)).toBe(true);
    expect(opensCase(false, { id: 1, time: 0 }, 1, 200)).toBe(false);
  });
});

describe("pushForce", () => {
  it("empurra para fora, proporcional à massa, dentro de 110 px", () => {
    const force = pushForce(55, 0, 2);
    expect(force?.x).toBeCloseTo(0.0018);
    expect(force?.y).toBeCloseTo(0);
    expect(pushForce(0, -50, 1)?.y).toBeLessThan(0);
  });
  it("nada a partir de 110 px nem colado no ponteiro", () => {
    expect(pushForce(110, 0, 1)).toBeNull();
    expect(pushForce(0.5, 0, 1)).toBeNull();
  });
});

describe("impactGain (≤ 6 sons/s é do limitador)", () => {
  it("silêncio abaixo do limiar; mínimo audível no limiar; cheio a partir de 18", () => {
    expect(impactGain(IMPACT.minSpeed - 0.1)).toBe(0);
    expect(impactGain(IMPACT.minSpeed)).toBe(IMPACT.minGain);
    expect(impactGain(IMPACT.fullSpeed)).toBe(1);
    expect(impactGain(40)).toBe(1);
  });
  it("cresce com a velocidade", () => {
    expect(impactGain(12)).toBeGreaterThan(impactGain(8));
  });
  it("máximo de 6 por segundo", () => {
    expect(IMPACT.maxPerSecond).toBe(6);
  });
});

describe("fixedSteps (passo fixo de 1/60 s)", () => {
  it("60 Hz com jitter = exatamente 1 passo por quadro", () => {
    let acc = 0;
    for (const delta of [16.5, 16.9, 16.4, 16.8, 16.6, 16.7, 16.3, 17.0]) {
      const { steps, rest } = fixedSteps(acc, delta);
      expect(steps).toBe(1);
      acc = rest;
    }
  });
  it("120 Hz = 1 passo a cada 2 quadros", () => {
    let acc = 0;
    const steps: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const out = fixedSteps(acc, 1000 / 120);
      steps.push(out.steps);
      acc = out.rest;
    }
    expect(steps).toEqual([0, 1, 0, 1, 0, 1]);
  });
  it("quadro longo (aba voltando) vira no máximo 3 passos", () => {
    expect(fixedSteps(0, 500).steps).toBe(RUINA.maxStepsPerFrame);
  });
});

describe("arenaWalls", () => {
  it("chão e duas paredes altas, sem teto", () => {
    const [floor, left, right] = arenaWalls(1000, 600);
    expect(floor).toEqual({ x: 500, y: 700, width: 3000, height: 200 });
    expect(left).toEqual({ x: -100, y: -300, width: 200, height: 2400 });
    expect(right).toEqual({ x: 1100, y: -300, width: 200, height: 2400 });
    expect(arenaWalls(1000, 600)).toHaveLength(3);
  });
});
