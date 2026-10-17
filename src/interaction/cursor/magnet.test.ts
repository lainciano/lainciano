import { describe, expect, it } from "vitest";
import { MAGNET, magnetOffset } from "@/interaction/cursor/magnet";

const rect = (width: number, height: number) => ({ left: 100, top: 100, width, height });

describe("magnetOffset (o anel nunca se afasta do mouse)", () => {
  it("alvo pequeno: puxa 30% em direção ao centro", () => {
    const o = magnetOffset(100, 100, rect(80, 40)); // centro em (140, 120)
    expect(o.x).toBeCloseTo(12);
    expect(o.y).toBeCloseTo(6);
  });
  it("o puxão tem teto (14 px): linha larga não arrasta o anel para longe do mouse", () => {
    const o = magnetOffset(100, 100, rect(300, 60));
    expect(Math.hypot(o.x, o.y)).toBeLessThanOrEqual(MAGNET.maxPx + 1e-9);
  });
  it("alvo grande (linha de blog de 1100×150): sem ímã, o anel segue o mouse", () => {
    expect(magnetOffset(300, 500, { left: 64, top: 480, width: 1100, height: 150 })).toEqual({ x: 0, y: 0 });
  });
  it("mouse já no centro: sem deslocamento", () => {
    expect(magnetOffset(140, 120, rect(80, 40))).toEqual({ x: 0, y: 0 });
  });
});
