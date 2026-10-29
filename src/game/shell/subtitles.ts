import type { Line } from "../layers/types";

/**
 * Legendas com presença (T10, bíblia 12b.2): lógica pura. A tela (`Subtitles.tsx`) só desenha o que sai daqui.
 * `Line` mora em `layers/types.ts` (as camadas falam com ele); é reexportado para quem pensa em legendas.
 */
export type { Line };

/** Palavras da fala, na ordem; a pontuação fica colada à palavra e espaços/quebras não contam. */
export function splitWords(text: string): string[] {
  return text.split(/\s+/).filter((w) => w.length > 0);
}

const BASE = 2.6;
const PER_CHAR = 0.06;
const PER_WORD = 0.045;
const MIN_SECONDS = 3.2;
const MAX_SECONDS = 10;

/** Quanto a fala fica na tela (s): cresce com o texto, entre 3,2 e 10 (bíblia 12b.2). */
export function lineDuration(text: string): number {
  const seconds = BASE + text.length * PER_CHAR + splitWords(text).length * PER_WORD;
  return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, seconds));
}

/** Espaço entre uma palavra e a seguinte ao entrar (espelha `--sub-word-stagger` do globals.css). */
export const WORD_STAGGER_MS = 42;
/** Uma fala longa não leva mais que isto para acabar de aparecer: o passo encolhe. */
const MAX_REVEAL_MS = 1200;

/** Passo entre palavras (ms) para uma fala de `count` palavras. */
export function wordStagger(count: number): number {
  if (count <= 1) return WORD_STAGGER_MS;
  return Math.min(WORD_STAGGER_MS, MAX_REVEAL_MS / (count - 1));
}

/** Atraso de cada palavra (ms). Com movimento reduzido tudo aparece junto, sem animação. */
export function wordDelays(count: number, reduced = false): number[] {
  const step = reduced ? 0 : wordStagger(count);
  return Array.from({ length: count }, (_, i) => Math.round(i * step));
}
