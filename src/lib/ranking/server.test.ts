import { describe, expect, it } from "vitest";
import { buildRankingApi, keyPrefix, memoryStoreAllowed, upstashEnv, type Backend } from "@/lib/ranking/server";
import { createMemoryLimiter } from "@/lib/ranking/limiter";
import { createMemoryStore } from "@/lib/ranking/store";

const SECRET = "segredo-de-teste-com-mais-de-32-caracteres!!";
const run = () => new Request("http://localhost/api/run", { method: "POST", headers: { "x-forwarded-for": "203.0.113.7" } });

describe("loja em memória é opt-in (M2/#12)", () => {
  it("produção fora da Vercel sem opt-in → 503 em /api/run e no GET", async () => {
    const api = buildRankingApi({ NODE_ENV: "production", RANKING_SECRET: SECRET });
    expect((await api.createRun(run())).status).toBe(503);
    expect((await api.listTop()).status).toBe(503);
  });
  it("produção com RANKING_MEMORY_STORE=1 → funciona", async () => {
    const api = buildRankingApi({ NODE_ENV: "production", RANKING_MEMORY_STORE: "1", RANKING_SECRET: SECRET });
    expect((await api.createRun(run())).status).toBe(201);
    expect((await api.listTop()).status).toBe(200);
  });
  it("VERCEL=1 → 503 mesmo com segredo e opt-in", async () => {
    const api = buildRankingApi({ VERCEL: "1", NODE_ENV: "production", RANKING_MEMORY_STORE: "1", RANKING_SECRET: SECRET });
    expect((await api.createRun(run())).status).toBe(503);
    expect((await api.listTop()).status).toBe(503);
  });
  it("dev e teste funcionam sem opt-in", async () => {
    for (const NODE_ENV of ["development", "test", undefined]) {
      const api = buildRankingApi({ NODE_ENV, RANKING_SECRET: SECRET });
      expect((await api.createRun(run())).status).toBe(201);
    }
  });
  it("sem RANKING_SECRET → 503 mesmo em dev", async () => {
    expect((await buildRankingApi({ NODE_ENV: "development" }).createRun(run())).status).toBe(503);
  });
  it("memoryStoreAllowed só aceita o valor exato 1", () => {
    expect(memoryStoreAllowed({ NODE_ENV: "production", RANKING_MEMORY_STORE: "true" })).toBe(false);
    expect(memoryStoreAllowed({ NODE_ENV: "production", RANKING_MEMORY_STORE: "1" })).toBe(true);
  });
});

describe("Upstash (Fase 7)", () => {
  const CREDS = { KV_REST_API_URL: "https://exemplo.upstash.io", KV_REST_API_TOKEN: "token-de-teste" };
  const fakeBackend = (): Backend => ({
    store: createMemoryStore(),
    submitLimiter: createMemoryLimiter(3, 3_600_000),
    runLimiter: createMemoryLimiter(20, 3_600_000),
    globalSubmitLimiter: createMemoryLimiter(60, 3_600_000),
    globalRunLimiter: createMemoryLimiter(1000, 3_600_000),
  });

  it("upstashEnv aceita KV_REST_API_* e UPSTASH_REDIS_REST_*; sem as duas, null", () => {
    expect(upstashEnv(CREDS)).toEqual({ url: "https://exemplo.upstash.io", token: "token-de-teste" });
    expect(upstashEnv({ UPSTASH_REDIS_REST_URL: "u", UPSTASH_REDIS_REST_TOKEN: "t" })).toEqual({ url: "u", token: "t" });
    expect(upstashEnv({ KV_REST_API_URL: "u" })).toBeNull();
    expect(upstashEnv({})).toBeNull();
  });

  it("VERCEL=1 + Upstash → funciona (a persistente vence a regra da memória)", async () => {
    const api = buildRankingApi({ VERCEL: "1", NODE_ENV: "production", RANKING_SECRET: SECRET, ...CREDS }, fakeBackend);
    expect((await api.createRun(run())).status).toBe(201);
    expect((await api.listTop()).status).toBe(200);
  });

  it("Upstash sem RANKING_SECRET → 503", async () => {
    const api = buildRankingApi({ VERCEL: "1", ...CREDS }, fakeBackend);
    expect((await api.createRun(run())).status).toBe(503);
  });

  it("sem credenciais, o backend Upstash nem é construído", async () => {
    let built = false;
    buildRankingApi({ VERCEL: "1", RANKING_SECRET: SECRET }, () => ((built = true), fakeBackend()));
    expect(built).toBe(false);
  });

  it("memoryStoreAllowed continua só para a memória", () => {
    expect(memoryStoreAllowed({ VERCEL: "1", ...CREDS })).toBe(false);
  });

  it("prefixo de chaves por ambiente: produção ≠ preview ≠ dev", () => {
    expect(keyPrefix({ VERCEL_ENV: "production" })).toBe("ranking:v1");
    expect(keyPrefix({ VERCEL_ENV: "preview" })).toBe("ranking:v1:preview");
    expect(keyPrefix({ VERCEL_ENV: "development" })).toBe("ranking:v1:dev");
    expect(keyPrefix({})).toBe("ranking:v1:dev");
    expect(keyPrefix({ VERCEL_ENV: "outro" })).toBe("ranking:v1:dev");
  });
});
