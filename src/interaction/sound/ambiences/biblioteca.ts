import { brownNoise } from "../buffers";
import type { Ambience } from "./shared";

/** Biblioteca (Blog, spec 8.3): tom de sala quase inaudível, ruído marrom a ganho 0,02. */
export const LIBRARY = { gain: 0.02, makeup: 6 } as const;

export function createAmbience(ctx: AudioContext, destination: AudioNode): Ambience {
  const out = ctx.createGain();
  // O ruído marrom já é fraco por natureza; o ganho final da receita (0,02) fica em LIBRARY.gain.
  out.gain.value = LIBRARY.gain * LIBRARY.makeup;
  out.connect(destination);
  const noise = ctx.createBufferSource();
  noise.buffer = brownNoise(ctx);
  noise.loop = true;
  noise.connect(out);
  return {
    start() {
      noise.start();
    },
    stop() {
      noise.stop();
      out.disconnect();
    },
  };
}
