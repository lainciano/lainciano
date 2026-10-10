import { randomUUID } from "node:crypto";
import { createRankingApi, type RankingApi } from "./handlers";
import { LIMITS, createMemoryLimiter } from "./limiter";
import { createMemoryStore } from "./store";

const holder = globalThis as typeof globalThis & { __lainRanking?: RankingApi };

/**
 * Uma API por processo (sobrevive ao HMR do dev). Fase 6: loja e limitador em memória. Na Vercel sem a
 * loja persistente da Fase 7, o segredo é tratado como ausente: 503 em vez de um livro que some (D11).
 */
export function rankingApi(): RankingApi {
  if (!holder.__lainRanking) {
    const persistent = false; // Fase 7: true quando UPSTASH_REDIS_REST_URL/TOKEN existirem
    const onVercel = process.env.VERCEL === "1";
    holder.__lainRanking = createRankingApi({
      store: createMemoryStore(),
      submitLimiter: createMemoryLimiter(LIMITS.submit.max, LIMITS.submit.windowMs),
      runLimiter: createMemoryLimiter(LIMITS.run.max, LIMITS.run.windowMs),
      secret: onVercel && !persistent ? null : (process.env.RANKING_SECRET ?? null),
      adminToken: process.env.ADMIN_TOKEN ?? null,
      now: Date.now,
      newRunId: randomUUID,
    });
  }
  return holder.__lainRanking;
}
