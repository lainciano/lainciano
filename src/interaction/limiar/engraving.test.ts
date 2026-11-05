import { describe, expect, it } from "vitest";
import { lineWidths, waveOffset } from "@/interaction/limiar/engraving";

describe("lineWidths", () => {
  const w = 20;
  const h = 10;

  it("máscara toda zero dá larguras 0", () => {
    const out = lineWidths(new Uint8ClampedArray(w * h), w, h, 5, 12);
    expect(out.flat().every((v) => v === 0)).toBe(true);
  });

  it("máscara toda 255 dá maxWidth em todas", () => {
    const out = lineWidths(new Uint8ClampedArray(w * h).fill(255), w, h, 5, 12);
    expect(out.flat().every((v) => v === 12)).toBe(true);
  });

  it("devolve rows linhas", () => {
    expect(lineWidths(new Uint8ClampedArray(w * h), w, h, 7, 12)).toHaveLength(7);
  });

  it("metade acesa dá metade da largura", () => {
    const mask = new Uint8ClampedArray(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w / 2; x++) mask[y * w + x] = 255;
    const out = lineWidths(mask, w, h, 2, 10);
    // cada linha tem colunas; a soma das larguras ~ metade das colunas * maxWidth
    const first = out[0];
    expect(first.some((v) => v === 10)).toBe(true);
    expect(first.some((v) => v === 0)).toBe(true);
  });
});

describe("waveOffset", () => {
  it("é 0 com pointer nulo", () => {
    expect(waveOffset(10, 10, null, 100)).toBe(0);
  });

  it("é 0 fora do radius", () => {
    expect(waveOffset(500, 500, { x: 0, y: 0 }, 100)).toBe(0);
  });

  it("é diferente de 0 dentro do radius fora do centro", () => {
    expect(waveOffset(30, 0, { x: 0, y: 0 }, 100)).not.toBe(0);
  });
});
