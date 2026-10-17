/** Prévia flutuante do Relicário (spec 7.4). Números novos (folga, margem, inclinação): D17/D22. */
export const PREVIEW = {
  width: 360,
  height: 225,
  /** Distância entre o cursor e a prévia. */
  offset: 24,
  /** Distância mínima das bordas da viewport. */
  margin: 16,
  swapMs: 250,
  /** Graus por px/ms de velocidade horizontal, e o máximo. */
  tiltPerSpeed: 3,
  tiltMax: 6,
  /** Atrasos do quickTo (segue / inclina) e quando a inclinação volta a 0 sem movimento. */
  followS: 0.35,
  tiltS: 0.45,
  tiltResetMs: 120,
} as const;

type Point = { x: number; y: number };
type Size = { width: number; height: number };
type RowRect = { left: number; right: number; top: number; height: number };

const DEFAULT_SIZE: Size = { width: PREVIEW.width, height: PREVIEW.height };

/** Limita a [min, max]; se a faixa for vazia (viewport pequena), fica no mínimo. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/** Canto superior esquerdo da prévia perto do cursor: à direita/abaixo, invertendo perto das bordas. */
export function placePreview(
  pointer: Point,
  viewport: Size,
  size: Size = DEFAULT_SIZE,
  offset: number = PREVIEW.offset,
  margin: number = PREVIEW.margin,
): Point {
  let x = pointer.x + offset;
  if (x + size.width > viewport.width - margin) x = pointer.x - offset - size.width;
  let y = pointer.y + offset;
  if (y + size.height > viewport.height - margin) y = pointer.y - offset - size.height;
  return {
    x: clamp(x, margin, viewport.width - margin - size.width),
    y: clamp(y, margin, viewport.height - margin - size.height),
  };
}

/** Foco por teclado: a prévia encosta no fim (direita) da linha, centrada na altura dela. */
export function anchorPreview(
  row: RowRect,
  viewport: Size,
  size: Size = DEFAULT_SIZE,
  margin: number = PREVIEW.margin,
): Point {
  return {
    x: clamp(row.right - size.width, margin, viewport.width - margin - size.width),
    y: clamp(row.top + row.height / 2 - size.height / 2, margin, viewport.height - margin - size.height),
  };
}

/** Inclinação (graus) pela velocidade horizontal do cursor em px/ms. */
export function tiltFor(velocityX: number): number {
  const tilt = velocityX * PREVIEW.tiltPerSpeed;
  return Math.max(-PREVIEW.tiltMax, Math.min(PREVIEW.tiltMax, tilt)) + 0; // + 0 evita -0
}

/** Avança a fusão entre texturas (0 → 1 em PREVIEW.swapMs). */
export function stepSwap(progress: number, deltaMs: number): number {
  return Math.min(1, progress + deltaMs / PREVIEW.swapMs);
}

/**
 * Pedido de outra captura durante uma fusão: passada a metade, a textura de destino vira a atual e
 * a fusão recomeça dela (commit); antes, só o destino é trocado e a fusão continua (replace).
 */
export function resolveSwap(progress: number): "commit" | "replace" {
  return progress >= 0.5 ? "commit" : "replace";
}
