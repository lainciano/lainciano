/** Relíquia Leitor (spec 7.7, 8.4): 95% do corpo de um post. Página que não rola: 15 s com o corpo visível. */
export const READER = { threshold: 0.95, dwellMs: 15000 } as const;

/** Fração do corpo que já passou pela borda de baixo da janela (0–1), a partir do getBoundingClientRect. */
export function readingProgress(top: number, height: number, viewportHeight: number): number {
  if (height <= 0) return 0;
  return Math.min(1, Math.max(0, (viewportHeight - top) / height));
}

type ReaderInput = { progress: number; scrolled: boolean; scrollable: boolean; dwellMs: number };

/** Chegou a 95% lendo: rolou desde a montagem, ou a página não rola e o visitante ficou (D8). */
export function shouldUnlockReader({ progress, scrolled, scrollable, dwellMs }: ReaderInput): boolean {
  if (progress < READER.threshold) return false;
  return scrolled || (!scrollable && dwellMs >= READER.dwellMs);
}
