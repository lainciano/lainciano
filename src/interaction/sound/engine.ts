import { useSyncExternalStore } from "react";
import { STORAGE_KEYS } from "@/interaction/boot";
import { readingStore } from "@/interaction/reading-mode/store";
import { whiteNoise } from "./buffers";
import { canPreview, parseSoundPref, shouldPlay, type SoundPref } from "./policy";
import { DEFAULT_VOLUME, parseVolume, volumeToGain } from "./volume";
import { BELL, NOISE, SFX, type NoiseBurst, type NoiseName, type SfxName, type Tone } from "./sfx";

const MAX_VOICES = 12;

type Graph = { ctx: AudioContext; master: GainNode; sfx: GainNode; ambience: GainNode };
type PlayOptions = { gain?: number };

let graph: Graph | null = null;
let pref: SoundPref | null = null;
let voices = 0;
let initialized = false;
let volume = DEFAULT_VOLUME;
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
  // Compressão leve de segurança, não de "pump": o padrão do navegador (limiar −24 dB, razão 12)
  // abaixava o sino toda vez que um estrondo ou a ambiência entrava.
  compressor.threshold.value = -12;
  compressor.knee.value = 24;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.01;
  compressor.release.value = 0.3;
  compressor.connect(ctx.destination);
  const master = ctx.createGain();
  master.gain.value = volumeToGain(volume);
  master.connect(compressor);
  const sfx = ctx.createGain();
  sfx.gain.value = 0.5;
  sfx.connect(master);
  const ambience = ctx.createGain();
  ambience.gain.value = 0.35;
  ambience.connect(master);
  return { ctx, master, sfx, ambience };
}

function ensure(): Graph | null {
  if (!graph) graph = buildGraph();
  if (graph?.ctx.state === "suspended") void graph.ctx.resume();
  return graph;
}

function allowed(): boolean {
  return shouldPlay(pref, readingStore.getSnapshot(), unlocked);
}

/** Escala de volume por chamada (impacto pela velocidade, rasgo pela rapidez), presa em 0,05–1. */
function scaleOf(options?: PlayOptions): number {
  return Math.min(1, Math.max(0.05, options?.gain ?? 1));
}

function playTone(g: Graph, tone: Tone, scale: number) {
  if (voices >= MAX_VOICES) return;
  const start = g.ctx.currentTime + (tone.delay ?? 0);
  const osc = g.ctx.createOscillator();
  const env = g.ctx.createGain();
  osc.type = tone.type;
  osc.frequency.setValueAtTime(tone.freq, start);
  if (tone.glideTo) osc.frequency.exponentialRampToValueAtTime(tone.glideTo, start + tone.dur);
  env.gain.setValueAtTime(tone.gain * scale, start);
  env.gain.exponentialRampToValueAtTime(0.0001, start + tone.dur);
  osc.connect(env).connect(g.sfx);
  voices += 1;
  osc.onended = () => {
    voices -= 1;
  };
  osc.start(start);
  osc.stop(start + tone.dur + 0.02);
}

function playNoise(g: Graph, burst: NoiseBurst, scale: number) {
  if (voices >= MAX_VOICES) return;
  const start = g.ctx.currentTime + (burst.delay ?? 0);
  const source = g.ctx.createBufferSource();
  source.buffer = whiteNoise(g.ctx);
  source.loop = true;
  const filter = g.ctx.createBiquadFilter();
  filter.type = burst.filter;
  filter.frequency.value = burst.freq;
  if (burst.q !== undefined) filter.Q.value = burst.q;
  const env = g.ctx.createGain();
  env.gain.setValueAtTime(burst.gain * scale, start);
  env.gain.exponentialRampToValueAtTime(0.0001, start + burst.dur);
  source.connect(filter).connect(env).connect(g.sfx);
  voices += 1;
  source.onended = () => {
    voices -= 1;
  };
  source.start(start);
  source.stop(start + burst.dur + 0.02);
}

export const soundEngine = {
  init() {
    if (initialized || typeof window === "undefined") return;
    initialized = true;
    try {
      pref = parseSoundPref(localStorage.getItem(STORAGE_KEYS.sound));
      volume = parseVolume(localStorage.getItem(STORAGE_KEYS.volume));
    } catch {
      pref = null;
    }
    // O navegador só libera áudio após um gesto: o primeiro gesto acorda o contexto e avisa
    // quem depende disso (a ambiência da sala começa aqui).
    const wake = () => {
      unlocked = true;
      if (pref === "on") ensure();
      emit();
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
  /** Volume do usuário (0–1), lembrado entre visitas e aplicado ao master. */
  getVolume(): number {
    return volume;
  },
  setVolume(next: number) {
    volume = Math.min(1, Math.max(0, next));
    try {
      localStorage.setItem(STORAGE_KEYS.volume, String(volume));
    } catch {}
    // Sem degrau: o ganho acompanha o controle em ~30 ms.
    if (graph) graph.master.gain.setTargetAtTime(volumeToGain(volume), graph.ctx.currentTime, 0.03);
    emit();
  },
  /**
   * Prévia do volume (duas notas suaves): toca no Portal, antes de o visitante escolher som, e com o som
   * ligado — o gesto no controle libera o áudio. Nunca com som desligado de propósito nem em modo leitura.
   */
  preview() {
    if (!canPreview(pref, readingStore.getSnapshot())) return;
    unlocked = true;
    const g = ensure();
    if (!g) return;
    SFX.preview.forEach((tone) => playTone(g, tone, 1));
  },
  /** true quando um som tocaria agora (preferência on, fora do modo leitura, depois de um gesto). */
  canPlay(): boolean {
    return allowed();
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
  play(name: SfxName, options?: PlayOptions) {
    if (!allowed()) return;
    const g = ensure();
    if (!g) return;
    const scale = scaleOf(options);
    SFX[name].forEach((tone) => playTone(g, tone, scale));
  },
  /** Ruído filtrado curto (estrondo, rasgo). */
  noise(name: NoiseName, options?: PlayOptions) {
    if (!allowed()) return;
    const g = ensure();
    if (!g) return;
    const scale = scaleOf(options);
    NOISE[name].forEach((burst) => playNoise(g, burst, scale));
  },
  /** Sino FM do Portal (razão 1:3.5, decaimento 2,5 s). */
  bell() {
    if (!allowed()) return;
    const g = ensure();
    if (!g) return;
    const t = g.ctx.currentTime;
    const carrier = g.ctx.createOscillator();
    const modulator = g.ctx.createOscillator();
    const modDepth = g.ctx.createGain();
    const env = g.ctx.createGain();
    carrier.frequency.value = BELL.carrierHz;
    modulator.frequency.value = BELL.carrierHz * BELL.modRatio;
    modDepth.gain.setValueAtTime(BELL.modDepth, t);
    modDepth.gain.setTargetAtTime(1, t, BELL.tau);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(BELL.peak, t + BELL.attackS);
    env.gain.setTargetAtTime(0.0001, t + BELL.attackS, BELL.tau);
    modulator.connect(modDepth).connect(carrier.frequency);
    carrier.connect(env).connect(g.sfx);
    carrier.start(t);
    modulator.start(t);
    carrier.stop(t + BELL.stopS);
    modulator.stop(t + BELL.stopS);
  },
  /** Barramento de ambiência das salas (Fase 2+); null quando o som não deve tocar. */
  ambienceBus(): { ctx: AudioContext; destination: GainNode } | null {
    if (!allowed()) return null;
    const g = ensure();
    return g ? { ctx: g.ctx, destination: g.ambience } : null;
  },
};

export function useVolume(): number {
  return useSyncExternalStore(soundEngine.subscribe, soundEngine.getVolume, () => DEFAULT_VOLUME);
}

export function useSoundEnabled(): boolean {
  return useSyncExternalStore(soundEngine.subscribe, soundEngine.isEnabled, () => false);
}
