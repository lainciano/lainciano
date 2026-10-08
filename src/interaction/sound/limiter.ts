/** Janela deslizante: no máximo `max` eventos a cada `windowMs` (impactos, rasgos). */
export function createRateLimiter(max: number, windowMs: number) {
  const hits: number[] = [];
  return {
    tryHit(now: number): boolean {
      while (hits.length > 0 && now - hits[0] >= windowMs) hits.shift();
      if (hits.length >= max) return false;
      hits.push(now);
      return true;
    },
  };
}
