/** Limite por chave (a chave é o HMAC do IP — D8). Fase 7: @upstash/ratelimit com a mesma interface. */
export interface KeyedLimiter {
  hit(key: string, now: number): Promise<boolean>;
}

/** Spec 8.5: 3 envios/hora/IP. D7: 20 bilhetes/hora/IP. */
export const LIMITS = {
  submit: { max: 3, windowMs: 3_600_000 },
  run: { max: 20, windowMs: 3_600_000 },
} as const;

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
