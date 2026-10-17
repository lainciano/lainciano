import { pinkNoise } from "../buffers";
import { randomBetween, type Ambience } from "./shared";

/** Vela (Projetos e cases, spec 8.3): senoide de 55 Hz muito baixa + ruído rosa filtrado, com crepitar raro. */
export const CANDLE = {
  humHz: 55,
  humGain: 0.5,
  noiseCutoffHz: 900,
  noiseGain: 0.18,
  crackleEveryMinMs: 4500,
  crackleEveryMaxMs: 11000,
  crackleGain: 0.35,
} as const;

export function createAmbience(ctx: AudioContext, destination: AudioNode): Ambience {
  const out = ctx.createGain();
  out.connect(destination);

  const hum = ctx.createOscillator();
  hum.frequency.value = CANDLE.humHz;
  const humGain = ctx.createGain();
  humGain.gain.value = CANDLE.humGain;
  hum.connect(humGain).connect(out);

  const noise = ctx.createBufferSource();
  noise.buffer = pinkNoise(ctx);
  noise.loop = true;
  const low = ctx.createBiquadFilter();
  low.type = "lowpass";
  low.frequency.value = CANDLE.noiseCutoffHz;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = CANDLE.noiseGain;
  noise.connect(low).connect(noiseGain).connect(out);

  let timer = 0;
  const crackle = () => {
    const t = ctx.currentTime;
    noiseGain.gain.cancelScheduledValues(t);
    noiseGain.gain.setValueAtTime(CANDLE.noiseGain, t);
    noiseGain.gain.linearRampToValueAtTime(CANDLE.crackleGain, t + 0.015);
    noiseGain.gain.linearRampToValueAtTime(CANDLE.noiseGain, t + 0.09);
    timer = window.setTimeout(crackle, randomBetween(CANDLE.crackleEveryMinMs, CANDLE.crackleEveryMaxMs));
  };

  return {
    start() {
      hum.start();
      noise.start();
      timer = window.setTimeout(crackle, randomBetween(CANDLE.crackleEveryMinMs, CANDLE.crackleEveryMaxMs));
    },
    stop() {
      window.clearTimeout(timer);
      hum.stop();
      noise.stop();
      out.disconnect();
    },
  };
}
