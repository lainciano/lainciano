import { describe, expect, it } from "vitest";
import { coverCrop } from "@/rooms/shared/cover";

describe("coverCrop", () => {
  it("imagem mais larga que a moldura: corta as laterais, centrado", () => {
    const crop = coverCrop(2, 1.6); // 2:1 numa moldura 16:10
    expect(crop.x0).toBeCloseTo(0.1);
    expect(crop.x1).toBeCloseTo(0.9);
    expect(crop.y0).toBe(0);
    expect(crop.y1).toBe(1);
  });
  it("imagem mais alta que a moldura: corta embaixo e mantém o topo (cabeçalho da captura)", () => {
    const crop = coverCrop(1, 2); // quadrada numa moldura 2:1 → mostra metade da altura
    expect(crop.x0).toBe(0);
    expect(crop.x1).toBe(1);
    expect(crop.y1).toBe(1); // UV com y para cima: 1 = topo
    expect(crop.y0).toBeCloseTo(0.5);
  });
  it("mesma proporção: imagem inteira; proporção inválida: imagem inteira", () => {
    expect(coverCrop(16 / 9, 16 / 9)).toEqual({ x0: 0, x1: 1, y0: 0, y1: 1 });
    expect(coverCrop(0, 1.6)).toEqual({ x0: 0, x1: 1, y0: 0, y1: 1 });
  });
});
