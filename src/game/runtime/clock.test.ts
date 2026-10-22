import { describe, expect, it } from "vitest";
import { MAX_DT, createClock } from "./clock";

describe("createClock", () => {
  it("o primeiro tique dá dt 0 e os seguintes medem em segundos", () => {
    const clock = createClock();
    expect(clock.tick(1000).dt).toBe(0);
    expect(clock.tick(1016).dt).toBeCloseTo(0.016, 6);
  });

  it("limita o dt a 0,05 s (aba voltando, engasgo)", () => {
    const clock = createClock();
    clock.tick(1000);
    clock.tick(1016);
    expect(clock.tick(2000).dt).toBe(MAX_DT);
    expect(MAX_DT).toBe(0.05);
  });

  it("relógio que volta reinicia: dt 0 e o próximo mede a partir do novo ponto", () => {
    const clock = createClock();
    clock.tick(1000);
    clock.tick(1016);
    clock.tick(2000);
    expect(clock.tick(500).dt).toBe(0);
    expect(clock.tick(516).dt).toBeCloseTo(0.016, 6);
  });

  it("t acumula só os dt já limitados e nunca anda para trás", () => {
    const clock = createClock();
    clock.tick(1000);
    clock.tick(1016);
    const afterJump = clock.tick(5000).t;
    expect(afterJump).toBeCloseTo(0.066, 6);
    expect(clock.tick(10).t).toBeCloseTo(afterJump, 6);
  });

  it("reset esquece o último instante (o próximo tique dá dt 0) sem zerar t", () => {
    const clock = createClock();
    clock.tick(1000);
    const { t } = clock.tick(1016);
    clock.reset();
    const next = clock.tick(9000);
    expect(next.dt).toBe(0);
    expect(next.t).toBeCloseTo(t, 6);
    expect(clock.tick(9016).dt).toBeCloseTo(0.016, 6);
  });

  it("instante inválido não envenena o relógio", () => {
    const clock = createClock();
    clock.tick(1000);
    expect(clock.tick(Number.NaN).dt).toBe(0);
    expect(clock.tick(Number.POSITIVE_INFINITY).dt).toBe(0);
    expect(clock.tick(1016).dt).toBeCloseTo(0.016, 6);
  });
});
