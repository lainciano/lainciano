import { useSyncExternalStore } from "react";
import { STORAGE_KEYS } from "@/interaction/boot";
import { readingStore } from "@/interaction/reading-mode/store";
import { parseSoundPref, shouldPlay, type SoundPref } from "./policy";
import { SFX, type SfxName, type Tone } from "./sfx";

const MAX_VOICES = 12;

type Graph = { ctx: AudioContext; sfx: GainNode; ambience: GainNode };

let graph: Graph | null = null;
let pref: SoundPref | null = null;
let voices = 0;
let initialized = false;
// Vira true no primeiro gesto (ou ao ligar o som por um clique): antes disso o contexto nem é criado.
let unlocked = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function buildGraph(): Graph | null {
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  const ctx = new Ctor();
  const compressor = ctx.createDynamicsCompressor();
  compressor.connect(ctx.destination);
  const master = ctx.createGain();
  master.gain.value = 0.6;
  master.connect(compressor);
  const sfx = ctx.createGain();
  sfx.gain.value = 0.5;
  sfx.connect(master);
  const ambience = ctx.createGain();
  ambience.gain.value = 0.35;
  ambience.connect(master);
  return { ctx, sfx, ambience };
}

function ensure(): Graph | null {
  if (!graph) graph = buildGraph();
  if (graph?.ctx.state === "suspended") void graph.ctx.resume();
  return graph;
}

function canPlay(): boolean {
  return shouldPlay(pref, readingStore.getSnapshot(), unlocked);
}

function playTone(g: Graph, tone: Tone) {
  if (voices >= MAX_VOICES) return;
  const start = g.ctx.currentTime + (tone.delay ?? 0);
  const osc = g.ctx.createOscillator();
  const env = g.ctx.createGain();
  osc.type = tone.type;
  osc.frequency.setValueAtTime(tone.freq, start);
  if (tone.glideTo) osc.frequency.exponentialRampToValueAtTime(tone.glideTo, start + tone.dur);
  env.gain.setValueAtTime(tone.gain, start);
  env.gain.exponentialRampToValueAtTime(0.0001, start + tone.dur);
  osc.connect(env).connect(g.sfx);
  voices += 1;
  osc.onended = () => {
    voices -= 1;
  };
  osc.start(start);
  osc.stop(start + tone.dur + 0.02);
}

export const soundEngine = {
  init() {
    if (initialized || typeof window === "undefined") return;
    initialized = true;
    try {
      pref = parseSoundPref(localStorage.getItem(STORAGE_KEYS.sound));
    } catch {
      pref = null;
    }
    // O navegador só libera áudio após um gesto: o primeiro gesto acorda o contexto.
    const wake = () => {
      unlocked = true;
      if (pref === "on") ensure();
    };
    window.addEventListener("pointerdown", wake, { once: true });
    window.addEventListener("keydown", wake, { once: true });
    emit();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  isEnabled(): boolean {
    return pref === "on";
  },
  hasChosen(): boolean {
    return pref !== null;
  },
  setEnabled(on: boolean) {
    pref = on ? "on" : "off";
    if (on) unlocked = true; // ligar o som é um gesto do visitante
    try {
      localStorage.setItem(STORAGE_KEYS.sound, pref);
    } catch {}
    if (on) ensure();
    else void graph?.ctx.suspend();
    emit();
  },
  play(name: SfxName) {
    if (!canPlay()) return;
    const g = ensure();
    if (g) SFX[name].forEach((tone) => playTone(g, tone));
  },
  /** Sino FM do Portal (razão 1:3.5, decaimento 2,5 s). */
  bell() {
    if (!canPlay()) return;
    const g = ensure();
    if (!g) return;
    const t = g.ctx.currentTime;
    const carrier = g.ctx.createOscillator();
    const modulator = g.ctx.createOscillator();
    const modDepth = g.ctx.createGain();
    const env = g.ctx.createGain();
    carrier.frequency.value = 220;
    modulator.frequency.value = 220 * 3.5;
    modDepth.gain.setValueAtTime(600, t);
    modDepth.gain.exponentialRampToValueAtTime(1, t + 2.5);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 2.5);
    modulator.connect(modDepth).connect(carrier.frequency);
    carrier.connect(env).connect(g.sfx);
    carrier.start(t);
    modulator.start(t);
    carrier.stop(t + 2.6);
    modulator.stop(t + 2.6);
  },
  /** Barramento de ambiência das salas (Fase 2+); null quando o som não deve tocar. */
  ambienceBus(): { ctx: AudioContext; destination: GainNode } | null {
    if (!canPlay()) return null;
    const g = ensure();
    return g ? { ctx: g.ctx, destination: g.ambience } : null;
  },
};

export function useSoundEnabled(): boolean {
  return useSyncExternalStore(soundEngine.subscribe, soundEngine.isEnabled, () => false);
}
