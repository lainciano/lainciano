import { describe, expect, it } from "vitest";
import { MAX_WEBGL_CONTEXTS, capDpr, createContextBudget, createFpsGuard } from "@/rooms/shared/webgl";

describe("capDpr", () => {
  it("limita a 2 no desktop e 1,5 no toque (spec 6.5, 9.3)", () => {
    expect(capDpr(3, false)).toBe(2);
    expect(capDpr(3, true)).toBe(1.5);
    expect(capDpr(1, true)).toBe(1);
    expect(capDpr(1.25, false)).toBe(1.25);
  });
  it("valor inválido vira 1", () => {
    expect(capDpr(Number.NaN, false)).toBe(1);
    expect(capDpr(0, false)).toBe(1);
  });
});

describe("createContextBudget", () => {
  it("no máximo 2 contextos vivos no site", () => {
    expect(MAX_WEBGL_CONTEXTS).toBe(2);
    const budget = createContextBudget(MAX_WEBGL_CONTEXTS);
    expect(budget.acquire()).toBe(true);
    expect(budget.acquire()).toBe(true);
    expect(budget.acquire()).toBe(false);
    expect(budget.live()).toBe(2);
    budget.release();
    expect(budget.acquire()).toBe(true);
  });
  it("liberar a mais não fica negativo", () => {
    const budget = createContextBudget(2);
    budget.release();
    expect(budget.live()).toBe(0);
  });
});

describe("createFpsGuard", () => {
  it("60 fps nunca degrada", () => {
    const guard = createFpsGuard();
    const fired = Array.from({ length: 300 }, () => guard.sample(1000 / 60)).filter(Boolean);
    expect(fired).toHaveLength(0);
  });
  it("~33 fps sustentados degradam uma única vez", () => {
    const guard = createFpsGuard();
    const fired = Array.from({ length: 300 }, () => guard.sample(30)).filter(Boolean);
    expect(fired).toHaveLength(1);
  });
  it("saltos de aba em segundo plano (> 250 ms) são ignorados", () => {
    const guard = createFpsGuard();
    const fired = Array.from({ length: 300 }, () => guard.sample(400)).filter(Boolean);
    expect(fired).toHaveLength(0);
  });
});
