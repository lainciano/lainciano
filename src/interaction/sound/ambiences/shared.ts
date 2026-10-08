/** Contrato das ambiências (spec 8.2: criarAmbiencia(ctx, destino) → { iniciar, parar }). */
export type Ambience = { start(): void; stop(): void };
export type AmbienceFactory = (ctx: AudioContext, destination: AudioNode) => Ambience;

export function midiToFreq(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

export function randomBetween(min: number, max: number, random: () => number = Math.random): number {
  return min + (max - min) * random();
}

/** Resposta ao impulso sintética: ruído estéreo decaindo em `seconds` (reverb sem arquivos). */
export function createImpulse(ctx: BaseAudioContext, seconds: number, decay = 3): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** decay;
  }
  return buffer;
}
