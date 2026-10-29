import type { LayerPuzzle, Line } from "../layers/types";
import { createHintLadder } from "../puzzles/hints";
import type { SaveV1 } from "../save/schema";

/**
 * Escada de pistas ligada à sessão (T12). O relógio só corre "ativo" (jogo vivo, andando, sem painel: ler o bilhete
 * não conta como estar parado); um passo dado no puzzle (o save mudou de passos), em qualquer modo, zera o relógio.
 * Cada pista sai como fala de pista (`hint: true`: espera a fala da história, ver `shell/lineQueue.ts`) e a camada
 * grava que ela saiu (recarregar não repete; a 3ª libera o forçar). Resolvido, a escada para.
 */

/** Intervalo entre pistas no jogo (s). `?debug=1&hintgap=2` acelera para teste. */
export const HINT_GAP = 60;

export function hintGapFrom(search: string, debug: boolean): number {
  if (!debug) return HINT_GAP;
  const raw = new URLSearchParams(search).get("hintgap");
  const n = raw === null ? Number.NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : HINT_GAP;
}

/** O relógio da escada corre só andando, sem painel e sem "pausado" (mouse solto pelo Esc). */
export function hintClockRuns(mode: string, paused: boolean): boolean {
  return mode === "walk" && !paused;
}

export type HintDriver = { update(dt: number, active: boolean): void };

export function createHintDriver(puzzle: LayerPuzzle, save: () => SaveV1, gap: number, say: (l: Line) => void): HintDriver {
  const ladder = createHintLadder(puzzle.hints, gap, puzzle.given(save()));
  let steps = puzzle.steps(save());
  return {
    update(dt, active) {
      const s = save();
      if (puzzle.solved(s)) return;
      const now = puzzle.steps(s);
      if (now !== steps) {
        steps = now;
        ladder.progress();
      }
      if (!active) return;
      const text = ladder.update(dt);
      if (text === null) return;
      puzzle.hint();
      say({ text, kind: "speech", hint: true });
    },
  };
}
