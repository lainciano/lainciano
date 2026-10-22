import { describe, expect, it } from "vitest";
import {
  ENGRAVING_ROWS,
  MAX_DPR,
  capDpr,
  engravingRows,
  fitFontSize,
  maskSize,
  rowRuns,
  sweepProgress,
} from "@/interaction/limiar/acts/opening-plan";

describe("engravingRows", () => {
  it("fica entre 90 e 140 para qualquer altura", () => {
    for (const h of [0, 120, 480, 700, 812, 1080, 2160, Number.NaN, -10]) {
      const rows = engravingRows(h);
      expect(rows).toBeGreaterThanOrEqual(ENGRAVING_ROWS[0]);
      expect(rows).toBeLessThanOrEqual(ENGRAVING_ROWS[1]);
    }
  });

  it("cresce com a altura dentro da faixa", () => {
    expect(engravingRows(700)).toBeLessThan(engravingRows(900));
    expect(engravingRows(600)).toBe(90);
    expect(engravingRows(1200)).toBe(140);
  });
});

describe("capDpr", () => {
  it("limita a 2 e nunca desce de 1", () => {
    expect(capDpr(3)).toBe(MAX_DPR);
    expect(capDpr(1.5)).toBe(1.5);
    expect(capDpr(0.5)).toBe(1);
    expect(capDpr(Number.NaN)).toBe(1);
  });
});

describe("maskSize", () => {
  it("divide pela escala e nunca dá zero", () => {
    expect(maskSize(1280, 720, 3)).toEqual({ width: 427, height: 240 });
    expect(maskSize(0, 0, 3)).toEqual({ width: 1, height: 1 });
  });
});

describe("fitFontSize", () => {
  it("limita pela largura quando o texto é largo", () => {
    // medido a 100px: 500 × 100; caixa 1000 × 400 → largura manda (×2)
    expect(fitFontSize({ width: 1000, height: 400 }, { width: 500, height: 100 }, 100)).toBe(200);
  });

  it("limita pela altura quando a caixa é baixa", () => {
    expect(fitFontSize({ width: 1000, height: 150 }, { width: 500, height: 100 }, 100)).toBe(150);
  });

  it("medida inválida dá 0", () => {
    expect(fitFontSize({ width: 1000, height: 150 }, { width: 0, height: 100 }, 100)).toBe(0);
  });
});

describe("sweepProgress", () => {
  it("vai de 0 a 1 e para no fim", () => {
    expect(sweepProgress(0, 2400)).toBe(0);
    expect(sweepProgress(1200, 2400)).toBeCloseTo(0.5);
    expect(sweepProgress(2400, 2400)).toBe(1);
    expect(sweepProgress(9999, 2400)).toBe(1);
    expect(sweepProgress(-50, 2400)).toBe(0);
  });

  it("é monótona", () => {
    let last = -1;
    for (let t = 0; t <= 2400; t += 100) {
      const p = sweepProgress(t, 2400);
      expect(p).toBeGreaterThanOrEqual(last);
      last = p;
    }
  });

  it("duração zero já está pronta (movimento reduzido)", () => {
    expect(sweepProgress(0, 0)).toBe(1);
  });
});

describe("rowRuns", () => {
  it("acha os trechos acesos, inclusive no fim", () => {
    expect(rowRuns([0, 1, 1, 0, 0, 2, 0, 3, 3], 0.2)).toEqual([
      [1, 3],
      [5, 6],
      [7, 9],
    ]);
  });

  it("linha apagada não tem trechos", () => {
    expect(rowRuns([0, 0.1, 0], 0.2)).toEqual([]);
  });
});
