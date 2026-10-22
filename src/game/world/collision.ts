export type Vec2 = { x: number; z: number };
export type Box2 = { minX: number; maxX: number; minZ: number; maxZ: number };

/** Passo máximo por iteração: evita atravessar caixas finas com deltas grandes. */
const MAX_STEP = 0.1;
const BISECT = 12;

/** Círculo (centro p, raio r) inteiro dentro de `bounds` e sem tocar nenhuma caixa. */
function isFree(p: Vec2, radius: number, boxes: readonly Box2[], bounds: Box2): boolean {
  if (
    p.x < bounds.minX + radius ||
    p.x > bounds.maxX - radius ||
    p.z < bounds.minZ + radius ||
    p.z > bounds.maxZ - radius
  ) {
    return false;
  }
  for (const b of boxes) {
    const dx = Math.max(b.minX - p.x, 0, p.x - b.maxX);
    const dz = Math.max(b.minZ - p.z, 0, p.z - b.maxZ);
    if (dx * dx + dz * dz < radius * radius) return false;
  }
  return true;
}

/** Anda um eixo; se o destino colide, avança até o contato por bisseção. */
function moveAxis(
  p: Vec2,
  axis: "x" | "z",
  d: number,
  radius: number,
  boxes: readonly Box2[],
  bounds: Box2,
): Vec2 {
  if (d === 0) return p;
  const target = { ...p, [axis]: p[axis] + d };
  if (isFree(target, radius, boxes, bounds)) return target;
  let lo = 0;
  let hi = d;
  for (let i = 0; i < BISECT; i++) {
    const mid = (lo + hi) / 2;
    if (isFree({ ...p, [axis]: p[axis] + mid }, radius, boxes, bounds)) lo = mid;
    else hi = mid;
  }
  return { ...p, [axis]: p[axis] + lo };
}

/** Move o jogador (círculo de raio `radius`); no contato, desliza pelo eixo livre. */
export function moveWithCollision(
  from: Vec2,
  delta: Vec2,
  radius: number,
  boxes: readonly Box2[],
  bounds: Box2,
): Vec2 {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(delta.x), Math.abs(delta.z)) / MAX_STEP));
  const sx = delta.x / steps;
  const sz = delta.z / steps;
  let p = from;
  for (let i = 0; i < steps; i++) {
    p = moveAxis(p, "x", sx, radius, boxes, bounds);
    p = moveAxis(p, "z", sz, radius, boxes, bounds);
  }
  return p;
}

/** O círculo percorre o segmento a→b sem tocar caixas nem sair de `bounds`. */
export function segmentClear(
  a: Vec2,
  b: Vec2,
  radius: number,
  boxes: readonly Box2[],
  bounds: Box2,
): boolean {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.max(1, Math.ceil(len / (radius / 2)));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    if (!isFree(p, radius, boxes, bounds)) return false;
  }
  return true;
}
