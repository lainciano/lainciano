import { describe, expect, it } from "vitest";
import { clampDist, clampPitch, createOrbit, DIST_MAX, DIST_MIN, drag, eye, fitDistance, PITCH_LIMIT, release, step, zoom } from "./orbit";

describe("órbita do laboratório", () => {
  it("limita o pitch a ±85° ao arrastar", () => {
    const o = createOrbit();
    drag(o, 0, 100000, 1 / 60);
    expect(o.pitch).toBeCloseTo(PITCH_LIMIT, 6);
    drag(o, 0, -1000000, 1 / 60);
    expect(o.pitch).toBeCloseTo(-PITCH_LIMIT, 6);
    expect((PITCH_LIMIT * 180) / Math.PI).toBeCloseTo(85, 6);
    expect(clampPitch(9)).toBeCloseTo(PITCH_LIMIT, 6);
  });

  it("limita a distância a [0,15; 4] m na roda e no valor inicial", () => {
    const o = createOrbit({ dist: 100 });
    expect(o.dist).toBe(DIST_MAX);
    for (let i = 0; i < 200; i++) zoom(o, -120);
    expect(o.dist).toBe(DIST_MIN);
    for (let i = 0; i < 400; i++) zoom(o, 120);
    expect(o.dist).toBe(DIST_MAX);
    expect(DIST_MIN).toBe(0.15);
    expect(clampDist(-3)).toBe(DIST_MIN);
  });

  it("a inércia some em menos de 1 s depois de soltar", () => {
    const o = createOrbit();
    drag(o, 5000, 5000, 1 / 600);
    release(o, false);
    expect(Math.hypot(o.vYaw, o.vPitch)).toBeGreaterThan(0);
    for (let i = 0; i < 59; i++) step(o, 1 / 60, false);
    expect(o.vYaw).toBe(0);
    expect(o.vPitch).toBe(0);
  });

  it("sem inércia com movimento reduzido", () => {
    const o = createOrbit();
    drag(o, 300, 40, 1 / 60);
    release(o, true);
    const yaw = o.yaw;
    step(o, 1 / 60, true);
    expect(o.vYaw).toBe(0);
    expect(o.yaw).toBe(yaw);
  });

  it("segurando, a velocidade não move sozinha; a inércia respeita o limite do pitch", () => {
    const o = createOrbit({ pitch: PITCH_LIMIT - 0.01 });
    drag(o, 0, 400, 1 / 60);
    const pitch = o.pitch;
    step(o, 1 / 60, false);
    expect(o.pitch).toBe(pitch);
    release(o, false);
    for (let i = 0; i < 90; i++) step(o, 1 / 60, false);
    expect(o.pitch).toBeLessThanOrEqual(PITCH_LIMIT + 1e-9);
  });

  it("o olho fica à distância pedida, olhando a origem", () => {
    const o = createOrbit({ yaw: 0.7, pitch: 0.3, dist: 2 });
    const [x, y, z] = eye(o);
    expect(Math.hypot(x, y, z)).toBeCloseTo(2, 9);
    expect(y).toBeCloseTo(2 * Math.sin(0.3), 9);
  });

  it("enquadra o raio do modelo dentro dos limites", () => {
    expect(fitDistance(0.5, 60, 1.6)).toBeGreaterThan(DIST_MIN);
    expect(fitDistance(100, 60, 1.6)).toBe(DIST_MAX);
    expect(fitDistance(0.0001, 60, 1.6)).toBe(DIST_MIN);
  });
});
