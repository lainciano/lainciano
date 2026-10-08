import { describe, expect, it } from "vitest";
import { ENGRAVING_TRAIL_POINTS } from "@/rooms/shared/engravingShader";
import { INK, TEAR, beginHold, createInk, endHold, hoverInk, pushInk, stepInk, tearGain } from "@/rooms/gravura/ink";

const FRAME = 1000 / 60;
const still = () => 0.5; // sem jitter

describe("INK", () => {
  it("números do protótipo (salas.html, gravura())", () => {
    expect(INK).toMatchObject({
      hoverStrength: 0.32,
      holdStartForce: 0.3,
      holdForceStep: 0.035,
      holdMaxForce: 1.5,
      decayFree: 0.962,
      decayHolding: 0.992,
      epsilon: 0.002,
      jitter: 0.02,
      holdRelicMs: 1400,
    });
    expect(INK.points).toBe(ENGRAVING_TRAIL_POINTS);
  });
});

describe("rastro", () => {
  it("passar o mouse grava um ponto com força 0,32", () => {
    const s = createInk();
    hoverInk(s, 0.2, 0.3);
    expect(s.trail[0]).toBeCloseTo(0.2);
    expect(s.trail[1]).toBeCloseTo(0.3);
    expect(s.trail[2]).toBeCloseTo(0.32);
    expect(s.next).toBe(1);
    expect(s.inside).toBe(true);
  });
  it("o anel de 24 pontos dá a volta", () => {
    const s = createInk();
    for (let i = 0; i < 25; i += 1) pushInk(s, i / 100, 0, 0.5);
    expect(s.next).toBe(1);
    expect(s.trail[0]).toBeCloseTo(0.24);
  });
  it("solto, decai 0,962 por quadro de 60 Hz", () => {
    const s = createInk();
    pushInk(s, 0.5, 0.5, 1);
    stepInk(s, 0, FRAME, still);
    expect(s.trail[2]).toBeCloseTo(0.962, 5);
  });
  it("a 120 Hz, dois quadros equivalem a um de 60 Hz", () => {
    const s = createInk();
    pushInk(s, 0.5, 0.5, 1);
    stepInk(s, 0, FRAME / 2, still);
    stepInk(s, 0, FRAME / 2, still);
    expect(s.trail[2]).toBeCloseTo(0.962, 5);
  });
  it("abaixo de 0,002 zera e a cena pode dormir", () => {
    const s = createInk();
    pushInk(s, 0.5, 0.5, 0.0019);
    const step = stepInk(s, 0, FRAME, still);
    expect(s.trail[2]).toBe(0);
    expect(step.active).toBe(false);
  });
});

describe("segurar", () => {
  it("força começa em 0,3, sobe 0,035 por quadro e para em 1,5", () => {
    const s = createInk();
    beginHold(s, 0.5, 0.5, 0);
    stepInk(s, FRAME, FRAME, still);
    expect(s.force).toBeCloseTo(0.335);
    for (let i = 0; i < 100; i += 1) stepInk(s, FRAME * (i + 2), FRAME, still);
    expect(s.force).toBe(1.5);
  });
  it("segurando, o rastro decai só 0,992", () => {
    const s = createInk();
    pushInk(s, 0.1, 0.1, 1);
    beginHold(s, 0.5, 0.5, 0);
    stepInk(s, FRAME, FRAME, still);
    expect(s.trail[2]).toBeCloseTo(0.992, 5);
  });
  it("relíquia Sangue: progresso 0,5 em 700 ms e 1 em 1,4 s", () => {
    const s = createInk();
    beginHold(s, 0.5, 0.5, 1000);
    expect(stepInk(s, 1700, FRAME, still).holdProgress).toBeCloseTo(0.5);
    expect(stepInk(s, 2400, FRAME, still).holdProgress).toBe(1);
    expect(stepInk(s, 9999, FRAME, still).holdProgress).toBe(1);
  });
  it("jitter de ±0,01 em torno do ponto segurado", () => {
    const s = createInk();
    beginHold(s, 0.5, 0.5, 0);
    stepInk(s, 0, FRAME, () => 1);
    expect(s.trail[0]).toBeCloseTo(0.51);
  });
  it("mover segurando só muda o alvo (não grava ponto de hover)", () => {
    const s = createInk();
    beginHold(s, 0.5, 0.5, 0);
    hoverInk(s, 0.2, 0.2);
    expect(s.next).toBe(0);
    expect(s.last).toEqual([0.2, 0.2]);
  });
  it("soltar encerra e diz se havia algo segurado", () => {
    const s = createInk();
    expect(endHold(s)).toBe(false);
    beginHold(s, 0.5, 0.5, 0);
    expect(endHold(s)).toBe(true);
    expect(s.holding).toBe(false);
  });
});

describe("escorrer ao soltar (decisão do dono, 8 out 2026)", () => {
  it("o sangue solto desce (y diminui) proporcional à força", () => {
    const s = createInk();
    pushInk(s, 0.5, 0.5, 1, true);
    pushInk(s, 0.5, 0.5, 0.25, true);
    stepInk(s, 0, FRAME, still);
    expect(s.trail[1]).toBeCloseTo(0.5 - INK.drip * 1, 6);
    expect(s.trail[4]).toBeCloseTo(0.5 - INK.drip * 0.25, 6);
    expect(s.trail[0]).toBeCloseTo(0.5, 6); // x não anda
  });
  it("o corte do mouse (passagem) NÃO escorre: continua estático como no protótipo", () => {
    const s = createInk();
    hoverInk(s, 0.5, 0.5);
    for (let i = 0; i < 30; i += 1) stepInk(s, i * FRAME, FRAME, still);
    expect(s.trail[1]).toBeCloseTo(0.5, 6);
  });
  it("só os pontos derramados segurando escorrem; os de passagem ao lado não", () => {
    const s = createInk();
    hoverInk(s, 0.2, 0.7);
    beginHold(s, 0.8, 0.7, 0);
    stepInk(s, 0, FRAME, still); // derrama 1 ponto de sangue
    endHold(s);
    stepInk(s, FRAME, FRAME, still);
    expect(s.trail[1]).toBeCloseTo(0.7, 6);
    expect(s.trail[4]).toBeLessThan(0.7);
  });
  it("segurando, o sangue fica onde está", () => {
    const s = createInk();
    pushInk(s, 0.1, 0.8, 1, true);
    beginHold(s, 0.5, 0.5, 0);
    stepInk(s, FRAME, FRAME, still);
    expect(s.trail[1]).toBeCloseTo(0.8, 6);
  });
  it("a 120 Hz, dois quadros descem o mesmo que um de 60 Hz", () => {
    const a = createInk();
    const b = createInk();
    pushInk(a, 0.5, 0.5, 1, true);
    pushInk(b, 0.5, 0.5, 1, true);
    stepInk(a, 0, FRAME, still);
    stepInk(b, 0, FRAME / 2, still);
    stepInk(b, 0, FRAME / 2, still);
    expect(b.trail[1]).toBeCloseTo(a.trail[1], 3);
  });
  it("escorre mas sempre desvanece: some em menos de 3 s", () => {
    const s = createInk();
    pushInk(s, 0.5, 0.8, 1.5, true);
    let frames = 0;
    while (stepInk(s, 0, FRAME, still).active && frames < 1000) frames += 1;
    expect(frames).toBeLessThan(180);
    expect(s.trail[1]).toBeLessThan(0.8);
  });
});

describe("tearGain (rasgo ao mover rápido, spec 7.3)", () => {
  it("silêncio devagar, volume pela velocidade, máximo 1", () => {
    expect(tearGain(TEAR.minSpeed - 0.1)).toBe(0);
    expect(tearGain(TEAR.minSpeed)).toBeCloseTo(0.1);
    expect(tearGain(TEAR.fullSpeed)).toBeCloseTo(1);
    expect(tearGain(10)).toBe(1);
  });
});
