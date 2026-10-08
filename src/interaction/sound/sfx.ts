export type Tone = {
  freq: number;
  dur: number;
  type: OscillatorType;
  gain: number;
  delay?: number;
  glideTo?: number;
};

export type SfxName = "tick" | "click" | "grab" | "drop" | "error" | "key" | "relic" | "platinum" | "door" | "copy";

// Receitas da matriz de feedback (spec 8.1).
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
};
