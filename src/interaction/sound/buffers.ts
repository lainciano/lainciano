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
