/** Spec §4: o passo de simulação nunca passa de 0,05 s (aba voltando, engasgo, depurador). */
export const MAX_DT = 0.05;

export type Clock = {
  /** `now` em ms (o carimbo do requestAnimationFrame). Devolve o passo limitado e o tempo de jogo. */
  tick(now: number): { dt: number; t: number };
  /** Esquece o último instante: o próximo tique dá dt 0. Usado ao retomar da aba escondida. */
  reset(): void;
};

/**
 * Relógio do loop. `dt` ∈ [0, MAX_DT]; se o relógio voltar (`now < last`, lição dos protótipos: tela preta
 * por dt negativo) ou vier um instante inválido, ele reinicia a partir do novo ponto com dt 0.
 * `t` é a soma dos dt já limitados: nunca anda para trás e não salta depois de pausas (shaders e animações
 * usam `t`, não o relógio de parede).
 */
export function createClock(): Clock {
  let last: number | null = null;
  let t = 0;
  return {
    tick(now) {
      if (!Number.isFinite(now)) return { dt: 0, t };
      if (last === null || now < last) {
        last = now;
        return { dt: 0, t };
      }
      const dt = Math.min(MAX_DT, (now - last) / 1000);
      last = now;
      t += dt;
      return { dt, t };
    },
    reset() {
      last = null;
    },
  };
}
