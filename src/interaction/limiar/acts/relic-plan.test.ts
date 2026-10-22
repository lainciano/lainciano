import { describe, expect, it } from "vitest";
import {
  IMPACT_MIN_SPEED,
  MAX_POINTER_SPEED,
  POINTER_STALE_MS,
  STONE_COUNT,
  collectStep,
  floorImpacts,
  flyTo,
  placeInBand,
  pointerAt,
  stoneBand,
  stoneCount,
  thudGain,
  trackPointer,
} from "@/interaction/limiar/acts/relic-plan";
import { spawnStones, stepStones, type Stone } from "@/interaction/limiar/stones";

const stone = (over: Partial<Stone>): Stone => ({ x: 100, y: 100, vx: 0, vy: 0, r: 20, ...over });

describe("pedras", () => {
  it("9 a 14 pedras", () => {
    expect(stoneCount(() => 0)).toBe(STONE_COUNT[0]);
    expect(stoneCount(() => 0.999)).toBe(STONE_COUNT[1]);
    for (let i = 0; i < 50; i++) {
      const n = stoneCount(Math.random);
      expect(n).toBeGreaterThanOrEqual(9);
      expect(n).toBeLessThanOrEqual(14);
    }
  });

  it("a faixa fica em volta da relíquia e dentro do ato", () => {
    expect(stoneBand(640, 30, 1280)).toEqual({ left: 440, width: 400 });
    expect(stoneBand(640, 50, 1280)).toEqual({ left: 340, width: 600 });
    expect(stoneBand(20, 30, 1280).left).toBe(0);
    expect(stoneBand(1270, 30, 1280)).toEqual({ left: 880, width: 400 });
    // Ato mais estreito que a faixa mínima: a faixa é o ato todo.
    expect(stoneBand(150, 40, 300)).toEqual({ left: 0, width: 300 });
  });

  it("as pedras geradas na faixa vão para a posição dela", () => {
    const band = stoneBand(640, 40, 1280);
    const stones = placeInBand(spawnStones(12, { width: band.width, height: 800 }, Math.random), band);
    stones.forEach((s) => {
      expect(s.x - s.r).toBeGreaterThanOrEqual(band.left - 1e-9);
      expect(s.x + s.r).toBeLessThanOrEqual(band.left + band.width + 1e-9);
    });
  });
});

describe("ponteiro", () => {
  it("velocidade medida entre eventos", () => {
    const a = trackPointer(null, 0, 0, 1000);
    expect(a).toMatchObject({ vx: 0, vy: 0 });
    const b = trackPointer(a, 20, -10, 1010);
    expect(b.vx).toBeCloseTo(2);
    expect(b.vy).toBeCloseTo(-1);
  });

  it("evento depois de uma pausa recomeça sem velocidade; mesmo instante mantém", () => {
    const a = trackPointer(trackPointer(null, 0, 0, 0), 10, 0, 10);
    expect(trackPointer(a, 30, 0, 10 + POINTER_STALE_MS + 1)).toMatchObject({ vx: 0, vy: 0 });
    expect(trackPointer(a, 12, 0, 10).vx).toBeCloseTo(a.vx);
  });

  it("velocidade tem teto", () => {
    const fast = trackPointer(trackPointer(null, 0, 0, 0), 500, 0, 1);
    expect(Math.hypot(fast.vx, fast.vy)).toBeCloseTo(MAX_POINTER_SPEED);
  });

  it("parado há tempo empurra só com o mínimo (sem velocidade)", () => {
    const p = trackPointer(trackPointer(null, 0, 0, 0), 10, 0, 10);
    expect(pointerAt(p, 20)).toMatchObject({ vx: 1 });
    expect(pointerAt(p, 10 + POINTER_STALE_MS + 1)).toMatchObject({ x: 10, vx: 0, vy: 0 });
    expect(pointerAt(null, 0)).toBeNull();
  });
});

describe("impactos", () => {
  const bounds = { width: 400, height: 300 };

  it("pedra caindo rápido que toca o chão conta; a que só treme no chão (vy ≈ −0,012) não", () => {
    const falling = stone({ y: 300 - 20 - 1, vy: 1 });
    const next = stepStones([falling], 16, bounds, null);
    expect(floorImpacts([falling], next, 300)).toEqual([1]);

    // Pedra "em repouso" (nunca chega a vy = 0): passos seguidos não fazem baque.
    let rest = [stone({ y: 280 })];
    for (let i = 0; i < 60; i++) {
      const after = stepStones(rest, 16, bounds, null);
      expect(floorImpacts(rest, after, 300)).toEqual([]);
      rest = after;
    }
    expect(Math.abs(rest[0].vy)).toBeLessThan(IMPACT_MIN_SPEED);
  });

  it("pedra no ar não conta", () => {
    const air = stone({ y: 100, vy: 1 });
    expect(floorImpacts([air], stepStones([air], 16, bounds, null), 300)).toEqual([]);
  });

  it("baque escala com a velocidade, entre 0,15 e 1", () => {
    expect(thudGain(0)).toBe(0.15);
    expect(thudGain(1)).toBeCloseTo(0.5);
    expect(thudGain(10)).toBe(1);
  });
});

describe("voo até o contador", () => {
  it("leva o centro da relíquia ao centro do contador e encolhe", () => {
    const fly = flyTo({ left: 1100, top: 20, width: 100, height: 24 }, { x: 0, y: 0 }, 96);
    expect(fly.x + 48).toBeCloseTo(1150);
    expect(fly.y + 48).toBeCloseTo(32);
    expect(fly.scale).toBeCloseTo(0.25);
  });

  it("desconta o canto do ato e limita a escala", () => {
    const fly = flyTo({ left: 110, top: 10, width: 20, height: 2 }, { x: 10, y: 10 }, 100);
    expect(fly.x + 50).toBeCloseTo(110);
    expect(fly.y + 50).toBeCloseTo(1);
    expect(fly.scale).toBe(0.12);
  });
});

describe("collectStep", () => {
  it("pegar uma vez só, chegar uma vez só", () => {
    expect(collectStep("idle", "take")).toBe("taking");
    expect(collectStep("taking", "take")).toBeNull(); // clique e botão juntos
    expect(collectStep("collected", "take")).toBeNull();
    expect(collectStep("taking", "arrive")).toBe("collected");
    expect(collectStep("idle", "arrive")).toBeNull();
    expect(collectStep("collected", "arrive")).toBeNull();
  });
});
