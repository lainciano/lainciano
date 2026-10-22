export type Vec2 = { x: number; z: number };
export type Box2 = { minX: number; maxX: number; minZ: number; maxZ: number };

/** Passo máximo por iteração: evita atravessar caixas finas com deltas grandes. */
const MAX_STEP = 0.1;
const BISECT = 12;
const EPS = 1e-12;

/** Distância com sinal de `p` à caixa: negativa dentro (profundidade até a face mais próxima). */
function boxSdf(p: Vec2, b: Box2): number {
  const dx = Math.max(b.minX - p.x, 0, p.x - b.maxX);
  const dz = Math.max(b.minZ - p.z, 0, p.z - b.maxZ);
  if (dx > 0 || dz > 0) return Math.hypot(dx, dz);
  return -Math.min(p.x - b.minX, b.maxX - p.x, p.z - b.minZ, b.maxZ - p.z);
}

/** Folga até `bounds` encolhido pelo raio; negativa quando o círculo sai da sala. */
function boundsMargin(p: Vec2, radius: number, bounds: Box2): number {
  return Math.min(
    p.x - (bounds.minX + radius),
    bounds.maxX - radius - p.x,
    p.z - (bounds.minZ + radius),
    bounds.maxZ - radius - p.z,
  );
}

/** Círculo (centro p, raio r) inteiro dentro de `bounds` e sem tocar nenhuma caixa. */
function isFree(p: Vec2, radius: number, boxes: readonly Box2[], bounds: Box2): boolean {
  if (boundsMargin(p, radius, bounds) < 0) return false;
  for (const b of boxes) {
    if (boxSdf(p, b) < radius) return false;
  }
  return true;
}

/**
 * Passo permitido: cada restrição (sala e cada caixa) fica satisfeita em `to` ou, se já
 * estava violada em `from`, não piora. Quem começa dentro do raio desliza e sai, sem atravessar.
 */
function canStep(
  from: Vec2,
  to: Vec2,
  radius: number,
  boxes: readonly Box2[],
  bounds: Box2,
): boolean {
  const mTo = boundsMargin(to, radius, bounds);
  if (mTo < 0 && mTo < boundsMargin(from, radius, bounds) - EPS) return false;
  for (const b of boxes) {
    const cTo = boxSdf(to, b) - radius;
    if (cTo < 0 && cTo < boxSdf(from, b) - radius - EPS) return false;
  }
  return true;
}

/** Anda um eixo; se o destino não é permitido, avança até o contato por bisseção. */
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
  if (canStep(p, target, radius, boxes, bounds)) return target;
  let lo = 0;
  let hi = d;
  for (let i = 0; i < BISECT; i++) {
    const mid = (lo + hi) / 2;
    if (canStep(p, { ...p, [axis]: p[axis] + mid }, radius, boxes, bounds)) lo = mid;
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
  if (!Number.isFinite(delta.x) || !Number.isFinite(delta.z)) return from;
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
