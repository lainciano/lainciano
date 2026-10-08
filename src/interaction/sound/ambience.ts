import { readingStore } from "@/interaction/reading-mode/store";
import { AMBIENCE_FADE_S, resolveAmbience, type AmbienceName } from "./ambience-plan";
import { createAmbience as createGravura } from "./ambiences/gravura";
import { createAmbience as createRuina } from "./ambiences/ruina";
import type { Ambience, AmbienceFactory } from "./ambiences/shared";
import { soundEngine } from "./engine";

const FACTORIES: Record<AmbienceName, AmbienceFactory> = { ruina: createRuina, gravura: createGravura };

type Playing = { name: AmbienceName; ambience: Ambience; ctx: AudioContext; gain: GainNode };

let requested: AmbienceName | null = null;
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
  const ambience = FACTORIES[name](bus.ctx, gain);
  ambience.start();
  const t = bus.ctx.currentTime;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(1, t + AMBIENCE_FADE_S);
  return { name, ambience, ctx: bus.ctx, gain };
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
    sync();
  },
};
