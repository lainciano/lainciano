import { describe, expect, it } from "vitest";
import { LIMITS, createMemoryLimiter } from "@/lib/ranking/limiter";

describe("LIMITS (spec 8.5: 3 envios/hora/IP; D7: 20 bilhetes/hora/IP)", () => {
  it("valores", () => {
    expect(LIMITS).toEqual({ submit: { max: 3, windowMs: 3_600_000 }, run: { max: 20, windowMs: 3_600_000 } });
  });
});

describe("createMemoryLimiter (janela deslizante por chave)", () => {
  it("permite max por janela e recusa o seguinte", async () => {
    const limiter = createMemoryLimiter(3, 1000);
    expect([await limiter.hit("k", 0), await limiter.hit("k", 1), await limiter.hit("k", 2)]).toEqual([true, true, true]);
    expect(await limiter.hit("k", 3)).toBe(false);
  });
  it("chaves independentes", async () => {
    const limiter = createMemoryLimiter(1, 1000);
    expect(await limiter.hit("a", 0)).toBe(true);
    expect(await limiter.hit("b", 0)).toBe(true);
    expect(await limiter.hit("a", 1)).toBe(false);
  });
  it("libera quando o mais antigo sai da janela; recusas não contam", async () => {
    const limiter = createMemoryLimiter(1, 1000);
    expect(await limiter.hit("k", 0)).toBe(true);
    expect(await limiter.hit("k", 500)).toBe(false);
    expect(await limiter.hit("k", 1000)).toBe(true);
  });
});
