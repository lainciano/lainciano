import { whiteNoise } from "../buffers";
import { randomBetween, type Ambience } from "./shared";

/** Vento (spec 8.3): ruído em passa-banda varrido por LFO 300–900 Hz a 0,07 Hz, com rajadas. */
export const WIND = {
  lfoHz: 0.07,
  lowHz: 300,
  highHz: 900,
  q: 1.2,
  level: 0.45,
  gustLevel: 0.8,
  gustRiseS: 1.4,
  gustFallS: 2.6,
  gustEveryMinMs: 7000,
  gustEveryMaxMs: 15000,
} as const;

export function createAmbience(ctx: AudioContext, destination: AudioNode): Ambience {
  const level = ctx.createGain();
  level.gain.value = WIND.level;
  level.connect(destination);

  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = WIND.q;
  band.frequency.value = (WIND.lowHz + WIND.highHz) / 2;
  band.connect(level);

  const source = ctx.createBufferSource();
  source.buffer = whiteNoise(ctx);
  source.loop = true;
  source.connect(band);

  const lfo = ctx.createOscillator();
  lfo.frequency.value = WIND.lfoHz;
  const depth = ctx.createGain();
  depth.gain.value = (WIND.highHz - WIND.lowHz) / 2;
  lfo.connect(depth).connect(band.frequency);

  let timer = 0;
  const nextGust = () => randomBetween(WIND.gustEveryMinMs, WIND.gustEveryMaxMs);
  const gust = () => {
    const t = ctx.currentTime;
    level.gain.cancelScheduledValues(t);
    level.gain.setValueAtTime(level.gain.value, t);
    level.gain.linearRampToValueAtTime(WIND.gustLevel, t + WIND.gustRiseS);
    level.gain.linearRampToValueAtTime(WIND.level, t + WIND.gustRiseS + WIND.gustFallS);
    timer = window.setTimeout(gust, nextGust());
  };

  return {
    start() {
      source.start();
      lfo.start();
      timer = window.setTimeout(gust, nextGust());
    },
    stop() {
      window.clearTimeout(timer);
      source.stop();
      lfo.stop();
      level.disconnect();
    },
  };
}
