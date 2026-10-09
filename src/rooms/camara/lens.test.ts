import { describe, expect, it } from "vitest";
import {
  LENS,
  addMark,
  chargeOf,
  createMarks,
  fadeMarks,
  lensRadii,
  lensTarget,
  moveLensByKey,
  pxToUv,
  shouldMark,
  stepLensRadius,
} from "@/rooms/camara/lens";

const desk = lensRadii(false);

describe("raios (spec 7.5; D16)", () => {
  it("desktop 90 → 180; toque 64 → 128", () => {
    expect(desk).toEqual({ base: 90, max: 180 });
    expect(lensRadii(true)).toEqual({ base: 64, max: 128 });
  });
  it("alvo: fechada 0, aberta base, segurando máximo", () => {
    expect(lensTarget(false, true, desk)).toBe(0);
    expect(lensTarget(true, false, desk)).toBe(90);
    expect(lensTarget(true, true, desk)).toBe(180);
  });
});

describe("stepLensRadius", () => {
  it("abre rápido até a base (0,6 px/ms)", () => {
    expect(stepLensRadius(0, 90, 100, 90)).toBeCloseTo(60);
    expect(stepLensRadius(60, 90, 100, 90)).toBe(90);
  });
  it("cresce devagar ao segurar: base → máximo em 600 ms", () => {
    let r = 90;
    for (let t = 0; t < 600; t += 16) r = stepLensRadius(r, 180, 16, 90);
    expect(r).toBeGreaterThan(178);
    expect(stepLensRadius(90, 180, 300, 90)).toBeCloseTo(135);
  });
  it("encolhe rápido ao soltar e nunca passa do alvo", () => {
    expect(stepLensRadius(180, 90, 100, 90)).toBeCloseTo(120);
    expect(stepLensRadius(100, 90, 1000, 90)).toBe(90);
    expect(stepLensRadius(30, 0, 1000, 90)).toBe(0);
  });
  it("carga do anel: 0 na base, 1 no máximo", () => {
    expect(chargeOf(90, desk)).toBe(0);
    expect(chargeOf(135, desk)).toBeCloseTo(0.5);
    expect(chargeOf(200, desk)).toBe(1);
    expect(chargeOf(40, desk)).toBe(0);
  });
});

describe("moveLensByKey", () => {
  const size = { width: 900, height: 506 };
  it("setas andam 24 px; com Shift, 72 px", () => {
    expect(moveLensByKey({ x: 450, y: 253 }, "ArrowRight", size, false)).toEqual({ x: 474, y: 253 });
    expect(moveLensByKey({ x: 450, y: 253 }, "ArrowUp", size, true)).toEqual({ x: 450, y: 181 });
  });
  it("não sai da captura", () => {
    expect(moveLensByKey({ x: 10, y: 500 }, "ArrowLeft", size, true)).toEqual({ x: 0, y: 500 });
    expect(moveLensByKey({ x: 10, y: 500 }, "ArrowDown", size, true)).toEqual({ x: 10, y: 506 });
  });
  it("outras teclas: null", () => {
    expect(moveLensByKey({ x: 0, y: 0 }, "a", size, false)).toBeNull();
  });
});

describe("pxToUv", () => {
  it("origem embaixo à esquerda, como no WebGL", () => {
    expect(pxToUv(0, 0, 200, 100)).toEqual([0, 1]);
    expect(pxToUv(200, 100, 200, 100)).toEqual([1, 0]);
  });
});

describe("marcas da área revelada", () => {
  it("marca ao andar 0,35 × raio, ou a cada 150 ms segurando", () => {
    const marks = createMarks();
    expect(shouldMark(marks, 100, 100, 90, false, 0)).toBe(true);
    addMark(marks, 0.1, 0.8, 90, 100, 100, 0);
    expect(shouldMark(marks, 120, 100, 90, false, 50)).toBe(false);
    expect(shouldMark(marks, 132, 100, 90, false, 50)).toBe(true);
    expect(shouldMark(marks, 100, 100, 90, true, 150)).toBe(true);
    expect(shouldMark(marks, 100, 100, 0, true, 999)).toBe(false);
  });
  it("guarda x, y, raio e força 1 num anel de 24 posições", () => {
    const marks = createMarks();
    addMark(marks, 0.25, 0.5, 90, 0, 0, 0);
    expect(Array.from(marks.data.slice(0, 4))).toEqual([0.25, 0.5, 90, 1]);
    for (let i = 0; i < LENS.marks; i += 1) addMark(marks, 0, 0, 1, i * 999, 0, 0);
    expect(marks.next).toBe(1);
  });
  it("desvanece em 3 s e avisa quando acabou", () => {
    const marks = createMarks();
    addMark(marks, 0.5, 0.5, 90, 0, 0, 0);
    expect(fadeMarks(marks, 1500)).toBe(true);
    expect(marks.data[3]).toBeCloseTo(0.5);
    expect(fadeMarks(marks, 1500)).toBe(false);
    expect(marks.data[3]).toBe(0);
  });
});
