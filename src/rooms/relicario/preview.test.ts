import { describe, expect, it } from "vitest";
import { PREVIEW, anchorPreview, placePreview, resolveSwap, stepSwap, tiltFor } from "@/rooms/relicario/preview";

const viewport = { width: 1280, height: 720 };
const size = { width: PREVIEW.width, height: PREVIEW.height };

describe("PREVIEW", () => {
  it("360×225 (16:10, spec 7.4) e troca em 250 ms", () => {
    expect(size).toEqual({ width: 360, height: 225 });
    expect(PREVIEW.swapMs).toBe(250);
  });
});

describe("placePreview", () => {
  it("abaixo e à direita do cursor, com folga", () => {
    expect(placePreview({ x: 100, y: 100 }, viewport)).toEqual({ x: 124, y: 124 });
  });
  it("perto da borda direita: inverte para a esquerda do cursor", () => {
    expect(placePreview({ x: 1200, y: 100 }, viewport).x).toBe(1200 - 24 - 360);
  });
  it("perto da borda de baixo: inverte para cima do cursor", () => {
    expect(placePreview({ x: 100, y: 700 }, viewport).y).toBe(700 - 24 - 225);
  });
  it("nunca sai da viewport (cantos)", () => {
    for (const pointer of [
      { x: 0, y: 0 },
      { x: 1280, y: 0 },
      { x: 0, y: 720 },
      { x: 1280, y: 720 },
      { x: 640, y: 360 },
    ]) {
      const { x, y } = placePreview(pointer, viewport);
      expect(x).toBeGreaterThanOrEqual(PREVIEW.margin);
      expect(y).toBeGreaterThanOrEqual(PREVIEW.margin);
      expect(x + size.width).toBeLessThanOrEqual(viewport.width - PREVIEW.margin);
      expect(y + size.height).toBeLessThanOrEqual(viewport.height - PREVIEW.margin);
    }
  });
  it("viewport menor que a prévia: encosta na margem", () => {
    expect(placePreview({ x: 50, y: 50 }, { width: 300, height: 200 })).toEqual({ x: 16, y: 16 });
  });
});

describe("anchorPreview (foco por teclado)", () => {
  it("à direita da linha, centrada na altura dela", () => {
    const row = { left: 64, right: 1216, top: 300, height: 96 };
    expect(anchorPreview(row, viewport)).toEqual({ x: 1216 - 360, y: 300 + 48 - 112.5 });
  });
  it("linha no topo ou no fim da tela: clampada", () => {
    expect(anchorPreview({ left: 0, right: 1280, top: -40, height: 80 }, viewport).y).toBe(16);
    expect(anchorPreview({ left: 0, right: 1280, top: 700, height: 80 }, viewport).y).toBe(720 - 16 - 225);
    expect(anchorPreview({ left: 0, right: 1280, top: 300, height: 80 }, viewport).x).toBe(1280 - 16 - 360);
  });
});

describe("tiltFor", () => {
  it("inclina com a velocidade horizontal, no máximo 6°", () => {
    expect(tiltFor(0)).toBe(0);
    expect(tiltFor(1)).toBe(3);
    expect(tiltFor(10)).toBe(6);
    expect(tiltFor(-10)).toBe(-6);
  });
});

describe("troca de textura", () => {
  it("avança em 250 ms e para em 1", () => {
    expect(stepSwap(0, 125)).toBeCloseTo(0.5);
    expect(stepSwap(0.9, 100)).toBe(1);
  });
  it("pedido novo no meio da fusão: passou da metade = consolida; antes = troca o destino", () => {
    expect(resolveSwap(0.5)).toBe("commit");
    expect(resolveSwap(0.8)).toBe("commit");
    expect(resolveSwap(0.2)).toBe("replace");
  });
});
