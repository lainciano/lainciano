import { ENGRAVING_LENS_MARKS } from "@/rooms/shared/engravingShader";

/** Lente da Câmara (spec 7.5: raio 90 px, cresce até 180 ao segurar). Demais números: D16/D17. */
export const LENS = {
  radius: 90,
  maxRadius: 180,
  coarseRadius: 64,
  coarseMaxRadius: 128,
  /** Crescimento ao segurar: (180 − 90) / 600 ms. */
  growPerMs: 0.15,
  /** Abrir, fechar e voltar à base: rápido. */
  snapPerMs: 0.6,
  keyStep: 24,
  keyStepFast: 72,
  /** Nova marca ao andar esta fração do raio, ou a cada markEveryMs segurando. */
  markEveryRadius: 0.35,
  markEveryMs: 150,
  markFadeMs: 3000,
  marks: ENGRAVING_LENS_MARKS,
} as const;

type Point = { x: number; y: number };
type Size = { width: number; height: number };
export type LensRadii = { base: number; max: number };

export function lensRadii(coarse: boolean): LensRadii {
  return coarse ? { base: LENS.coarseRadius, max: LENS.coarseMaxRadius } : { base: LENS.radius, max: LENS.maxRadius };
}

/** Raio desejado: fechada (0), aberta (base) ou segurando (máximo). */
export function lensTarget(active: boolean, holding: boolean, radii: LensRadii): number {
  if (!active) return 0;
  return holding ? radii.max : radii.base;
}

/** Aproxima o raio do alvo: abre/encolhe rápido; acima da base, cresce devagar (o "segurar"). */
export function stepLensRadius(radius: number, target: number, deltaMs: number, base: number): number {
  if (radius === target) return radius;
  if (target > radius) {
    const rate = radius < base ? LENS.snapPerMs : LENS.growPerMs;
    return Math.min(target, radius + rate * deltaMs);
  }
  return Math.max(target, radius - LENS.snapPerMs * deltaMs);
}

/** Progresso do anel de carga do cursor (0 na base, 1 no máximo). */
export function chargeOf(radius: number, radii: LensRadii): number {
  return Math.min(1, Math.max(0, (radius - radii.base) / (radii.max - radii.base)));
}

const KEY_DIRECTIONS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** Setas movem a lente (px da captura, origem em cima à esquerda); Shift = passo largo. */
export function moveLensByKey(position: Point, key: string, size: Size, fast: boolean): Point | null {
  const direction = KEY_DIRECTIONS[key];
  if (!direction) return null;
  const step = fast ? LENS.keyStepFast : LENS.keyStep;
  return {
    x: Math.min(size.width, Math.max(0, position.x + direction[0] * step)),
    y: Math.min(size.height, Math.max(0, position.y + direction[1] * step)),
  };
}

/** px da captura (y para baixo) → UV do plano (y para cima). */
export function pxToUv(x: number, y: number, width: number, height: number): [number, number] {
  return [x / width, 1 - y / height];
}

/** Anel de marcas (x, y em UV; raio em px; força 0–1) lido pelo shader como uMarks. */
export type LensMarks = { data: Float32Array; next: number; lastX: number; lastY: number; lastAt: number };

export function createMarks(count: number = LENS.marks): LensMarks {
  return { data: new Float32Array(count * 4), next: 0, lastX: -Infinity, lastY: -Infinity, lastAt: -Infinity };
}

export function shouldMark(marks: LensMarks, x: number, y: number, radius: number, holding: boolean, now: number): boolean {
  if (radius < 1) return false;
  if (Math.hypot(x - marks.lastX, y - marks.lastY) >= radius * LENS.markEveryRadius) return true;
  return holding && now - marks.lastAt >= LENS.markEveryMs;
}

export function addMark(marks: LensMarks, u: number, v: number, radius: number, x: number, y: number, now: number) {
  const i = marks.next * 4;
  marks.data[i] = u;
  marks.data[i + 1] = v;
  marks.data[i + 2] = radius;
  marks.data[i + 3] = 1;
  marks.next = (marks.next + 1) % (marks.data.length / 4);
  marks.lastX = x;
  marks.lastY = y;
  marks.lastAt = now;
}

/** Desvanece as marcas; true enquanto alguma ainda aparece. */
export function fadeMarks(marks: LensMarks, deltaMs: number): boolean {
  let visible = false;
  for (let i = 3; i < marks.data.length; i += 4) {
    if (marks.data[i] <= 0) continue;
    marks.data[i] = Math.max(0, marks.data[i] - deltaMs / LENS.markFadeMs);
    if (marks.data[i] > 0) visible = true;
  }
  return visible;
}
