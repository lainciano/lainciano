/**
 * Puzzle (contrato §3): um redutor puro. O estado mora no save (`save.puzzles[id]`); a camada traduz ações do
 * jogador (E num objeto, um segurar que completa, a escada de pistas) em `A`, aplica o `reduce` e executa os
 * efeitos (falar, som, relíquia, abrir algo). Nada aqui toca three, DOM ou relógio.
 */
export type PuzzleEffect =
  | { type: "say"; text: string }
  | { type: "sfx"; name: string }
  | { type: "relic"; id: string; clean: boolean }
  | { type: "open"; target: string };

export type Puzzle<S, A> = {
  id: string;
  initial: S;
  reduce(s: S, a: A): { state: S; effects: PuzzleEffect[] };
  solved(s: S): boolean;
  /** Escada de pistas, da mais vaga à mais direta (ver `createHintLadder`). */
  hints: readonly string[];
  /** Saída que nunca deixa preso (ex.: forçar a porta), liberada depois da última pista. */
  exit?: A;
};
