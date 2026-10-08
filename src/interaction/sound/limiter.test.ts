import { describe, expect, it } from "vitest";
import { createRateLimiter } from "@/interaction/sound/limiter";

describe("createRateLimiter", () => {
  it("aceita 6 em 1 s e recusa o 7º", () => {
    const limiter = createRateLimiter(6, 1000);
    for (let i = 0; i < 6; i += 1) expect(limiter.tryHit(i * 10)).toBe(true);
    expect(limiter.tryHit(100)).toBe(false);
    expect(limiter.tryHit(999)).toBe(false);
  });

  it("libera quando o mais antigo sai da janela", () => {
    const limiter = createRateLimiter(6, 1000);
    for (let i = 0; i < 6; i += 1) limiter.tryHit(i * 10);
    expect(limiter.tryHit(1000)).toBe(true);
    expect(limiter.tryHit(1005)).toBe(false);
  });

  it("nunca passa de 6 em qualquer janela de 1 s (impactos a 60 Hz)", () => {
    const limiter = createRateLimiter(6, 1000);
    const accepted: number[] = [];
    for (let t = 0; t < 5000; t += 16) if (limiter.tryHit(t)) accepted.push(t);
    for (const start of accepted) {
      expect(accepted.filter((t) => t >= start && t < start + 1000).length).toBeLessThanOrEqual(6);
    }
  });
});
