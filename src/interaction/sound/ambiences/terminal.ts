import { pinkNoise, whiteNoise } from "../buffers";
import { randomBetween, type Ambience } from "./shared";

/**
 * Terminal — "poste de luz / Lain" (spec 8.3): zumbido da rede elétrica brasileira (60 Hz + harmônicos,
 * levemente saturado, com o fio balançando em 0,1 Hz), estalos de fio, ventoinha de computador, cliques de
 * disco e, uma vez por minuto, um "pio" de modem distante.
 */
export const TERMINAL = {
  mainsHz: 60,
  harmonics: [120, 180, 240] as number[],
  hum: 0.08,
  sway: { hz: 0.1, depth: 0.35 },
  crackleHighpassHz: 3000,
  crackleBurstMs: [5, 30] as [number, number],
  crackleEveryMs: 3000,
  crackleGain: 0.05,
  fanCutoffHz: 380,
  fan: 0.05,
  diskPulseMs: 4,
  diskGroupSize: [2, 4] as [number, number],
  diskEveryMs: [6000, 15000] as [number, number],
  diskGain: 0.04,
  modemHz: [1200, 2200] as [number, number],
  modemMs: 300,
  modemGain: 0.012,
  modemEveryMs: 60000,
} as const;

function saturationCurve(): Float32Array<ArrayBuffer> {
  const n = 256;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 2.2);
  }
  return curve;
}

export function createAmbience(ctx: AudioContext, destination: AudioNode): Ambience {
  const out = ctx.createGain();
  out.connect(destination);

  // Zumbido da rede: 60 Hz + harmônicos → saturação leve → ganho que balança devagar (fio ao vento).
  const shaper = ctx.createWaveShaper();
  shaper.curve = saturationCurve();
  const humLevel = ctx.createGain();
  humLevel.gain.value = TERMINAL.hum;
  shaper.connect(humLevel).connect(out);
  const oscs = [TERMINAL.mainsHz, ...TERMINAL.harmonics].map((hz, i) => {
    const osc = ctx.createOscillator();
    osc.frequency.value = hz;
    const g = ctx.createGain();
    g.gain.value = i === 0 ? 1 : 0.5 / (i + 1);
    osc.connect(g).connect(shaper);
    return osc;
  });
  const sway = ctx.createOscillator();
  sway.frequency.value = TERMINAL.sway.hz;
  const swayDepth = ctx.createGain();
  swayDepth.gain.value = TERMINAL.hum * TERMINAL.sway.depth;
  sway.connect(swayDepth).connect(humLevel.gain);

  // Ventoinha: ruído rosa em passa-baixas.
  const fan = ctx.createBufferSource();
  fan.buffer = pinkNoise(ctx);
  fan.loop = true;
  const fanLow = ctx.createBiquadFilter();
  fanLow.type = "lowpass";
  fanLow.frequency.value = TERMINAL.fanCutoffHz;
  const fanGain = ctx.createGain();
  fanGain.gain.value = TERMINAL.fan;
  fan.connect(fanLow).connect(fanGain).connect(out);

  const timers = new Set<number>();
  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  };
  const burst = (durMs: number, gain: number, highpassHz: number) => {
    const src = ctx.createBufferSource();
    src.buffer = whiteNoise(ctx);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = highpassHz;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + durMs / 1000);
    src.connect(hp).connect(g).connect(out);
    src.start(t, Math.random());
    src.stop(t + durMs / 1000 + 0.01);
  };

  // Estalos de fio: rajadas de ruído branco com passa-altas de 3 kHz, 5–30 ms, em média a cada 3 s.
  const crackle = () => {
    burst(randomBetween(...TERMINAL.crackleBurstMs), TERMINAL.crackleGain, TERMINAL.crackleHighpassHz);
    later(crackle, randomBetween(TERMINAL.crackleEveryMs * 0.2, TERMINAL.crackleEveryMs * 1.8));
  };
  // Cliques de disco: pulsos de 4 ms em grupos de 2–4, a cada 6–15 s.
  const disk = () => {
    const count = Math.round(randomBetween(TERMINAL.diskGroupSize[0], TERMINAL.diskGroupSize[1]));
    for (let i = 0; i < count; i += 1) later(() => burst(TERMINAL.diskPulseMs, TERMINAL.diskGain, 800), i * 55);
    later(disk, randomBetween(...TERMINAL.diskEveryMs));
  };
  // Modem distante: FM 1200/2200 Hz por 300 ms, muito baixo, uma vez por minuto.
  const modem = () => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const t = ctx.currentTime;
    const half = TERMINAL.modemMs / 2000;
    osc.frequency.setValueAtTime(TERMINAL.modemHz[0], t);
    osc.frequency.setValueAtTime(TERMINAL.modemHz[1], t + half);
    g.gain.setValueAtTime(TERMINAL.modemGain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + half * 2);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + half * 2 + 0.02);
    later(modem, TERMINAL.modemEveryMs);
  };

  return {
    start() {
      oscs.forEach((o) => o.start());
      sway.start();
      fan.start();
      later(crackle, 1200);
      later(disk, randomBetween(2500, 6000));
      later(modem, randomBetween(9000, 20000));
    },
    stop() {
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
      oscs.forEach((o) => o.stop());
      sway.stop();
      fan.stop();
      out.disconnect();
    },
  };
}
