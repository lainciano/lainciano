/** Spec 6.5: no toque, "segurar" = toque longo de 400 ms (com vibração curta). */
export const LONG_PRESS_MS = 400;

/** Deslocamento máximo para o toque ainda contar como "segurar" e não como rolagem. */
export const LONG_PRESS_SLOP_PX = 10;

export function exceedsSlop(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) > LONG_PRESS_SLOP_PX;
}
