/** Limite por chave (a chave é o HMAC do IP — D8). Fase 7: @upstash/ratelimit com a mesma interface. */
export interface KeyedLimiter {
  hit(key: string, now: number): Promise<boolean>;
}

/** Spec 8.5: 3 envios/hora/IP. D7: 20 bilhetes/hora/IP. */
export const LIMITS = {
  submit: { max: 3, windowMs: 3_600_000 },
  run: { max: 20, windowMs: 3_600_000 },
} as const;

/** Janela deslizante em memória; recusas não contam. */
export function createMemoryLimiter(max: number, windowMs: number): KeyedLimiter {
  const hits = new Map<string, number[]>();
  return {
    async hit(key, now) {
      const recent = (hits.get(key) ?? []).filter((time) => now - time < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.set(key, recent);
      return true;
    },
  };
}
