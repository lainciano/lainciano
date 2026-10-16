import { randomUUID } from "node:crypto";
import { Redis } from "@upstash/redis";
import { afterAll, describe, expect, it } from "vitest";
import { createUpstashLimiter } from "@/lib/ranking/limiter";
import { createUpstashStore } from "@/lib/ranking/upstashStore";

// Só roda com as variáveis da Upstash no ambiente (ex.: `set -a; . ./.env.local; pnpm test`). Prefixo descartável, apagado no fim.
const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

describe.skipIf(!url || !token)("loja Upstash de verdade", () => {
  const redis = new Redis({ url: url!, token: token!, automaticDeserialization: false });
  const prefix = `test:${randomUUID()}`;
  const store = createUpstashStore(redis, prefix);
  const entry = (elapsedMs: number, createdAt: number, nickname: string) => ({ runId: randomUUID(), nickname, elapsedMs, createdAt });

  afterAll(async () => {
    const keys = await redis.keys(`${prefix}*`);
    if (keys.length) await redis.del(...keys);
  });

  it("grava, ordena, devolve posição, bloqueia duplicado e mantém a lápide após remove", async () => {
    const a = entry(400_000, 1_700_000_000_000, "1234");
    const b = entry(200_000, 1_700_000_000_001, "ana");
    const c = entry(200_000, 1_700_000_000_000, "bia"); // empata com b, mas enviou antes
    expect(await store.record(a)).toEqual({ ok: true, position: 1 });
    expect(await store.record(b)).toEqual({ ok: true, position: 1 });
    expect(await store.record(c)).toEqual({ ok: true, position: 1 });
    expect(await store.record({ ...a, nickname: "outro" })).toEqual({ ok: false, error: "duplicate" });
    expect((await store.top(20)).map((e) => e.nickname)).toEqual(["bia", "ana", "1234"]);
    expect((await store.top(2)).map((e) => e.nickname)).toEqual(["bia", "ana"]);
    expect(await store.top(20)).toContainEqual(a);
    expect(await redis.zcard(prefix)).toBe(3);
    expect(await store.remove(b.runId)).toBe(true);
    expect(await redis.zcard(prefix)).toBe(2); // o membro foi mesmo removido (sem órfão)
    expect(await store.remove(b.runId)).toBe(false);
    expect((await store.top(20)).map((e) => e.nickname)).toEqual(["bia", "1234"]);
    expect(await store.record({ ...b, createdAt: 1_700_000_000_999 })).toEqual({ ok: false, error: "duplicate" });
  });

  it("duas gravações simultâneas do mesmo runId: só uma entra", async () => {
    const e = entry(300_000, 1_700_000_001_000, "dup");
    const results = await Promise.all([store.record(e), store.record({ ...e, nickname: "dup2" })]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("limitador: 2 por janela por chave, chaves independentes, prefixos separados", async () => {
    const limiter = createUpstashLimiter(redis, 2, 3_600_000, `${prefix}:rl:a`);
    const other = createUpstashLimiter(redis, 2, 3_600_000, `${prefix}:rl:b`);
    expect([await limiter.hit("k", 0), await limiter.hit("k", 0), await limiter.hit("k", 0)]).toEqual([true, true, false]);
    expect(await limiter.hit("outra", 0)).toBe(true);
    expect(await other.hit("k", 0)).toBe(true);
  });
});
