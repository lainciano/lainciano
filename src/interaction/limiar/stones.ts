export type Stone = { x: number; y: number; vx: number; vy: number; r: number };
export type Bounds = { width: number; height: number };
type Pointer = { x: number; y: number; vx: number; vy: number };

// Unidades: px e ms (velocidade em px/ms).
const GRAVITY = 0.0016;
const RESTITUTION = 0.3;
const FLOOR_FRICTION = 0.85;
const AIR_DAMPING = 0.9995;
const MAX_DT = 32;
const REST_SPEED = 0.01;
const PUSH_MIN = 0.003;
const PUSH_PER_SPEED = 0.02;
const COVER_LIMIT = 0.4;

export function spawnStones(count: number, bounds: Bounds, rand: () => number): Stone[] {
  const maxR = Math.min(40, bounds.width / 10);
  const minR = maxR * 0.5;
  return Array.from({ length: count }, () => {
    const r = minR + rand() * (maxR - minR);
    return {
      x: r + rand() * Math.max(0, bounds.width - 2 * r),
      y: r + rand() * Math.max(0, bounds.height / 2 - r),
      vx: 0,
      vy: 0,
      r,
    };
  });
}

export function stepStones(
  stones: readonly Stone[],
  dtMs: number,
  bounds: Bounds,
  pointer: Pointer | null,
): Stone[] {
  const dt = Math.min(Math.max(dtMs, 0), MAX_DT);
  const next = stones.map((s) => ({ ...s }));

  for (const s of next) {
    s.vy += GRAVITY * dt;

    if (pointer) {
      const dx = s.x - pointer.x;
      const dy = s.y - pointer.y;
      const d = Math.hypot(dx, dy);
      const reach = 2 * s.r;
      if (d < reach) {
        // Direção ponteiro → pedra; se coincidem, empurra para cima.
        const nx = d > 0 ? dx / d : 0;
        const ny = d > 0 ? dy / d : -1;
        const strength = (1 - d / reach) * (PUSH_MIN + PUSH_PER_SPEED * Math.hypot(pointer.vx, pointer.vy));
        s.vx += nx * strength * dt;
        s.vy += ny * strength * dt;
      }
    }

    const damping = Math.pow(AIR_DAMPING, dt);
    s.vx *= damping;
    s.vy *= damping;
    s.x += s.vx * dt;
    s.y += s.vy * dt;

    // Paredes e chão.
    if (s.x - s.r < 0) {
      s.x = s.r;
      s.vx = Math.abs(s.vx) * RESTITUTION;
    } else if (s.x + s.r > bounds.width) {
      s.x = bounds.width - s.r;
      s.vx = -Math.abs(s.vx) * RESTITUTION;
    }
    if (s.y - s.r < 0) {
      s.y = s.r;
      s.vy = Math.abs(s.vy) * RESTITUTION;
    }
    if (s.y + s.r >= bounds.height) {
      s.y = bounds.height - s.r;
      s.vy = s.vy > REST_SPEED ? -s.vy * RESTITUTION : 0;
      s.vx *= Math.pow(FLOOR_FRICTION, dt / 16);
      if (Math.abs(s.vx) < REST_SPEED * 0.1) s.vx = 0;
    }
  }

  // Colisão círculo-círculo simples (massas iguais).
  for (let i = 0; i < next.length; i++) {
    for (let j = i + 1; j < next.length; j++) {
      const a = next[i];
      const b = next[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const min = a.r + b.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2);
      const nx = d > 0 ? dx / d : 1;
      const ny = d > 0 ? dy / d : 0;
      const push = (min - d) / 2;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rel < 0) {
        const impulse = (-(1 + RESTITUTION) * rel) / 2;
        a.vx -= impulse * nx;
        a.vy -= impulse * ny;
        b.vx += impulse * nx;
        b.vy += impulse * ny;
      }
    }
  }

  return next;
}

/** Descoberta quando nenhuma pedra cobre mais de 40% do raio da relíquia (sobreposição de círculos). */
export function isUncovered(
  relic: { x: number; y: number; r: number },
  stones: readonly Stone[],
): boolean {
  return stones.every((s) => {
    const overlap = relic.r + s.r - Math.hypot(s.x - relic.x, s.y - relic.y);
    return overlap / relic.r <= COVER_LIMIT;
  });
}
