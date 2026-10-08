/** Números do protótipo aprovado (salas.html, ruina()). Não ajustar sem comparar lado a lado. */
export const RUINA = {
  gravityY: 1.15,
  wallThickness: 200,
  bodyScale: 0.92,
  chamferRadius: 3,
  restitution: 0.25,
  friction: 0.6,
  densitySlab: 0.004,
  densityGlyph: 0.0016,
  initialSpin: 0.08,
  dragStiffness: 0.18,
  dragDamping: 0.08,
  pushRadius: 110,
  pushForce: 0.0009,
  throwLimitY: -60,
  doubleTapMs: 380,
  collapseRatio: 0.6,
  collapseDelayMs: 500,
  shakePx: 6,
  shakeDuration: 0.5,
  restoreDuration: 0.7,
  restoreStagger: 0.02,
  waveScale: 9,
  waveDuration: 0.6,
  stepMs: 1000 / 60,
  maxStepsPerFrame: 3,
} as const;

/** Spec 7.2/8.1: impacto pela velocidade relativa (px por passo), no máx. 6 sons/s. */
export const IMPACT = { minSpeed: 2.5, fullSpeed: 18, minGain: 0.15, maxPerSecond: 6 } as const;

/** Flash de contorno --sangue antes de navegar para o case. */
export const CASE_NAV_DELAY_MS = 260;

export type Rect = { x: number; y: number; width: number; height: number };

/** Chão e paredes (centros, como Bodies.rectangle). Sem teto: um corpo pode sair por cima. */
export function arenaWalls(width: number, height: number, thickness: number = RUINA.wallThickness): Rect[] {
  return [
    { x: width / 2, y: height + thickness / 2, width: width * 3, height: thickness },
    { x: -thickness / 2, y: height / 2 - height, width: thickness, height: height * 4 },
    { x: width + thickness / 2, y: height / 2 - height, width: thickness, height: height * 4 },
  ];
}

/** Relíquia Arremesso: corpo acima do topo da arena. */
export function isThrown(y: number): boolean {
  return y < RUINA.throwLimitY;
}

export type TapRecord = { id: number; time: number };

export function isDoubleTap(previous: TapRecord | null, id: number, now: number): boolean {
  return previous !== null && previous.id === id && now - previous.time < RUINA.doubleTapMs;
}

/** Relíquia Case: toque duplo numa laje (letras não abrem nada). */
export function opensCase(isSlab: boolean, previous: TapRecord | null, id: number, now: number): boolean {
  return isSlab && isDoubleTap(previous, id, now);
}

/** Mouse sem arrastar empurra corpos num raio de 110 px (força 0,0009 × massa, para fora). */
export function pushForce(dx: number, dy: number, mass: number): { x: number; y: number } | null {
  const distance = Math.hypot(dx, dy);
  if (distance >= RUINA.pushRadius || distance <= 1) return null;
  return {
    x: (dx / distance) * RUINA.pushForce * mass,
    y: (dy / distance) * RUINA.pushForce * mass,
  };
}

/** Volume do impacto (0 = silêncio), proporcional à velocidade relativa da colisão. */
export function impactGain(speed: number): number {
  if (speed < IMPACT.minSpeed) return 0;
  const t = (speed - IMPACT.minSpeed) / (IMPACT.fullSpeed - IMPACT.minSpeed);
  return Math.min(1, Math.max(IMPACT.minGain, t));
}

/**
 * Passo fixo de 1/60 s (o protótipo dava um passo por rAF). A tolerância de 1/4 de passo absorve o
 * jitter de 60 Hz (sempre 1 passo); a 120 Hz roda 1 passo a cada 2 quadros; no máx. 3 por quadro.
 */
export function fixedSteps(accumulator: number, deltaMs: number): { steps: number; rest: number } {
  const total = Math.min(accumulator + deltaMs, RUINA.stepMs * RUINA.maxStepsPerFrame);
  const steps = Math.floor(total / RUINA.stepMs + 0.25);
  return { steps, rest: total - steps * RUINA.stepMs };
}
