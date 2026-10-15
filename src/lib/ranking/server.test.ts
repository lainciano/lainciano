import { describe, expect, it } from "vitest";
import { buildRankingApi, memoryStoreAllowed } from "@/lib/ranking/server";

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
