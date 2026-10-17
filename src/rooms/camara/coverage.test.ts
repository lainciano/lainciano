import { describe, expect, it } from "vitest";
import { COVERAGE, cellOf, coverageRatio, createCoverage, isRevealed, visitCircle } from "@/rooms/camara/coverage";

describe("COVERAGE", () => {
  it("grade 12×8 e meta de 80% (spec 7.5)", () => {
    expect(COVERAGE).toEqual({ cols: 12, rows: 8, goal: 0.8 });
  });
});

describe("cellOf", () => {
  it("frações 0–1 (y de cima para baixo) → índice da célula", () => {
    expect(cellOf(0, 0, 12, 8)).toBe(0);
    expect(cellOf(0.99, 0, 12, 8)).toBe(11);
    expect(cellOf(0, 0.99, 12, 8)).toBe(84);
    expect(cellOf(1, 1, 12, 8)).toBe(95);
  });
  it("fora da captura: null", () => {
    expect(cellOf(-0.01, 0.5, 12, 8)).toBeNull();
    expect(cellOf(0.5, 1.01, 12, 8)).toBeNull();
    expect(cellOf(Number.NaN, 0.5, 12, 8)).toBeNull();
  });
});

describe("visitCircle", () => {
  const w = 960;
  const h = 640; // células de 80×80
  it("lente pequena marca ao menos a célula sob o centro", () => {
    const cov = createCoverage();
    expect(visitCircle(cov, 10, 10, 1, w, h)).toBe(1);
    expect(cov.cells[0]).toBe(1);
  });
  it("marca as células cujo centro está dentro do círculo, sem contar duas vezes", () => {
    const cov = createCoverage();
    // centro em (80, 80): centros (40,40) (120,40) (40,120) (120,120) a 56,6 px
    expect(visitCircle(cov, 80, 80, 60, w, h)).toBe(4);
    expect(visitCircle(cov, 80, 80, 60, w, h)).toBe(0);
  });
  it("varrer cada fileira com a lente de 90 px revela tudo", () => {
    const cov = createCoverage();
    for (let row = 0; row < 8; row += 1) {
      for (let x = 0; x <= w; x += 24) visitCircle(cov, x, row * 80 + 40, 90, w, h);
    }
    expect(coverageRatio(cov)).toBe(1);
  });
});

describe("isRevealed", () => {
  it("77 de 96 células passa (80,2%); 76 não (79,2%)", () => {
    const cov = createCoverage();
    for (let i = 0; i < 76; i += 1) {
      cov.cells[i] = 1;
      cov.visited += 1;
    }
    expect(isRevealed(cov)).toBe(false);
    cov.cells[76] = 1;
    cov.visited += 1;
    expect(isRevealed(cov)).toBe(true);
  });
});
