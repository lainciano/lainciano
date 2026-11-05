import type { Stone } from "../stones";

/**
 * Lógica pura do ato Relíquia (spec Limiar 3.5): quantas pedras e onde caem, o ponteiro com velocidade medida
 * entre eventos, os impactos no chão (baque escalado), o voo até o contador e a máquina do "pegar".
 * Unidades da física: px e ms.
 */

type Point = { x: number; y: number };
type Rect = { left: number; top: number; width: number; height: number };

/** Faixa de pedras (spec: 9 a 14). */
export const STONE_COUNT = [9, 14] as const;

export function stoneCount(rand: () => number): number {
  const [min, max] = STONE_COUNT;
  return min + Math.min(max - min, Math.floor(rand() * (max - min + 1)));
}

/**
 * As pedras nascem numa faixa em volta da relíquia (para cobri-la): no mínimo esta largura (px). Círculos
 * sem atrito não empilham (rolam para os lados), então quem cobre é a fileira no chão, na frente do disco.
 */
const MIN_BAND_PX = 400;
/** Largura da faixa em raios da relíquia. */
const BAND_RADII = 12;

/** Faixa horizontal `[left, left + width)` onde as pedras nascem, dentro da largura do ato. */
export function stoneBand(centerX: number, relicR: number, width: number): { left: number; width: number } {
  const band = Math.min(width, Math.max(MIN_BAND_PX, relicR * BAND_RADII));
  const left = Math.min(Math.max(0, centerX - band / 2), Math.max(0, width - band));
  return { left, width: band };
}

/** Desloca as pedras geradas numa faixa (x de 0 a `band.width`) para a posição da faixa. */
export function placeInBand(stones: readonly Stone[], band: { left: number }): Stone[] {
  return stones.map((s) => ({ ...s, x: s.x + band.left }));
}

export type TrackedPointer = { x: number; y: number; vx: number; vy: number; t: number };

/** Sem evento por este tempo, o ponteiro conta como parado (velocidade 0). */
export const POINTER_STALE_MS = 80;
/** Teto da velocidade do ponteiro (px/ms): um salto do mouse não arremessa as pedras. */
export const MAX_POINTER_SPEED = 3;

const capSpeed = (vx: number, vy: number) => {
  const speed = Math.hypot(vx, vy);
  if (speed <= MAX_POINTER_SPEED) return { vx, vy };
  const k = MAX_POINTER_SPEED / speed;
  return { vx: vx * k, vy: vy * k };
};

/** Novo evento do ponteiro: velocidade = deslocamento ÷ tempo desde o evento anterior. */
export function trackPointer(prev: TrackedPointer | null, x: number, y: number, t: number): TrackedPointer {
  if (!prev) return { x, y, vx: 0, vy: 0, t };
  const dt = t - prev.t;
  if (dt <= 0) return { ...prev, x, y }; // mesmo instante: mantém a velocidade
  if (dt > POINTER_STALE_MS) return { x, y, vx: 0, vy: 0, t };
  return { x, y, ...capSpeed((x - prev.x) / dt, (y - prev.y) / dt), t };
}

/** Ponteiro como `stepStones` o recebe agora (parado há tempo: sem velocidade, só o empurrão mínimo). */
export function pointerAt(
  tracked: TrackedPointer | null,
  now: number,
): { x: number; y: number; vx: number; vy: number } | null {
  if (!tracked) return null;
  const stale = now - tracked.t > POINTER_STALE_MS;
  return { x: tracked.x, y: tracked.y, vx: stale ? 0 : tracked.vx, vy: stale ? 0 : tracked.vy };
}

/** Velocidade mínima (px/ms) de queda que conta como impacto (as pedras nunca param de vez: vy ≈ −0,012). */
export const IMPACT_MIN_SPEED = 0.25;
/** Velocidade de impacto que dá o baque cheio. */
const THUD_FULL_SPEED = 2;
/** Só os primeiros impactos fazem baque. */
export const MAX_THUDS = 6;

/** Velocidades das pedras que bateram no chão neste passo (vinham caindo rápido e agora tocam o chão). */
export function floorImpacts(prev: readonly Stone[], next: readonly Stone[], floor: number): number[] {
  const speeds: number[] = [];
  next.forEach((s, i) => {
    const before = prev[i];
    if (!before || before.vy < IMPACT_MIN_SPEED || s.vy > 0) return;
    if (s.y + s.r >= floor - 0.5) speeds.push(before.vy);
  });
  return speeds;
}

/** Volume do baque pela velocidade do impacto (0,15 a 1). */
export function thudGain(speed: number): number {
  return Math.min(1, Math.max(0.15, speed / THUD_FULL_SPEED));
}

/** Menor escala da relíquia ao chegar ao contador. */
const MIN_FLY_SCALE = 0.12;

/**
 * Destino do voo: translação do elemento (caixa `size`×`size`, origem da transformação no centro) para o
 * centro do contador, em coordenadas do ato (`origin` é o canto do ato na viewport), e a escala de chegada.
 */
export function flyTo(target: Rect, origin: Point, size: number): { x: number; y: number; scale: number } {
  const cx = target.left + target.width / 2 - origin.x;
  const cy = target.top + target.height / 2 - origin.y;
  const scale = size > 0 ? Math.max(MIN_FLY_SCALE, Math.min(1, target.height / size)) : 1;
  return { x: cx - size / 2, y: cy - size / 2, scale };
}

export type CollectState = "idle" | "taking" | "collected";

/** Pegar só sai de "idle" (clique e botão juntos contam uma vez); chegar só sai de "taking". */
export function collectStep(state: CollectState, event: "take" | "arrive"): CollectState | null {
  if (event === "take") return state === "idle" ? "taking" : null;
  return state === "taking" ? "collected" : null;
}
