export type FrameMetrics = {
  /** Intervalo entre quadros em ms. Zero, negativo ou não finito é descartado. */
  push(ms: number): void;
  p50(): number;
  p95(): number;
};

/**
 * Tempo de quadro numa janela deslizante (anel de `size` amostras). Percentil pelo posto ⌊q·n⌉ (arredondado)
 * sobre a janela ordenada, com viés para cima: é o lado conservador para tempo de quadro (com 105 amostras,
 * 5 quadros lentos já aparecem no p95). Janela vazia = 0.
 */
export function createFrameMetrics(size = 240): FrameMetrics {
  const capacity = Math.max(1, Math.floor(size));
  const ring = new Float64Array(capacity);
  let count = 0;
  let head = 0;

  const percentile = (q: number): number => {
    if (count === 0) return 0;
    const sorted = Array.from(ring.subarray(0, count)).sort((a, b) => a - b);
    return sorted[Math.min(count - 1, Math.round(q * count))];
  };

  return {
    push(ms) {
      if (!Number.isFinite(ms) || ms <= 0) return;
      ring[head] = ms;
      head = (head + 1) % capacity;
      if (count < capacity) count += 1;
    },
    p50: () => percentile(0.5),
    p95: () => percentile(0.95),
  };
}

/** Quantos quadros seguidos podem falhar antes de o jogo desistir (≈ 0,5 s a 60 fps): erro de uma vez só é tolerado. */
export const MAX_FAILED_FRAMES = 30;

/**
 * Sequência de quadros que falharam. `record(falhou)` devolve `true` quando chegou a `limit` seguidos (um quadro bom
 * zera a conta). Um erro persistente por quadro deixaria uma tela morta (o loop gira, nada muda): o engine para e
 * pede o aviso de falha com "voltar ao site".
 */
export function createFailureStreak(limit = MAX_FAILED_FRAMES) {
  let run = 0;
  return {
    record(failed: boolean): boolean {
      run = failed ? run + 1 : 0;
      return run >= limit;
    },
    reset() {
      run = 0;
    },
  };
}
