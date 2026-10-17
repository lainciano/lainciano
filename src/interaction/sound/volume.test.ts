import { describe, expect, it } from "vitest";
import { canPreview } from "@/interaction/sound/policy";
import { DEFAULT_VOLUME, parseVolume, volumeToGain, volumeToPercent } from "@/interaction/sound/volume";

describe("parseVolume", () => {
  it("lê números de 0 a 1 e cai no padrão com lixo", () => {
    expect(parseVolume("0.5")).toBe(0.5);
    expect(parseVolume("0")).toBe(0);
    expect(parseVolume("1")).toBe(1);
    expect(parseVolume(null)).toBe(DEFAULT_VOLUME);
    expect(parseVolume("alto")).toBe(DEFAULT_VOLUME);
    expect(parseVolume("")).toBe(DEFAULT_VOLUME);
  });
  it("prende fora da faixa", () => {
    expect(parseVolume("3")).toBe(1);
    expect(parseVolume("-2")).toBe(0);
  });
});

describe("volumeToGain (curva perceptual)", () => {
  it("0 = silêncio, 1 = ganho cheio, crescente", () => {
    expect(volumeToGain(0)).toBe(0);
    expect(volumeToGain(1)).toBe(1);
    expect(volumeToGain(0.6)).toBeGreaterThan(volumeToGain(0.3));
  });
  it("o volume padrão equivale ao ganho que o site já tinha (≈ 0,6)", () => {
    expect(volumeToGain(DEFAULT_VOLUME)).toBeGreaterThan(0.55);
    expect(volumeToGain(DEFAULT_VOLUME)).toBeLessThan(0.7);
  });
  it("metade do controle é bem mais baixa que metade do ganho (ouvido é logarítmico)", () => {
    expect(volumeToGain(0.5)).toBeLessThan(0.5);
  });
});

describe("volumeToPercent", () => {
  it("arredonda para o rótulo do controle", () => {
    expect(volumeToPercent(0.8)).toBe(80);
    expect(volumeToPercent(0.333)).toBe(33);
  });
});

describe("canPreview (prévia do volume antes de escolher som)", () => {
  it("toca no Portal (sem escolha ainda) e com som ligado", () => {
    expect(canPreview(null, false)).toBe(true);
    expect(canPreview("on", false)).toBe(true);
  });
  it("nunca com som desligado de propósito nem em modo leitura", () => {
    expect(canPreview("off", false)).toBe(false);
    expect(canPreview(null, true)).toBe(false);
    expect(canPreview("on", true)).toBe(false);
  });
});
