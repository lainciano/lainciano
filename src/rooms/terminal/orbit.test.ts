import { describe, expect, it } from "vitest";
import { ASCII, ORBIT, type Spin, dragSpin, easeToward, framesOf, isOrbit, keySpin, settleSpin, tiltFor } from "@/rooms/terminal/orbit";

describe("números do protótipo (altar ASCII)", () => {
  it("charset, resolução e limiar da Órbita", () => {
    expect(ASCII.charset).toBe(" .:-=+*#%@");
    expect(ASCII.resolution).toBe(0.17);
    expect(ASCII.resolutionCoarse).toBe(0.12);
    expect(ORBIT.threshold).toBe(0.32);
  });
});

describe("framesOf (D17)", () => {
  it("60 Hz = 1 quadro; 120 Hz = meio; pausa longa é limitada", () => {
    expect(framesOf(1000 / 60)).toBeCloseTo(1);
    expect(framesOf(1000 / 120)).toBeCloseTo(0.5);
    expect(framesOf(1000)).toBe(4);
    expect(framesOf(-5)).toBe(0);
  });
});

describe("arrasto e Órbita", () => {
  it("arrasto horizontal gira em y, vertical em x (×0.004)", () => {
    expect(dragSpin(10, 0)).toEqual({ x: 0, y: 0.04 });
    expect(dragSpin(0, -50)).toEqual({ x: -0.2, y: 0 });
  });
  it("Órbita só acima de 0,32 em qualquer eixo", () => {
    expect(isOrbit({ x: 0, y: 0.32 })).toBe(false);
    expect(isOrbit({ x: 0, y: 0.321 })).toBe(true);
    expect(isOrbit({ x: -0.4, y: 0 })).toBe(true);
    expect(isOrbit(dragSpin(81, 0))).toBe(true); // 81 px num movimento
  });
});

describe("retorno ao giro lento", () => {
  it("1 quadro = fórmula do protótipo (v += (idle − v) · 0.02)", () => {
    const next = settleSpin({ x: 0.5, y: -0.5 }, 1);
    expect(next.x).toBeCloseTo(0.5 + (ORBIT.idle.x - 0.5) * 0.02);
    expect(next.y).toBeCloseTo(-0.5 + (ORBIT.idle.y + 0.5) * 0.02);
  });
  it("2 quadros de uma vez = 2 passos de 1 quadro", () => {
    const twice = settleSpin(settleSpin({ x: 0.5, y: 0.5 }, 1), 1);
    const once = settleSpin({ x: 0.5, y: 0.5 }, 2);
    expect(once.x).toBeCloseTo(twice.x);
    expect(once.y).toBeCloseTo(twice.y);
  });
  it("converge para o giro lento", () => {
    let spin = { x: 0.6, y: 0.6 };
    for (let i = 0; i < 600; i += 1) spin = settleSpin(spin, 1);
    expect(spin.x).toBeCloseTo(ORBIT.idle.x, 4);
    expect(spin.y).toBeCloseTo(ORBIT.idle.y, 4);
  });
});

describe("setas seguradas (D18)", () => {
  it("passa do limiar em 11 quadros a 60 Hz", () => {
    let spin: Spin = { ...ORBIT.idle };
    let frames = 0;
    while (!isOrbit(spin)) {
      spin = keySpin(spin, 1, 1);
      frames += 1;
    }
    expect(frames).toBe(11);
  });
  it("tem teto e respeita a direção", () => {
    let spin: Spin = { ...ORBIT.idle };
    for (let i = 0; i < 100; i += 1) spin = keySpin(spin, -1, 1);
    expect(spin.y).toBe(-ORBIT.keyMax);
  });
});

describe("inclinação pelo cursor", () => {
  it("centro = 0; cantos = ±0,3 rad", () => {
    expect(tiltFor(0.5, 0.5)).toEqual({ x: 0, y: 0 });
    expect(tiltFor(0, 0)).toEqual({ x: -0.3, y: -0.3 });
    expect(tiltFor(1, 1)).toEqual({ x: 0.3, y: 0.3 });
  });
  it("easeToward: 1 quadro = protótipo (k = 0.08)", () => {
    expect(easeToward(0, 1, ORBIT.tiltEase, 1)).toBeCloseTo(0.08);
  });
});
