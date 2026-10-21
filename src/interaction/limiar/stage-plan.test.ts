import { describe, expect, it } from "vitest";
import {
  GRAIN_FPS,
  irisRadius,
  shuffledOrder,
  slicePlan,
  stepAccumulator,
} from "@/interaction/limiar/stage-plan";

/** Gerador determinístico para os testes (LCG simples, saída em [0, 1)). */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe("shuffledOrder", () => {
  it("é uma permutação de 0..n-1", () => {
    const order = shuffledOrder(10, seeded(7));
    expect([...order].sort((a, b) => a - b)).toEqual([...Array(10).keys()]);
  });

  it("muda com a semente", () => {
    expect(shuffledOrder(10, seeded(1))).not.toEqual(shuffledOrder(10, seeded(2)));
  });
});

describe("slicePlan", () => {
  it("tem de 8 a 12 faixas, nos dois extremos do sorteio", () => {
    expect(slicePlan(() => 0)).toHaveLength(8);
    expect(slicePlan(() => 0.9999)).toHaveLength(12);
    for (let seed = 0; seed < 50; seed++) {
      const n = slicePlan(seeded(seed)).length;
      expect(n).toBeGreaterThanOrEqual(8);
      expect(n).toBeLessThanOrEqual(12);
    }
  });

  it("a ordem de entrada é uma permutação e os lados alternam nessa ordem", () => {
    const plan = slicePlan(seeded(3));
    const byOrder = [...plan].sort((a, b) => a.order - b.order);
    expect(byOrder.map((s) => s.order)).toEqual([...Array(plan.length).keys()]);
    byOrder.forEach((slice, i) => expect(slice.side).toBe(i % 2 === 0 ? -1 : 1));
  });

  it("as cores alternam por posição (--sangue e --linha)", () => {
    const plan = slicePlan(seeded(5));
    plan.forEach((slice, i) => {
      expect(slice.index).toBe(i);
      expect(slice.tone).toBe(i % 2 === 0 ? "sangue" : "linha");
    });
  });
});

describe("irisRadius", () => {
  it("do centro, cobre até os cantos", () => {
    expect(irisRadius({ x: 50, y: 50 }, 100, 100)).toBeGreaterThanOrEqual(Math.hypot(50, 50));
  });

  it("de um canto, alcança o canto oposto", () => {
    expect(irisRadius({ x: 0, y: 0 }, 300, 400)).toBeGreaterThanOrEqual(500);
  });
});

describe("stepAccumulator", () => {
  const frame = 1000 / GRAIN_FPS;

  it("só desenha quando o acumulado passa de um quadro", () => {
    const a = stepAccumulator(0, 16, frame);
    expect(a.due).toBe(false);
    const b = stepAccumulator(a.acc, frame, frame);
    expect(b.due).toBe(true);
    expect(b.acc).toBeLessThan(frame);
  });

  it("~12 desenhos por segundo a 60 fps", () => {
    let acc = 0;
    let draws = 0;
    for (let i = 0; i < 60; i++) {
      const step = stepAccumulator(acc, 1000 / 60, frame);
      acc = step.acc;
      if (step.due) draws++;
    }
    expect(draws).toBeGreaterThanOrEqual(11);
    expect(draws).toBeLessThanOrEqual(12);
  });

  it("um salto grande (aba de volta) desenha uma vez só e não acumula atraso", () => {
    const step = stepAccumulator(0, 5000, frame);
    expect(step.due).toBe(true);
    expect(step.acc).toBeLessThan(frame);
  });

  it("delta negativo não anda para trás", () => {
    expect(stepAccumulator(10, -50, frame)).toEqual({ acc: 10, due: false });
  });
});
