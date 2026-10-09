export type Tone = {
  freq: number;
  dur: number;
  type: OscillatorType;
  gain: number;
  delay?: number;
  glideTo?: number;
};

export type SfxName =
  | "tick"
  | "click"
  | "grab"
  | "drop"
  | "error"
  | "key"
  | "relic"
  | "platinum"
  | "door"
  | "copy"
  | "collapse"
  | "restore"
  | "impact"
  | "case"
  | "hold"
  | "drip"
  | "chapter"
  | "tap"
  | "preview";

// Receitas da matriz de feedback (spec 8.1) e das salas (spec 7.2, 7.3, 8.3).
export const SFX: Record<SfxName, Tone[]> = {
  tick: [{ freq: 260, dur: 0.03, type: "square", gain: 0.025 }],
  click: [{ freq: 420, dur: 0.05, type: "square", gain: 0.04 }],
  grab: [{ freq: 180, dur: 0.06, type: "square", gain: 0.04 }],
  drop: [{ freq: 140, dur: 0.05, type: "square", gain: 0.035 }],
  error: [{ freq: 120, dur: 0.14, type: "sawtooth", gain: 0.04 }],
  key: [{ freq: 1000, dur: 0.015, type: "square", gain: 0.02 }],
  relic: [
    { freq: 520, dur: 0.09, type: "triangle", gain: 0.06 },
    { freq: 780, dur: 0.16, type: "triangle", gain: 0.06, delay: 0.09 },
  ],
  platinum: [
    { freq: 392, dur: 0.5, type: "triangle", gain: 0.05 },
    { freq: 494, dur: 0.5, type: "triangle", gain: 0.05, delay: 0.12 },
    { freq: 587, dur: 0.9, type: "triangle", gain: 0.05, delay: 0.24 },
  ],
  door: [{ freq: 90, dur: 0.25, type: "sawtooth", gain: 0.03, glideTo: 50 }],
  copy: [
    { freq: 660, dur: 0.04, type: "square", gain: 0.035 },
    { freq: 880, dur: 0.05, type: "square", gain: 0.035, delay: 0.06 },
  ],
  // Ruína: estrondo grave ao desabar (spec 8.3), reerguer e abrir case (protótipo), impacto (escala por velocidade).
  collapse: [{ freq: 45, dur: 0.9, type: "sine", gain: 0.08, glideTo: 28 }],
  restore: [{ freq: 330, dur: 0.12, type: "triangle", gain: 0.04 }],
  impact: [{ freq: 70, dur: 0.12, type: "sine", gain: 0.07, glideTo: 45 }],
  case: [{ freq: 600, dur: 0.08, type: "triangle", gain: 0.04 }],
  // Gravura: início do segurar (protótipo) e gota enquanto segura.
  hold: [{ freq: 110, dur: 0.25, type: "sawtooth", gain: 0.03 }],
  drip: [{ freq: 900, dur: 0.05, type: "sine", gain: 0.03, glideTo: 1800 }],
  // Clique em área vazia (mais grave e curto que "click") e prévia do volume (duas notas suaves).
  tap: [{ freq: 200, dur: 0.05, type: "sine", gain: 0.05, glideTo: 130 }],
  preview: [
    { freq: 440, dur: 0.12, type: "triangle", gain: 0.06 },
    { freq: 660, dur: 0.18, type: "triangle", gain: 0.06, delay: 0.09 },
  ],
  // Cartão de entrada de sala: swell grave que desce, como uma porta pesada assentando.
  chapter: [
    { freq: 98, dur: 1, type: "sine", gain: 0.06, glideTo: 49 },
    { freq: 147, dur: 0.9, type: "triangle", gain: 0.025, glideTo: 73, delay: 0.05 },
  ],
};

/** Rajada de ruído branco filtrado (estrondo, rasgo). */
export type NoiseBurst = {
  dur: number;
  gain: number;
  filter: BiquadFilterType;
  freq: number;
  q?: number;
  delay?: number;
};

export type NoiseName = "collapse" | "tear";

export const NOISE: Record<NoiseName, NoiseBurst[]> = {
  // Corpo do estrondo do desabar (spec 8.3: "senoide 45 Hz com queda de pitch + ruído").
  collapse: [{ dur: 0.7, gain: 0.07, filter: "lowpass", freq: 180 }],
  // "Rasgo" ao mover rápido sobre o retrato (spec 7.3); o volume vem da velocidade.
  tear: [{ dur: 0.06, gain: 0.035, filter: "bandpass", freq: 2400, q: 0.8 }],
};

/**
 * Sino FM do Portal (spec 8.3: razão 1:3.5). O decaimento é exponencial por constante de tempo (`tau`):
 * 40 dB abaixo em `tau·ln(100)` ≈ 3,9 s de cauda audível. A versão anterior caía 61 dB em 2,5 s, o que
 * soava como ~1 s e era coberto pelo estrondo da arena.
 */
export const BELL = { carrierHz: 220, modRatio: 3.5, modDepth: 600, peak: 0.16, attackS: 0.01, tau: 0.85, stopS: 7 } as const;
