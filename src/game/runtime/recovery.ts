/** Recriações do jogo depois de perder o contexto WebGL: no máximo `MAX_RECOVERIES` por `WINDOW_MS`. */
export const MAX_RECOVERIES = 3;
export const WINDOW_MS = 60_000;

export type RecoveryLimiter = {
  /** Ainda cabe uma recriação agora? (não conta) */
  canRecover(now: number): boolean;
  /** Conta uma recriação; `false` (e não conta) se o limite da janela já foi usado. */
  take(now: number): boolean;
};

/**
 * Limite de recriações (lógica pura, relógio injetado). Depois do teto só resta "voltar ao site": um aparelho que
 * perde o contexto sem parar não fica num laço de recriar. A janela desliza: cada recriação vale por 60 s.
 */
export function createRecoveryLimiter(max = MAX_RECOVERIES, windowMs = WINDOW_MS): RecoveryLimiter {
  let taken: number[] = [];
  const prune = (now: number) => {
    taken = taken.filter((t) => now - t < windowMs);
  };
  return {
    canRecover(now) {
      prune(now);
      return taken.length < max;
    },
    take(now) {
      prune(now);
      if (taken.length >= max) return false;
      taken.push(now);
      return true;
    },
  };
}
