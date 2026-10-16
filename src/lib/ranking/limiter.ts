import { Ratelimit } from "@upstash/ratelimit";
import type { Redis } from "@upstash/redis";

/** Limite por chave (a chave é o HMAC do IP — D8). Em produção, @upstash/ratelimit com a mesma interface. */
export interface KeyedLimiter {
  hit(key: string, now: number): Promise<boolean>;
}

/** Spec 8.5: 3 envios/hora/IP. D7: 20 bilhetes/hora/IP. */
export const LIMITS = {
  submit: { max: 3, windowMs: 3_600_000 },
  run: { max: 20, windowMs: 3_600_000 },
  // Tetos globais (Fase 7): todos os IPs juntos, para um enxame de IPs não encher o livro nem o Redis.
  submitGlobal: { max: 60, windowMs: 3_600_000 },
  runGlobal: { max: 1000, windowMs: 3_600_000 },
} as const;

/** Chave única dos tetos globais. */
export const GLOBAL_KEY = "global";

/** Teto de chaves na memória: acima dele, a varredura remove as chaves já expiradas. */
export const MAX_KEYS = 10_000;

/** Versão em memória: `size()` existe para teste e diagnóstico; a interface pública é `KeyedLimiter`. */
export type MemoryLimiter = KeyedLimiter & { size(): number };

/** Janela deslizante em memória; recusas não contam. */
export function createMemoryLimiter(max: number, windowMs: number, maxKeys: number = MAX_KEYS): MemoryLimiter {
  const hits = new Map<string, number[]>();

  const sweep = (now: number) => {
    for (const [key, times] of hits) {
      if (now - Math.max(...times) >= windowMs) hits.delete(key);
    }
  };

  return {
    async hit(key, now) {
      if (!hits.has(key) && hits.size > maxKeys) sweep(now);
      const recent = (hits.get(key) ?? []).filter((time) => now - time < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.set(key, recent);
      return true;
    },
    size: () => hits.size,
  };
}

/** O que o adaptador usa do `Ratelimit` do Upstash. */
export type RatelimitLike = { limit(identifier: string): Promise<{ success: boolean }> };

export function fromRatelimit(ratelimit: RatelimitLike): KeyedLimiter {
  return { hit: async (key) => (await ratelimit.limit(key)).success };
}

/** Janela deslizante no Redis; `prefix` separa os limitadores entre si (envio, bilhete, tetos). */
export function createUpstashLimiter(redis: Redis, max: number, windowMs: number, prefix: string): KeyedLimiter {
  const seconds = Math.round(windowMs / 1000);
  return fromRatelimit(new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(max, `${seconds} s`), prefix }));
}
