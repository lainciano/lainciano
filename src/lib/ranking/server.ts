import { randomUUID } from "node:crypto";
import { createRankingApi, type RankingApi } from "./handlers";
import { LIMITS, createMemoryLimiter } from "./limiter";
import { createMemoryStore } from "./store";

type Env = Record<string, string | undefined>;

const holder = globalThis as typeof globalThis & { __lainRanking?: RankingApi };

/**
 * A loja em memória só vale fora da Vercel e, em produção, só com RANKING_MEMORY_STORE=1 (opt-in explícito).
 * Na Vercel sem a loja persistente da Fase 7 o livro por instância seria mentira: 503 (D11).
 */
export function memoryStoreAllowed(env: Env): boolean {
  const persistent = false; // Fase 7: true quando UPSTASH_REDIS_REST_URL/TOKEN existirem
  if (persistent) return true;
  if (env.VERCEL === "1") return false;
  return env.NODE_ENV !== "production" || env.RANKING_MEMORY_STORE === "1";
}

/** Monta a API a partir do ambiente. Sem loja permitida, o segredo vira ausente: tudo responde 503. */
export function buildRankingApi(env: Env): RankingApi {
  return createRankingApi({
    store: createMemoryStore(),
    submitLimiter: createMemoryLimiter(LIMITS.submit.max, LIMITS.submit.windowMs),
    runLimiter: createMemoryLimiter(LIMITS.run.max, LIMITS.run.windowMs),
    secret: memoryStoreAllowed(env) ? (env.RANKING_SECRET ?? null) : null,
    adminToken: env.ADMIN_TOKEN ?? null,
    now: Date.now,
    newRunId: randomUUID,
  });
}

/** Uma API por processo (sobrevive ao HMR do dev). */
export function rankingApi(): RankingApi {
  holder.__lainRanking ??= buildRankingApi(process.env);
  return holder.__lainRanking;
}
