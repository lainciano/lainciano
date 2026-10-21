/** Converte um tempo CSS ("150ms", "0.5s") em milissegundos; valor vazio ou inválido devolve `fallback`. */
export function cssTimeMs(value: string, fallback: number): number {
  const match = /^\s*(-?\d*\.?\d+)\s*(ms|s)\s*$/.exec(value);
  if (!match) return fallback;
  const amount = Number(match[1]);
  return match[2] === "s" ? amount * 1000 : amount;
}

/** Lê um token de tempo do `:root` (ex.: `--motion-fast`) em milissegundos. */
export function readTimeToken(name: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  return cssTimeMs(getComputedStyle(document.documentElement).getPropertyValue(name), fallback);
}
