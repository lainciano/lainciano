/** Ímã do cursor em links e botões (spec 7.0: o anel puxa 30% em direção ao centro do alvo). */
export const MAGNET = { pull: 0.3, maxPx: 14, maxTargetWidth: 360, maxTargetHeight: 160 } as const;

type Rect = { left: number; top: number; width: number; height: number };

/**
 * Deslocamento do anel em relação ao mouse. O puxão tem teto e alvos grandes (linhas inteiras do
 * livro-razão da Biblioteca, 1100×150 px) não têm ímã: sem isso o centro do alvo ficava longe do
 * mouse e o anel parecia parado ou "não seguir".
 */
export function magnetOffset(pointerX: number, pointerY: number, target: Rect): { x: number; y: number } {
  if (target.width > MAGNET.maxTargetWidth || target.height > MAGNET.maxTargetHeight) return { x: 0, y: 0 };
  const dx = (target.left + target.width / 2 - pointerX) * MAGNET.pull;
  const dy = (target.top + target.height / 2 - pointerY) * MAGNET.pull;
  const length = Math.hypot(dx, dy);
  if (length === 0 || length <= MAGNET.maxPx) return { x: dx, y: dy };
  const k = MAGNET.maxPx / length;
  return { x: dx * k, y: dy * k };
}
