import { describe, expect, it } from "vitest";
import { createInertia, INERTIA } from "./inertia";

/** Roda `seconds` em passos de `dt` com a entrada dada; devolve a série do yaw. */
function run(i: ReturnType<typeof createInertia>, seconds: number, yawRate: number, pitchRate = 0, dt = 1 / 60) {
  const out: number[] = [];
  for (let t = 0; t < seconds - 1e-9; t += dt) {
    i.step(dt, yawRate, pitchRate);
    out.push(i.yaw);
  }
  return out;
}

describe("inércia · mola amortecida", () => {
  it("parada não há inércia", () => {
    const i = createInertia();
    run(i, 2, 0);
    expect(i.yaw).toBe(0);
    expect(i.pitch).toBe(0);
  });

  it("degrau de velocidade: a mão desce oposta ao giro, assenta no atraso em regime e passa pouco", () => {
    const i = createInertia();
    const s = run(i, 1.5, 1);
    const steady = INERTIA.yawMax * Math.tanh((-INERTIA.yawGain * 1) / INERTIA.yawMax); // com o teto suave
    expect(s[3]).toBeLessThan(0);
    expect(s[3]).toBeGreaterThan(steady); // ainda subindo
    const peak = Math.min(...s);
    expect(peak).toBeLessThan(steady); // overshoot
    expect(peak).toBeGreaterThan(steady * 1.15); // pequeno (ζ = 0,6 ≈ 9,5 %)
    expect(s[s.length - 1]).toBeCloseTo(steady, 3);
  });

  it("pulso (giro rápido que para): vai oposto, volta passando levemente do ponto e assenta", () => {
    const i = createInertia();
    const s = [...run(i, 0.15, 4), ...run(i, 1.5, 0)];
    const peak = Math.min(...s);
    expect(peak).toBeLessThan(-0.03);
    const after = s.slice(s.indexOf(peak));
    const over = Math.max(...after); // cruzou o zero para o outro lado
    expect(over).toBeGreaterThan(0);
    expect(over).toBeLessThan(-peak * 0.25);
    expect(Math.abs(s[s.length - 1])).toBeLessThan(1e-3);
    // metade do caminho de volta em menos de 0,3 s depois do pico
    expect(Math.abs(s[s.indexOf(peak) + 18])).toBeLessThan(-peak * 0.5);
  });

  it("a amplitude depende da velocidade: giro lento atrasa menos que giro rápido", () => {
    const a = createInertia();
    const b = createInertia();
    run(a, 1, 0.3);
    run(b, 1, 2);
    expect(Math.abs(a.yaw)).toBeLessThan(Math.abs(b.yaw) / 3);
    expect(Math.abs(a.yaw)).toBeLessThan(0.02);
  });

  it("o teto: giro extremo e longo nunca passa da amplitude máxima (yaw e pitch)", () => {
    const i = createInertia();
    for (let k = 0; k < 600; k++) i.step(1 / 60, 1e6, -1e6);
    expect(Math.abs(i.yaw)).toBeLessThanOrEqual(INERTIA.yawMax);
    expect(Math.abs(i.pitch)).toBeLessThanOrEqual(INERTIA.pitchMax);
    expect(i.yaw).toBeLessThan(0);
    expect(i.pitch).toBeGreaterThan(0);
  });

  it("os eixos são independentes", () => {
    const i = createInertia();
    run(i, 0.5, 0, 2);
    expect(i.yaw).toBe(0);
    expect(i.pitch).toBeLessThan(-0.02);
  });

  it("dt variável: 30, 60 e 144 fps dão quase o mesmo (< 3 %)", () => {
    // 0,2 s de giro e 0,2 s de volta, em número inteiro de quadros em cada taxa
    const at = (fps: number) => {
      const i = createInertia();
      for (let k = 0; k < fps * 0.2; k++) i.step(1 / fps, 4, 0);
      const end = i.yaw;
      for (let k = 0; k < fps * 0.2; k++) i.step(1 / fps, 0, 0);
      return { end, back: i.yaw };
    };
    const ref = at(60);
    expect(Math.abs(ref.end)).toBeGreaterThan(0.03);
    for (const fps of [30, 120, 240]) {
      const o = at(fps);
      expect(Math.abs(o.end - ref.end), `${fps} fps: atraso no fim do giro`).toBeLessThan(Math.abs(ref.end) * 0.03);
      expect(Math.abs(o.back - ref.back), `${fps} fps: depois da volta`).toBeLessThan(0.001); // 0,06°
    }
  });

  it("dt NaN, negativo, zero ou enorme é ignorado (estado intacto); entrada NaN vira 0", () => {
    const i = createInertia();
    run(i, 0.2, 3);
    const before = i.yaw;
    for (const dt of [NaN, -1, 0, Infinity, 5]) i.step(dt, 3, 3);
    expect(i.yaw).toBe(before);
    i.step(1 / 60, NaN, Infinity);
    expect(Number.isFinite(i.yaw)).toBe(true);
    expect(Number.isFinite(i.pitch)).toBe(true);
  });

  it("não acumula energia: oscilar a entrada por muito tempo mantém tudo limitado e assenta ao parar", () => {
    const i = createInertia();
    for (let k = 0; k < 3000; k++) i.step(1 / 60, Math.sin(k * 0.5) * 8, Math.cos(k * 0.3) * 8);
    expect(Math.abs(i.yaw)).toBeLessThanOrEqual(INERTIA.yawMax);
    run(i, 2, 0);
    expect(Math.abs(i.yaw)).toBeLessThan(1e-3);
  });

  it("determinística e reset zera", () => {
    const a = createInertia();
    const b = createInertia();
    expect(run(a, 1, 2.5, 1)).toEqual(run(b, 1, 2.5, 1));
    a.reset();
    expect(a.yaw).toBe(0);
    expect(a.pitch).toBe(0);
  });
});
