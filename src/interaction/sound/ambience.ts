import { readingStore } from "@/interaction/reading-mode/store";
import { AMBIENCE_FADE_S, resolveAmbience, type AmbienceName } from "./ambience-plan";
import { createAmbience as createBiblioteca } from "./ambiences/biblioteca";
import { createAmbience as createGravura } from "./ambiences/gravura";
import { createAmbience as createRuina } from "./ambiences/ruina";
import { createAmbience as createTerminal } from "./ambiences/terminal";
import { createAmbience as createVela } from "./ambiences/vela";
import type { Ambience, AmbienceFactory } from "./ambiences/shared";
import { soundEngine } from "./engine";

const FACTORIES: Record<AmbienceName, AmbienceFactory> = {
  ruina: createRuina,
  gravura: createGravura,
  vela: createVela,
  biblioteca: createBiblioteca,
  terminal: createTerminal,
};

/** Constante de tempo (s) das mudanças de volume por visibilidade: sobe e desce sem degrau. */
const LEVEL_TAU_S = 0.35;

// gain = fade de entrada/saída da sala (crossfade); level = volume pela visibilidade da área na tela.
type Playing = { name: AmbienceName; ambience: Ambience; ctx: AudioContext; gain: GainNode; level: GainNode };

let requested: AmbienceName | null = null;
const levels = new Map<AmbienceName, number>();
let playing: Playing | null = null;
let subscribed = false;

function fadeOut(current: Playing) {
  const level = current.gain.gain;
  const t = current.ctx.currentTime;
  level.cancelScheduledValues(t);
  level.setValueAtTime(level.value, t);
  level.linearRampToValueAtTime(0, t + AMBIENCE_FADE_S);
  window.setTimeout(() => {
    current.ambience.stop();
    current.gain.disconnect();
  }, AMBIENCE_FADE_S * 1000 + 50);
}

function fadeIn(name: AmbienceName): Playing | null {
  const bus = soundEngine.ambienceBus();
  if (!bus) return null;
  const gain = bus.ctx.createGain();
  gain.gain.value = 0;
  gain.connect(bus.destination);
  const level = bus.ctx.createGain();
  level.gain.value = levels.get(name) ?? 1;
  level.connect(gain);
  const ambience = FACTORIES[name](bus.ctx, level);
  ambience.start();
  const t = bus.ctx.currentTime;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(1, t + AMBIENCE_FADE_S);
  return { name, ambience, ctx: bus.ctx, gain, level };
}

// Reavalia sempre que a sala pede/solta, o som liga/desliga, o 1º gesto acontece ou o modo leitura muda.
function sync() {
  const plan = resolveAmbience(playing?.name ?? null, requested, soundEngine.canPlay());
  if (plan.stop && playing) {
    fadeOut(playing);
    playing = null;
  }
  if (plan.start) playing = fadeIn(plan.start);
}

/** Uma ambiência por vez, com crossfade de 1,2 s (spec 8.2). */
export const ambienceDirector = {
  enter(name: AmbienceName) {
    if (!subscribed) {
      subscribed = true;
      soundEngine.subscribe(sync);
      readingStore.subscribe(sync);
    }
    requested = name;
    sync();
  },
  leave(name: AmbienceName) {
    if (requested !== name) return;
    requested = null;
    levels.delete(name);
    sync();
  },
  /** Volume (0–1) da ambiência pela visibilidade da área: sobe e desce com o scroll, sem degrau. */
  setLevel(name: AmbienceName, level: number) {
    levels.set(name, level);
    if (playing?.name === name) {
      playing.level.gain.setTargetAtTime(level, playing.ctx.currentTime, LEVEL_TAU_S);
    }
  },
};
