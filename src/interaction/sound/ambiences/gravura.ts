import { createImpulse, midiToFreq, type Ambience } from "./shared";

/** Órgão (spec 8.3): Ré menor grave (D2, A2, F3) em dente-de-serra ±4 cents, passa-baixas 700 Hz com LFO 0,05 Hz, reverb de 4 s. */
export const ORGAN = {
  notes: [38, 45, 53],
  detuneCents: 4,
  voiceGain: 0.045,
  cutoffHz: 700,
  lfoHz: 0.05,
  lfoDepthHz: 220,
  reverbS: 4,
  dry: 0.55,
  wet: 0.7,
} as const;

export function createAmbience(ctx: AudioContext, destination: AudioNode): Ambience {
  const out = ctx.createGain();
  out.connect(destination);
  const dry = ctx.createGain();
  dry.gain.value = ORGAN.dry;
  dry.connect(out);
  const wet = ctx.createGain();
  wet.gain.value = ORGAN.wet;
  wet.connect(out);
  const reverb = ctx.createConvolver();
  reverb.buffer = createImpulse(ctx, ORGAN.reverbS);
  reverb.connect(wet);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = ORGAN.cutoffHz;
  filter.connect(dry);
  filter.connect(reverb);

  const lfo = ctx.createOscillator();
  lfo.frequency.value = ORGAN.lfoHz;
  const depth = ctx.createGain();
  depth.gain.value = ORGAN.lfoDepthHz;
  lfo.connect(depth).connect(filter.frequency);

  const voices = ORGAN.notes.flatMap((note) =>
    [-ORGAN.detuneCents, ORGAN.detuneCents].map((cents) => {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = midiToFreq(note);
      osc.detune.value = cents;
      const gain = ctx.createGain();
      gain.gain.value = ORGAN.voiceGain;
      osc.connect(gain).connect(filter);
      return osc;
    }),
  );

  return {
    start() {
      voices.forEach((osc) => osc.start());
      lfo.start();
    },
    stop() {
      voices.forEach((osc) => osc.stop());
      lfo.stop();
      out.disconnect();
    },
  };
}
