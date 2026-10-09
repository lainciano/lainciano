/** Números do altar ASCII do protótipo (salas.html, altar()) — parte do que foi aprovado. */
export const ASCII = {
  charset: " .:-=+*#%@",
  resolution: 0.17,
  /** Spec 6.5: ASCII com resolução menor no toque. */
  resolutionCoarse: 0.12,
  fov: 50,
  cameraZ: 4.2,
  /** TorusKnotGeometry(radius, tube, tubularSegments, radialSegments, p, q). */
  knot: [1, 0.34, 140, 18, 2, 3] as [number, number, number, number, number, number],
  keyLight: { intensity: 1.2, position: [3, 3, 4] as [number, number, number] },
  fillLight: { intensity: 0.35, position: [-4, -2, 2] as [number, number, number] },
} as const;

export const ORBIT = {
  /** rad por px de arrasto. */
  dragFactor: 0.004,
  /** rad/quadro acima do qual o giro dá a relíquia Órbita (spec 7.8). */
  threshold: 0.32,
  /** Giro lento de repouso (rad/quadro). */
  idle: { x: 0.004, y: 0.008 },
  /** Fração por quadro com que o giro volta ao repouso depois de soltar. */
  settle: 0.02,
  /** Inclinação máxima (rad) pela posição do cursor, e a suavização por quadro. */
  tilt: 0.6,
  tiltEase: 0.08,
  /** Seta segurada no altar focado: aceleração e teto (D18). */
  keyAccel: 0.03,
  keyMax: 0.4,
} as const;

export type Spin = { x: number; y: number };

const FRAME_MS = 1000 / 60;

/** Quadros de 60 Hz contidos em `deltaMs` (D17), presos em 0–4 (aba que volta do fundo). */
export function framesOf(deltaMs: number): number {
  return Math.min(4, Math.max(0, deltaMs / FRAME_MS));
}

export function dragSpin(dx: number, dy: number): Spin {
  return { x: dy * ORBIT.dragFactor, y: dx * ORBIT.dragFactor };
}

export function isOrbit(spin: Spin): boolean {
  return Math.abs(spin.x) > ORBIT.threshold || Math.abs(spin.y) > ORBIT.threshold;
}

/** Aproximação exponencial: `k` por quadro, composta para `frames` quadros. */
export function easeToward(current: number, target: number, k: number, frames: number): number {
  return current + (target - current) * (1 - (1 - k) ** frames);
}

export function settleSpin(spin: Spin, frames: number): Spin {
  return {
    x: easeToward(spin.x, ORBIT.idle.x, ORBIT.settle, frames),
    y: easeToward(spin.y, ORBIT.idle.y, ORBIT.settle, frames),
  };
}

export function keySpin(spin: Spin, direction: 1 | -1, frames: number): Spin {
  const y = Math.min(ORBIT.keyMax, Math.max(-ORBIT.keyMax, spin.y + direction * ORBIT.keyAccel * frames));
  return { x: spin.x, y };
}

/** px, py em 0–1 dentro do altar → inclinação da cena (x pela altura, y pela largura). */
export function tiltFor(px: number, py: number): Spin {
  const x = (py - 0.5) * ORBIT.tilt;
  const y = (px - 0.5) * ORBIT.tilt;
  return { x: x === 0 ? 0 : x, y: y === 0 ? 0 : y }; // sem -0 (toEqual distingue)
}
