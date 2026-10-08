import { fillBrown, fillPink } from "./noise";
const cache = new WeakMap<BaseAudioContext, AudioBuffer>();

/** Ruído branco mono de 2 s, um por contexto (efeitos e ambiências reutilizam o mesmo buffer). */
export function whiteNoise(ctx: BaseAudioContext): AudioBuffer {
  const cached = cache.get(ctx);
  if (cached) return cached;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  cache.set(ctx, buffer);
  return buffer;
}

const brownCache = new WeakMap<BaseAudioContext, AudioBuffer>();
const pinkCache = new WeakMap<BaseAudioContext, AudioBuffer>();

function noiseBuffer(ctx: BaseAudioContext, cache: WeakMap<BaseAudioContext, AudioBuffer>, fill: (d: Float32Array) => void) {
  const cached = cache.get(ctx);
  if (cached) return cached;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
  fill(buffer.getChannelData(0));
  cache.set(ctx, buffer);
  return buffer;
}

/** Ruído marrom mono de 4 s (um por contexto). */
export function brownNoise(ctx: BaseAudioContext): AudioBuffer {
  return noiseBuffer(ctx, brownCache, (d) => fillBrown(d));
}

/** Ruído rosa mono de 4 s (um por contexto). */
export function pinkNoise(ctx: BaseAudioContext): AudioBuffer {
  return noiseBuffer(ctx, pinkCache, (d) => fillPink(d));
}
