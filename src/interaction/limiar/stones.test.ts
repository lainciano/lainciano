import { describe, expect, it } from "vitest";
import {
  isUncovered,
  spawnStones,
  stepStones,
  type Bounds,
  type Stone,
} from "@/interaction/limiar/stones";

const bounds: Bounds = { width: 400, height: 300 };

describe("stepStones", () => {
  it("uma pedra solta cai e para no chão", () => {
    let stones: Stone[] = [{ x: 200, y: 50, vx: 0, vy: 0, r: 20 }];
    for (let i = 0; i < 200; i++) stones = stepStones(stones, 16, bounds, null);
    expect(stones[0].y + stones[0].r).toBeLessThanOrEqual(bounds.height);
    expect(Math.abs(stones[0].vy)).toBeLessThan(0.5);
  });

  it("ponteiro parado a r de uma pedra empurra para longe", () => {
    const stone: Stone = { x: 200, y: 150, vx: 0, vy: 0, r: 20 };
    const right = stepStones([stone], 16, bounds, { x: 180, y: 150, vx: 0, vy: 0 });
    expect(right[0].vx).toBeGreaterThan(0);
    const left = stepStones([stone], 16, bounds, { x: 220, y: 150, vx: 0, vy: 0 });
    expect(left[0].vx).toBeLessThan(0);
  });

  it("dtMs = 5000 dá o mesmo resultado que dtMs = 32", () => {
    const stones: Stone[] = [{ x: 100, y: 40, vx: 0.1, vy: 0, r: 15 }];
    expect(stepStones(stones, 5000, bounds, null)).toEqual(stepStones(stones, 32, bounds, null));
  });

  it("não muta a entrada", () => {
    const stones: Stone[] = [{ x: 100, y: 40, vx: 0, vy: 0, r: 15 }];
    const copy = structuredClone(stones);
    stepStones(stones, 16, bounds, null);
    expect(stones).toEqual(copy);
  });

  it("duas pedras sobrepostas se separam", () => {
    let stones: Stone[] = [
      { x: 200, y: 280, vx: 0, vy: 0, r: 20 },
      { x: 210, y: 280, vx: 0, vy: 0, r: 20 },
    ];
    for (let i = 0; i < 60; i++) stones = stepStones(stones, 16, bounds, null);
    const d = Math.hypot(stones[0].x - stones[1].x, stones[0].y - stones[1].y);
    expect(d).toBeGreaterThan(30);
  });
});

describe("isUncovered", () => {
  const relic = { x: 200, y: 150, r: 30 };

  it("false com uma pedra centrada na relíquia", () => {
    expect(isUncovered(relic, [{ x: 200, y: 150, vx: 0, vy: 0, r: 25 }])).toBe(false);
  });

  it("true sem pedras", () => {
    expect(isUncovered(relic, [])).toBe(true);
  });

  it("true com pedra longe", () => {
    expect(isUncovered(relic, [{ x: 10, y: 10, vx: 0, vy: 0, r: 20 }])).toBe(true);
  });
});

describe("spawnStones", () => {
  it("é determinístico com rand fixo e respeita count e bounds", () => {
    const a = spawnStones(8, bounds, () => 0.5);
    const b = spawnStones(8, bounds, () => 0.5);
    expect(a).toEqual(b);
    expect(a).toHaveLength(8);
    for (const s of a) {
      expect(s.x - s.r).toBeGreaterThanOrEqual(0);
      expect(s.x + s.r).toBeLessThanOrEqual(bounds.width);
      expect(s.y - s.r).toBeGreaterThanOrEqual(0);
    }
  });
});
