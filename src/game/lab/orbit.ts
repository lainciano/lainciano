/**
 * Órbita do laboratório de modelos (só debug): matemática pura, sem three. A câmera gira em volta da origem (o
 * laboratório centraliza o modelo ali); arrastar muda yaw/pitch, a roda muda a distância. Soltar deixa uma inércia
 * curta que some em menos de 1 s (e nem existe com movimento reduzido).
 */

export const PITCH_LIMIT = (85 * Math.PI) / 180;
export const DIST_MIN = 0.15;
export const DIST_MAX = 4;
/** Radianos por pixel arrastado. */
const DRAG_SPEED = 0.008;
/** Fator da roda: `dist *= exp(delta × ZOOM_SPEED)`; delta típico de um clique da roda = 100. */
const ZOOM_SPEED = 0.0012;
/** Queda da velocidade (1/s): de 8 rad/s a < `STOP` em ~0,75 s. */
const DECAY = 7;
const MAX_SPEED = 8;
const STOP = 0.05;

export type Orbit = {
  yaw: number;
  pitch: number;
  dist: number;
  /** Velocidade angular (rad/s) que continua depois de soltar. */
  vYaw: number;
  vPitch: number;
  dragging: boolean;
};

export const clampPitch = (p: number) => Math.min(PITCH_LIMIT, Math.max(-PITCH_LIMIT, p));
export const clampDist = (d: number) => Math.min(DIST_MAX, Math.max(DIST_MIN, d));
const capSpeed = (v: number) => Math.min(MAX_SPEED, Math.max(-MAX_SPEED, v));

export function createOrbit(init: Partial<Pick<Orbit, "yaw" | "pitch" | "dist">> = {}): Orbit {
  return { yaw: init.yaw ?? 0.6, pitch: clampPitch(init.pitch ?? 0.25), dist: clampDist(init.dist ?? 1.5), vYaw: 0, vPitch: 0, dragging: false };
}

/** Um movimento do ponteiro (`dx`, `dy` em px) em `dt` segundos: gira e guarda a velocidade para a inércia. */
export function drag(o: Orbit, dx: number, dy: number, dt: number): void {
  o.dragging = true;
  const dYaw = -dx * DRAG_SPEED;
  const dPitch = dy * DRAG_SPEED;
  o.yaw += dYaw;
  o.pitch = clampPitch(o.pitch + dPitch);
  if (dt > 0) {
    o.vYaw = capSpeed(dYaw / dt);
    o.vPitch = capSpeed(dPitch / dt);
  }
}

/** Soltou: a inércia segue, salvo com movimento reduzido (para na hora). */
export function release(o: Orbit, reduced: boolean): void {
  o.dragging = false;
  if (reduced) {
    o.vYaw = 0;
    o.vPitch = 0;
  }
}

/** Roda (`delta` > 0 afasta, < 0 aproxima). */
export function zoom(o: Orbit, delta: number): void {
  o.dist = clampDist(o.dist * Math.exp(delta * ZOOM_SPEED));
}

/** Um quadro de inércia. Segurando, o ponteiro é quem move; a velocidade só vale depois de soltar. */
export function step(o: Orbit, dt: number, reduced: boolean): void {
  if (o.dragging) return;
  if (reduced) {
    o.vYaw = 0;
    o.vPitch = 0;
    return;
  }
  o.yaw += o.vYaw * dt;
  const pitch = o.pitch + o.vPitch * dt;
  o.pitch = clampPitch(pitch);
  if (o.pitch !== pitch) o.vPitch = 0;
  const k = Math.exp(-DECAY * Math.max(0, dt));
  o.vYaw *= k;
  o.vPitch *= k;
  if (Math.abs(o.vYaw) < STOP) o.vYaw = 0;
  if (Math.abs(o.vPitch) < STOP) o.vPitch = 0;
}

/** Posição do olho em relação ao alvo. */
export function eye(o: Orbit): [number, number, number] {
  const c = Math.cos(o.pitch);
  return [o.dist * c * Math.sin(o.yaw), o.dist * Math.sin(o.pitch), o.dist * c * Math.cos(o.yaw)];
}

/** Distância em que uma esfera de `radius` cabe na vertical e na horizontal com folga de 15%. */
export function fitDistance(radius: number, fovDeg: number, aspect: number): number {
  const half = (fovDeg * Math.PI) / 360;
  const limiting = Math.min(half, Math.atan(Math.tan(half) * Math.max(0.1, aspect)));
  return clampDist((radius * 1.15) / Math.sin(limiting));
}
