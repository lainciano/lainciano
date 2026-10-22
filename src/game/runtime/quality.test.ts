import { describe, expect, it } from "vitest";
import { downgrade, initialQuality, targetSize } from "./quality";

describe("qualidade", () => {
  it("desktop começa em 480, toque em 360", () => {
    expect(initialQuality(false, "auto")).toBe(480);
    expect(initialQuality(true, "auto")).toBe(360);
  });

  it("o ajuste manual vence o aparelho", () => {
    expect(initialQuality(true, 240)).toBe(240);
    expect(initialQuality(true, 480)).toBe(480);
    expect(initialQuality(false, 360)).toBe(360);
  });

  it("desce um degrau por vez e para no 240", () => {
    expect(downgrade(480)).toBe(360);
    expect(downgrade(360)).toBe(240);
    expect(downgrade(240)).toBe(240);
  });
});

describe("targetSize", () => {
  it("altura = linhas, largura = linhas × aspecto", () => {
    expect(targetSize(480, 16 / 9)).toEqual({ width: 853, height: 480 });
    expect(targetSize(360, 0.5)).toEqual({ width: 180, height: 360 });
  });

  it("nunca menor que 2 de largura; aspecto inválido (0, negativo, NaN) vira quadrado", () => {
    expect(targetSize(240, 0.001)).toEqual({ width: 2, height: 240 });
    expect(targetSize(240, 0)).toEqual({ width: 240, height: 240 });
    expect(targetSize(240, -1)).toEqual({ width: 240, height: 240 });
    expect(targetSize(240, Number.NaN)).toEqual({ width: 240, height: 240 });
  });
});
