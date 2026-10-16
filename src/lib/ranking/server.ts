import { randomUUID } from "node:crypto";
import { Redis } from "@upstash/redis";
import { createRankingApi, type RankingApi, type RankingDeps } from "./handlers";
import { LIMITS, createMemoryLimiter, createUpstashLimiter } from "./limiter";
import { createMemoryStore } from "./store";
import { KEY_PREFIX, createUpstashStore } from "./upstashStore";

type Env = Record<string, string | undefined>;

const holder = globalThis as typeof globalThis & { __lainRanking?: RankingApi };

/** Loja e limitadores: tudo em memória ou tudo no Upstash. */
export type Backend = Pick<
  RankingDeps,
  "store" | "submitLimiter" | "runLimiter" | "globalSubmitLimiter" | "globalRunLimiter"
>;

/** Credenciais do Redis: a integração da Vercel cria KV_REST_API_*; também aceitamos o nome da própria Upstash. */
export function upstashEnv(env: Env): { url: string; token: string } | null {
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

/** Um Redis atende Preview e Development: o prefixo separa os livros (só produção usa o prefixo "puro"). */
export function keyPrefix(env: Env): string {
  if (env.VERCEL_ENV === "production") return KEY_PREFIX;
  return `${KEY_PREFIX}:${env.VERCEL_ENV === "preview" ? "preview" : "dev"}`;
}

function memoryBackend(): Backend {
  return {
    store: createMemoryStore(),
    submitLimiter: createMemoryLimiter(LIMITS.submit.max, LIMITS.submit.windowMs),
    runLimiter: createMemoryLimiter(LIMITS.run.max, LIMITS.run.windowMs),
    globalSubmitLimiter: createMemoryLimiter(LIMITS.submitGlobal.max, LIMITS.submitGlobal.windowMs),
    globalRunLimiter: createMemoryLimiter(LIMITS.runGlobal.max, LIMITS.runGlobal.windowMs),
  };
}

/** automaticDeserialization desligado: o apelido "1234" volta como texto, não como número. */
function upstashBackend(env: Env, creds: { url: string; token: string }): Backend {
  const redis = new Redis({ url: creds.url, token: creds.token, automaticDeserialization: false });
  const prefix = keyPrefix(env);
  return {
    store: createUpstashStore(redis, prefix),
    submitLimiter: createUpstashLimiter(redis, LIMITS.submit.max, LIMITS.submit.windowMs, `${prefix}:rl:submit`),
    runLimiter: createUpstashLimiter(redis, LIMITS.run.max, LIMITS.run.windowMs, `${prefix}:rl:run`),
    globalSubmitLimiter: createUpstashLimiter(redis, LIMITS.submitGlobal.max, LIMITS.submitGlobal.windowMs, `${prefix}:rl:gsubmit`),
    globalRunLimiter: createUpstashLimiter(redis, LIMITS.runGlobal.max, LIMITS.runGlobal.windowMs, `${prefix}:rl:grun`),
  };
}

/**
 * A loja em memória só vale fora da Vercel e, em produção, só com RANKING_MEMORY_STORE=1 (opt-in explícito).
 * Na Vercel sem Redis o livro por instância seria mentira: 503 (D11). Com Redis (`upstashEnv`), a regra não se aplica.
 */
export function memoryStoreAllowed(env: Env): boolean {
  if (env.VERCEL === "1") return false;
  return env.NODE_ENV !== "production" || env.RANKING_MEMORY_STORE === "1";
}

/**
 * Monta a API a partir do ambiente. Com credenciais do Redis usa o Upstash; sem elas, a memória (se permitida).
 * Sem nenhuma das duas, o segredo vira ausente: tudo responde 503. `makeUpstash` existe para teste.
 */
export function buildRankingApi(
  env: Env,
  makeUpstash: (env: Env, creds: { url: string; token: string }) => Backend = upstashBackend,
): RankingApi {
  const creds = upstashEnv(env);
  const usable = creds !== null || memoryStoreAllowed(env);
  return createRankingApi({
    ...(creds ? makeUpstash(env, creds) : memoryBackend()),
    secret: usable ? (env.RANKING_SECRET ?? null) : null,
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
