import type { SurfaceMaterial } from "../world/surfaces";
import type { FootstepParams } from "./footsteps";
import type { GameSfxName } from "./types";

/**
 * Receitas dos sons do jogo (dados puros, testáveis sem AudioContext). PLACEHOLDER procedural: cada receita é um
 * PONTO DE TROCA para o som real do dono (veja `game-audio.ts`, `SAMPLE_SLOTS`).
 */

export type GameTone = {
  freq: number;
  dur: number;
  type: OscillatorType;
  gain: number;
  delay?: number;
  /** Frequência final do glissando (exponencial). */
  glideTo?: number;
  /** Passa-baixa depois do oscilador (suaviza o dente de serra do rangido). */
  lowpass?: number;
};

export type GameBurst = {
  filter: BiquadFilterType;
  freq: number;
  q?: number;
  gain: number;
  dur: number;
  delay?: number;
  /** Subida em segundos (0 = estalo seco). */
  attack?: number;
  /** Frequência final do filtro. */
  glideTo?: number;
};

export type Recipe = { tones?: GameTone[]; bursts?: GameBurst[] };

/** Teto de ganho de pico de qualquer receita (antes do volume): nada estoura o master. */
export const RECIPE_PEAK_MAX = 0.4;

/** Passo: estalo de ruído filtrado + um baque grave (peso) + rangido, se a tábua for solta. */
export function stepRecipe(p: FootstepParams, scale = 1): Recipe {
  const s = Math.min(2, Math.max(0.1, Number.isFinite(scale) ? scale : 1));
  const recipe: Recipe = {
    bursts: [{ filter: "bandpass", freq: p.filter, q: p.q, gain: p.gain * s, dur: p.dur, attack: 0.004 }],
    tones: [{ freq: 90, glideTo: 55, dur: p.dur * 1.3, type: "sine", gain: p.gain * 0.55 * s }],
  };
  if (p.creak) recipe.tones!.push({ freq: p.creak.from, glideTo: p.creak.to, dur: p.creak.dur, type: "sawtooth", gain: p.creak.gain * s, delay: 0.02, lowpass: 700 });
  return recipe;
}

/** Timbre do material de um objeto: filtro do ruído e duração-base. */
const MATERIAL: Record<SurfaceMaterial, { filter: number; q: number; dur: number; ring?: number }> = {
  granilite: { filter: 1500, q: 1, dur: 0.08 },
  tapete: { filter: 380, q: 0.5, dur: 0.1 },
  madeira: { filter: 800, q: 1.4, dur: 0.1 },
  "tabua-solta": { filter: 650, q: 2, dur: 0.11 },
  metal: { filter: 2400, q: 3, dur: 0.14, ring: 1850 },
  papel: { filter: 3300, q: 0.6, dur: 0.07 },
  vidro: { filter: 3600, q: 4, dur: 0.1, ring: 2900 },
  tecido: { filter: 480, q: 0.5, dur: 0.1 },
  ceramica: { filter: 2000, q: 1.6, dur: 0.09, ring: 1300 },
};

/** Ruído de objeto: pegar é leve e curto; largar é pesado (baque); bater são dois toques secos e abafados. */
export function objectRecipe(material: SurfaceMaterial, kind: "pick" | "drop" | "knock"): Recipe {
  const m = MATERIAL[material];
  const ring = m.ring ? [{ freq: m.ring, dur: 0.18, type: "sine" as const, gain: 0.025 }] : [];
  if (kind === "pick") return { bursts: [{ filter: "bandpass", freq: m.filter, q: m.q, gain: 0.07, dur: m.dur, attack: 0.012 }], tones: ring.map((t) => ({ ...t, gain: t.gain * 0.5 })) };
  if (kind === "drop") {
    return {
      bursts: [{ filter: "bandpass", freq: m.filter * 0.8, q: m.q, gain: 0.16, dur: m.dur * 1.4, attack: 0.003 }],
      tones: [{ freq: 110, glideTo: 60, dur: 0.14, type: "sine", gain: 0.12 }, ...ring],
    };
  }
  const hit = (delay: number, gain: number): GameBurst => ({ filter: "lowpass", freq: Math.min(m.filter, 900), q: 0.8, gain, dur: 0.07, delay, attack: 0.002 });
  return {
    bursts: [hit(0, 0.2), hit(0.17, 0.16)],
    tones: [{ freq: 130, glideTo: 80, dur: 0.1, type: "sine", gain: 0.12 }, { freq: 130, glideTo: 80, dur: 0.1, type: "sine", gain: 0.1, delay: 0.17 }],
  };
}

/** Sons nomeados do puzzle da sala cinza. */
export const GAME_SFX: Record<GameSfxName, Recipe> = {
  // porta trancada: a maçaneta chocalha duas vezes
  knock: {
    bursts: [
      { filter: "bandpass", freq: 1900, q: 3, gain: 0.12, dur: 0.05, attack: 0.002 },
      { filter: "bandpass", freq: 1700, q: 3, gain: 0.1, dur: 0.05, delay: 0.09, attack: 0.002 },
      { filter: "lowpass", freq: 700, gain: 0.14, dur: 0.07, delay: 0.2, attack: 0.002 },
    ],
    tones: [{ freq: 120, glideTo: 70, dur: 0.12, type: "sine", gain: 0.12, delay: 0.2 }],
  },
  // chave achada: tilintar metálico curto
  key: {
    bursts: [{ filter: "highpass", freq: 3500, gain: 0.07, dur: 0.05, attack: 0.002 }],
    tones: [
      { freq: 2350, dur: 0.22, type: "sine", gain: 0.05 },
      { freq: 3170, dur: 0.18, type: "sine", gain: 0.035, delay: 0.045 },
      { freq: 1880, dur: 0.26, type: "sine", gain: 0.03, delay: 0.09 },
    ],
  },
  // porta destrancada: clique da lingueta, volta do tambor e baque do trinco
  unlock: {
    bursts: [
      { filter: "bandpass", freq: 2600, q: 4, gain: 0.14, dur: 0.035, attack: 0.001 },
      { filter: "bandpass", freq: 2000, q: 4, gain: 0.12, dur: 0.04, delay: 0.14, attack: 0.001 },
      { filter: "lowpass", freq: 600, gain: 0.16, dur: 0.1, delay: 0.3, attack: 0.002 },
    ],
    tones: [{ freq: 100, glideTo: 60, dur: 0.16, type: "sine", gain: 0.14, delay: 0.3 }],
  },
  // porta forçada: a madeira estala e a folha geme antes de ceder
  force: {
    bursts: [
      { filter: "lowpass", freq: 900, glideTo: 220, gain: 0.3, dur: 0.55, attack: 0.02 },
      { filter: "bandpass", freq: 2200, q: 2, gain: 0.2, dur: 0.06, delay: 0.5, attack: 0.001 },
    ],
    tones: [
      { freq: 160, glideTo: 70, dur: 0.6, type: "sawtooth", gain: 0.07, lowpass: 600 },
      { freq: 85, glideTo: 45, dur: 0.35, type: "sine", gain: 0.22, delay: 0.5 },
    ],
  },
};

/** Clique da lanterna: estalo agudo seco e um "tec" curto. */
export const FLASH_CLICK: Recipe = {
  bursts: [{ filter: "highpass", freq: 3000, gain: 0.1, dur: 0.018, attack: 0.001 }],
  tones: [{ freq: 1900, glideTo: 900, dur: 0.025, type: "square", gain: 0.03 }],
};

/** Tecla do celular: plástico que cede (clique abafado) com um "thock" curto; teclas diferentes soam diferentes. */
export function phoneKeyRecipe(key: string): Recipe {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const pitch = 0.92 + (h % 9) * 0.02;
  return {
    bursts: [{ filter: "bandpass", freq: 2300 * pitch, q: 1.4, gain: 0.07, dur: 0.022, attack: 0.001 }],
    tones: [{ freq: 520 * pitch, glideTo: 380, dur: 0.035, type: "triangle", gain: 0.035 }],
  };
}

/** Papel aberto no leitor: farfalhar de duas ondas (a dobra cede). */
export const PAPER_RUSTLE: Recipe = {
  bursts: [
    { filter: "bandpass", freq: 3400, glideTo: 2400, q: 0.7, gain: 0.09, dur: 0.2, attack: 0.05 },
    { filter: "bandpass", freq: 4200, glideTo: 3000, q: 0.8, gain: 0.07, dur: 0.14, delay: 0.16, attack: 0.04 },
  ],
};

/** Zumbido da lâmpada: harmônicos de 100 Hz (rede de 50/60 Hz dobrada), quase imperceptível. */
export const HUM = {
  /** Frequências (Hz) e ganho relativo de cada harmônico. */
  partials: [
    { freq: 100, gain: 1 },
    { freq: 200, gain: 0.45 },
    { freq: 300, gain: 0.22 },
    { freq: 500, gain: 0.08 },
  ],
  /** Ganho total por nível: a calma fica abaixo de 0,02 (tom de sala, não música). */
  level: { calm: 0.011, tension: 0.026 },
  /** Passa-baixa por nível (a tensão abafa e engrossa). */
  cutoff: { calm: 650, tension: 380 },
  /** Respiração lenta do zumbido (Hz e profundidade relativa). */
  tremolo: { rate: 0.23, depth: 0.18 },
  /** Constante de tempo (s) das mudanças de nível e do fade de entrada/saída. */
  tau: 0.8,
  /** Sub-grave que só existe na tensão (sino do cômodo "respirando"). */
  sub: { freq: 52, gain: { calm: 0, tension: 0.02 } },
} as const;

/** Pico de ganho de uma receita (maior ganho de tom/ruído, sem somar). */
export function recipePeak(r: Recipe): number {
  return Math.max(0, ...(r.tones ?? []).map((t) => t.gain), ...(r.bursts ?? []).map((b) => b.gain));
}
