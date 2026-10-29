/**
 * Escada de pistas (contrato §3, bíblia 8): sem avançar por `gapSeconds`, sai a próxima pista, da mais vaga à mais
 * direta. Avançar no puzzle (`progress()`) zera o relógio. Depois da última, nada. Lógica pura: o tempo só anda
 * por `update(dt)` (quem chama decide quando o relógio corre: só andando, sem painel, com o jogo vivo).
 * `given` (opcional) recomeça de onde o save parou: recarregar não repete pistas.
 */
export type HintLadder = {
  /** O jogador avançou no puzzle: o relógio volta a zero. */
  progress(): void;
  /** Anda o relógio; devolve a pista que acabou de sair (no máximo uma por chamada) ou `null`. */
  update(dt: number): string | null;
  /** Quantas pistas já saíram. */
  given(): number;
};

export function createHintLadder(hints: readonly string[], gapSeconds: number, given = 0): HintLadder {
  const gap = Math.max(gapSeconds, 1e-3);
  let count = Math.min(Math.max(0, Math.floor(given)), hints.length);
  let clock = 0;
  return {
    progress() {
      clock = 0;
    },
    update(dt) {
      if (count >= hints.length) return null;
      clock += Number.isFinite(dt) && dt > 0 ? dt : 0;
      // pequena folga numérica: 40 quadros de 0,05 s somam 1,9999… e não podem perder a pista
      if (clock + 1e-6 < gap) return null;
      clock = 0;
      count += 1;
      return hints[count - 1];
    },
    given: () => count,
  };
}
