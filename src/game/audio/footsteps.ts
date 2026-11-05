import type { SurfaceMaterial } from "../world/surfaces";

/**
 * Passos da sala (placeholder procedural: o dono, produtor, traz as gravações depois). Lógica pura, sem WebAudio:
 * o ritmo (`stepInterval`) e o timbre por superfície (`footstepParams`) saem daqui; `game-audio.ts` os toca.
 */

/** Passada de referência: 0,77 m andando a 1,4 m/s dá 0,55 s por passo; cresce devagar com a velocidade. */
const STRIDE = { walk: 0.77, perMetreSecond: 0.095, refSpeed: 1.4 } as const;
/** Agachado, o passo é mais espaçado (e a velocidade já é menor). */
const CROUCH_SLOWER = 1.4;

/** Segundos entre dois passos: andar (1,4 m/s) ~0,55 s, correr (2,6 m/s) ~0,34 s, agachado ×1,4. */
export function stepInterval(speed: number, crouched: boolean): number {
  const v = Math.max(0.2, Number.isFinite(speed) ? speed : STRIDE.refSpeed);
  const stride = STRIDE.walk + (v - STRIDE.refSpeed) * STRIDE.perMetreSecond;
  return (stride / v) * (crouched ? CROUCH_SLOWER : 1);
}

/** Quantas tomadas diferentes cada superfície tem (3 a 5, para o passo não soar metralhadora). */
export const FOOTSTEP_TAKES = 4;

/** Rangido da tábua solta: um glissando curto de dente de serra, somado ao passo. */
export type Creak = { from: number; to: number; dur: number; gain: number };

export type FootstepParams = {
  /** Frequência do filtro passa-banda do ruído (Hz). */
  filter: number;
  q: number;
  /** Ganho de pico (0..1, antes do volume do jogo). */
  gain: number;
  /** Duração do estalo em segundos. */
  dur: number;
  creak?: Creak;
};

const BASE: Record<SurfaceMaterial, FootstepParams> = {
  granilite: { filter: 1800, q: 0.9, gain: 0.22, dur: 0.07 },
  tapete: { filter: 420, q: 0.5, gain: 0.07, dur: 0.11 },
  madeira: { filter: 900, q: 1.2, gain: 0.2, dur: 0.09 },
  "tabua-solta": { filter: 700, q: 2.5, gain: 0.24, dur: 0.1, creak: { from: 180, to: 95, dur: 0.32, gain: 0.05 } },
  metal: { filter: 2600, q: 3, gain: 0.2, dur: 0.12 },
  papel: { filter: 3200, q: 0.6, gain: 0.08, dur: 0.06 },
  vidro: { filter: 3800, q: 4, gain: 0.16, dur: 0.08 },
  tecido: { filter: 500, q: 0.5, gain: 0.06, dur: 0.1 },
  ceramica: { filter: 2200, q: 1.5, gain: 0.2, dur: 0.07 },
};

/** A tomada (0..FOOTSTEP_TAKES-1) que uma semente escolhe. */
export function takeOf(seed: number): number {
  const n = Math.floor(Math.abs(Number.isFinite(seed) ? seed : 0));
  return n % FOOTSTEP_TAKES;
}

/** Próxima semente: sempre outra tomada que a anterior (nunca o mesmo passo duas vezes seguidas). `rand` em [0, 1). */
export function nextSeed(prev: number, rand: number): number {
  const jump = 1 + Math.min(FOOTSTEP_TAKES - 2, Math.floor(rand * (FOOTSTEP_TAKES - 1)));
  return (takeOf(prev) + jump) % FOOTSTEP_TAKES;
}

/** Timbre do passo sobre `surface`: a mesma semente dá sempre os mesmos parâmetros; 4 tomadas por superfície. */
export function footstepParams(surface: SurfaceMaterial, seed: number): FootstepParams {
  const base = BASE[surface];
  const take = takeOf(seed);
  // cada tomada mexe um pouco no timbre, no peso e na duração (passo firme, passo leve…)
  const filter = base.filter * (1 + (take - 1.5) * 0.07);
  const gain = base.gain * (0.9 + 0.07 * ((take * 3) % FOOTSTEP_TAKES));
  const dur = base.dur * (1 + (take % 2 === 0 ? -0.08 : 0.1));
  const out: FootstepParams = { filter, q: base.q, gain, dur };
  if (base.creak) out.creak = { ...base.creak, from: base.creak.from * (1 + (take - 1.5) * 0.06) };
  return out;
}
