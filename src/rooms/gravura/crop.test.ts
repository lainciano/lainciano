import { describe, expect, it } from "vitest";
import { PORTRAIT, cropToCssBox, cropToUniform, pointToUv } from "@/rooms/gravura/crop";

describe("recorte do retrato (spec 7.3: x 0.29–0.615, y 0.07–0.88)", () => {
  it("uCrop do shader = (x0, y0, largura, altura), como no protótipo", () => {
    const [x, y, w, h] = cropToUniform(PORTRAIT.crop);
    expect(x).toBeCloseTo(0.29);
    expect(y).toBeCloseTo(0.07);
    expect(w).toBeCloseTo(0.325);
    expect(h).toBeCloseTo(0.81);
  });
  it("o recorte da foto dá ~3:5, a proporção da moldura", () => {
    const { crop, width, height } = PORTRAIT;
    const aspect = ((crop.x1 - crop.x0) * width) / ((crop.y1 - crop.y0) * height);
    expect(aspect).toBeCloseTo(0.6, 2);
  });
  it("a caixa CSS do estático mostra a mesma região (y da textura é de baixo para cima)", () => {
    expect(cropToCssBox(PORTRAIT.crop)).toEqual({
      width: "307.692%",
      height: "123.457%",
      left: "-89.231%",
      top: "-14.815%",
    });
  });
});

describe("pointToUv", () => {
  it("centro e canto superior esquerdo", () => {
    const rect = { left: 100, top: 50, width: 200, height: 400 };
    expect(pointToUv(200, 250, rect)).toEqual([0.5, 0.5]);
    expect(pointToUv(100, 50, rect)).toEqual([0, 1]);
  });
});
