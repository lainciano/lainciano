import { whiteNoise } from "@/interaction/sound/buffers";
import { soundEngine } from "@/interaction/sound/engine";
import { readingStore } from "@/interaction/reading-mode/store";
import { volumeToGain } from "@/interaction/sound/volume";
import type { SurfaceMaterial } from "../world/surfaces";
import { footstepParams, nextSeed } from "./footsteps";
import { FLASH_CLICK, GAME_SFX, HUM, objectRecipe, PAPER_RUSTLE, phoneKeyRecipe, stepRecipe, type GameBurst, type GameTone, type Recipe } from "./recipes";
import type { GameAudio, GameSfxName } from "./types";

/**
 * Áudio do jogo (T13): sons procedurais em WebAudio como PLACEHOLDER dos sons do dono (produtor musical).
 *
 * Regras de silêncio (nenhuma é do jogo, todas vêm do site): sai pelo barramento de ambiência do `soundEngine`, que só
 * existe com o som LIGADO pelo visitante, FORA do modo leitura e DEPOIS do primeiro gesto (o contexto nem nasce
 * antes). Sem barramento, tudo é no-op: não há estado de "mudo" próprio para sair de sincronia. O jogo só ajusta o
 * volume (`settings.volume`, ao vivo) e fica quieto com a aba escondida (`suspend`).
 *
 * PONTOS DE TROCA (para os stems/gravações do dono): (1) `overrides` de `createGameAudio`, um `SoundPlayer` por chave
 * (ver `soundKey`) que substitui a receita procedural daquele som; (2) `buildHum`, o zumbido em laço da sala (troque
 * por um `AudioBufferSourceNode` em laço ligado ao mesmo nó de ganho); (3) as receitas em `recipes.ts`.
 * Tudo é carregado por `import()` junto com a sessão: nada disto entra no JS inicial.
 */

export type AudioBus = { ctx: AudioContext; destination: AudioNode };

/** Tudo o que o áudio pede ao mundo de fora (trocável nos testes). */
export type GameAudioEnv = {
  /** Barramento do site, ou `null` quando o som não deve tocar agora (desligado, leitura, sem gesto). */
  bus(): AudioBus | null;
  /** Avisa quando o site muda de ideia (som liga/desliga, 1º gesto, modo leitura). Devolve o cancelamento. */
  subscribe(fn: () => void): () => void;
  noise(ctx: BaseAudioContext): AudioBuffer;
  rand(): number;
};

/** Um som de uma vez só, tocado em `out`. `at` é o tempo do contexto em que começa. */
export type SoundPlayer = (ctx: AudioContext, out: AudioNode, at: number, scale: number) => void;

/** Chave de troca de cada som (ver `overrides`): `step:<superfície>`, `object:<material>:<tipo>`, `sfx:<nome>`, `flash-click`, `phone-key:<tecla>`, `paper`. */
export const soundKey = {
  step: (surface: SurfaceMaterial) => `step:${surface}`,
  object: (material: SurfaceMaterial, kind: string) => `object:${material}:${kind}`,
  sfx: (name: string) => `sfx:${name}`,
  flashClick: "flash-click",
  phoneKey: (key: string) => `phone-key:${key}`,
  paper: "paper",
} as const;

/** Vozes simultâneas no máximo (o resto é descartado: passos em rajada não empilham). */
const MAX_VOICES = 16;
/**
 * O barramento de ambiência do site atenua (0,35 × volume do site); o jogo compensa para que o passo fique no
 * nível das demais camadas. É o ÚNICO ganho fixo do jogo: o resto vem das receitas.
 */
const GAME_BOOST = 2.4;
const VOLUME_TAU = 0.03;
/** Folga para o fade do zumbido terminar antes de dormir o contexto. */
const SUSPEND_AFTER_MS = 450;

const defaultEnv = (): GameAudioEnv => ({
  bus: () => soundEngine.ambienceBus(),
  subscribe: (fn) => {
    const offSound = soundEngine.subscribe(fn);
    const offReading = readingStore.subscribe(fn);
    return () => {
      offSound();
      offReading();
    };
  },
  noise: whiteNoise,
  rand: Math.random,
});

type Hum = { ctx: AudioContext; level: GainNode; lowpass: BiquadFilterNode; subGain: GainNode; nodes: (OscillatorNode | AudioNode)[]; stoppers: OscillatorNode[] };

/** Zumbido da lâmpada: harmônicos de 100 Hz com respiração lenta, mais um sub-grave que só a tensão acorda. */
function buildHum(ctx: AudioContext, out: AudioNode, level: "calm" | "tension"): Hum {
  const t = ctx.currentTime;
  const levelGain = ctx.createGain();
  levelGain.gain.setValueAtTime(0.0001, t);
  levelGain.gain.setTargetAtTime(HUM.level[level], t, HUM.tau);
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.setValueAtTime(HUM.cutoff[level], t);
  const trem = ctx.createGain();
  trem.gain.value = 1;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = HUM.tremolo.rate;
  const depth = ctx.createGain();
  depth.gain.value = HUM.tremolo.depth;
  lfo.connect(depth).connect(trem.gain);
  const stoppers: OscillatorNode[] = [lfo];
  const nodes: AudioNode[] = [levelGain, lowpass, trem, depth];
  for (const partial of HUM.partials) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = partial.freq;
    const g = ctx.createGain();
    g.gain.value = partial.gain / 2.2;
    osc.connect(g).connect(lowpass);
    stoppers.push(osc);
    nodes.push(g);
    osc.start(t);
  }
  const sub = ctx.createOscillator();
  sub.type = "sine";
  sub.frequency.value = HUM.sub.freq;
  const subGain = ctx.createGain();
  subGain.gain.setValueAtTime(0.0001, t);
  subGain.gain.setTargetAtTime(Math.max(0.0001, HUM.sub.gain[level]), t, HUM.tau);
  sub.connect(subGain).connect(trem);
  stoppers.push(sub);
  nodes.push(subGain);
  lowpass.connect(trem);
  trem.connect(levelGain).connect(out);
  lfo.start(t);
  sub.start(t);
  return { ctx, level: levelGain, lowpass, subGain, nodes, stoppers };
}

export function createGameAudio(initialVolume = 1, overrides: Partial<Record<string, SoundPlayer>> = {}, env: GameAudioEnv = defaultEnv()): GameAudio {
  let volume = Math.min(1, Math.max(0, Number.isFinite(initialVolume) ? initialVolume : 1));
  let level: "calm" | "tension" = "calm";
  let inRoom = false;
  let suspended = false;
  let disposed = false;
  let voices = 0;
  let seed = 0;
  let built: { ctx: AudioContext; out: GainNode } | null = null;
  let hum: Hum | null = null;
  let ctxSuspendedByUs: AudioContext | null = null;
  let suspendTimer: ReturnType<typeof setTimeout> | undefined;

  const target = () => volumeToGain(volume) * GAME_BOOST;

  /** Nó de saída do jogo no barramento atual (recriado só se o contexto mudar). */
  const graph = (bus: AudioBus): GainNode => {
    if (built && built.ctx === bus.ctx) return built.out;
    built?.out.disconnect();
    const out = bus.ctx.createGain();
    out.gain.value = target();
    out.connect(bus.destination);
    built = { ctx: bus.ctx, out };
    return out;
  };

  const playTone = (ctx: AudioContext, out: AudioNode, at: number, t: GameTone, scale: number) => {
    if (voices >= MAX_VOICES) return;
    const start = at + (t.delay ?? 0);
    const osc = ctx.createOscillator();
    const env_ = ctx.createGain();
    osc.type = t.type;
    osc.frequency.setValueAtTime(t.freq, start);
    if (t.glideTo) osc.frequency.exponentialRampToValueAtTime(t.glideTo, start + t.dur);
    env_.gain.setValueAtTime(t.gain * scale, start);
    env_.gain.exponentialRampToValueAtTime(0.0001, start + t.dur);
    if (t.lowpass) {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = t.lowpass;
      osc.connect(lp).connect(env_);
    } else osc.connect(env_);
    env_.connect(out);
    voices += 1;
    osc.onended = () => {
      voices -= 1;
    };
    osc.start(start);
    osc.stop(start + t.dur + 0.02);
  };

  const playBurst = (ctx: AudioContext, out: AudioNode, at: number, b: GameBurst, scale: number) => {
    if (voices >= MAX_VOICES) return;
    const start = at + (b.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = env.noise(ctx);
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = b.filter;
    filter.frequency.setValueAtTime(b.freq, start);
    if (b.glideTo) filter.frequency.exponentialRampToValueAtTime(b.glideTo, start + b.dur);
    if (b.q !== undefined) filter.Q.value = b.q;
    const g = ctx.createGain();
    const peak = b.gain * scale;
    if (b.attack && b.attack > 0.002) {
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), start + b.attack);
    } else g.gain.setValueAtTime(peak, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + b.dur);
    src.connect(filter).connect(g).connect(out);
    voices += 1;
    src.onended = () => {
      voices -= 1;
    };
    // cada estalo começa num ponto diferente do ruído (dois passos nunca saem idênticos)
    src.start(start, env.rand() * 1.5);
    src.stop(start + b.dur + 0.02);
  };

  const procedural =
    (recipe: Recipe): SoundPlayer =>
    (ctx, out, at, scale) => {
      for (const t of recipe.tones ?? []) playTone(ctx, out, at, t, scale);
      for (const b of recipe.bursts ?? []) playBurst(ctx, out, at, b, scale);
    };

  /** Toca `key` (a troca do dono, se houver; senão a receita procedural). Sem barramento, não faz nada. */
  const play = (key: string, recipe: () => Recipe, scale = 1) => {
    if (disposed || suspended) return;
    const bus = env.bus();
    if (!bus) return;
    const out = graph(bus);
    (overrides[key] ?? procedural(recipe()))(bus.ctx, out, bus.ctx.currentTime, scale);
  };

  const stopHum = (h: Hum, fade: number) => {
    const t = h.ctx.currentTime;
    h.level.gain.cancelScheduledValues(t);
    h.level.gain.setValueAtTime(Math.max(0.0001, h.level.gain.value), t);
    h.level.gain.exponentialRampToValueAtTime(0.0001, t + fade);
    const stopAt = t + fade + 0.05;
    for (const osc of h.stoppers) osc.stop(stopAt);
    h.stoppers[0].onended = () => {
      for (const n of h.nodes) n.disconnect();
      h.level.disconnect();
    };
  };

  /** Reavalia o zumbido: toca só dentro da sala, com barramento, sem suspensão. */
  const syncHum = () => {
    if (disposed) return;
    const bus = !suspended && inRoom ? env.bus() : null;
    if (!bus) {
      if (hum) {
        stopHum(hum, 0.4);
        hum = null;
      }
      return;
    }
    const out = graph(bus);
    if (hum && hum.ctx !== bus.ctx) {
      stopHum(hum, 0.1);
      hum = null;
    }
    if (!hum) {
      hum = buildHum(bus.ctx, out, level);
      return;
    }
    const t = bus.ctx.currentTime;
    hum.level.gain.setTargetAtTime(HUM.level[level], t, HUM.tau);
    hum.lowpass.frequency.setTargetAtTime(HUM.cutoff[level], t, HUM.tau);
    hum.subGain.gain.setTargetAtTime(Math.max(0.0001, HUM.sub.gain[level]), t, HUM.tau);
  };

  const unsubscribe = env.subscribe(syncHum);

  return {
    step(surface, scale = 1) {
      seed = nextSeed(seed, env.rand());
      play(soundKey.step(surface), () => stepRecipe(footstepParams(surface, seed), scale), scale);
    },
    object(material, kind) {
      play(soundKey.object(material, kind), () => objectRecipe(material, kind));
    },
    room(next) {
      level = next;
      inRoom = true;
      syncHum();
    },
    sfx(name) {
      if (!Object.hasOwn(GAME_SFX, name)) return;
      play(soundKey.sfx(name), () => GAME_SFX[name as GameSfxName]);
    },
    flashClick() {
      play(soundKey.flashClick, () => FLASH_CLICK);
    },
    phoneKey(key) {
      play(soundKey.phoneKey(key), () => phoneKeyRecipe(key));
    },
    paper() {
      play(soundKey.paper, () => PAPER_RUSTLE);
    },
    setVolume(next) {
      volume = Math.min(1, Math.max(0, Number.isFinite(next) ? next : volume));
      if (built) built.out.gain.setTargetAtTime(target(), built.ctx.currentTime, VOLUME_TAU);
    },
    suspend() {
      if (disposed || suspended) return;
      suspended = true;
      syncHum(); // sem barramento consultado: o zumbido sai em fade
      // aba escondida: o contexto compartilhado dorme depois do fade do zumbido (o site o acorda no próximo som,
      // ver `ensure` do engine)
      const ctx = built?.ctx;
      if (ctx) {
        suspendTimer = setTimeout(() => {
          if (!suspended || disposed || ctx.state !== "running") return;
          ctxSuspendedByUs = ctx;
          void ctx.suspend();
        }, SUSPEND_AFTER_MS);
      }
    },
    resume() {
      if (disposed || !suspended) return;
      suspended = false;
      clearTimeout(suspendTimer);
      if (ctxSuspendedByUs) {
        void ctxSuspendedByUs.resume();
        ctxSuspendedByUs = null;
      }
      syncHum();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      clearTimeout(suspendTimer);
      if (hum) stopHum(hum, 0.3);
      hum = null;
      if (ctxSuspendedByUs) void ctxSuspendedByUs.resume();
      ctxSuspendedByUs = null;
      // o fade do zumbido e a cauda dos sons em curso terminam antes de soltar o nó de saída
      const last = built?.out;
      built = null;
      if (last) setTimeout(() => last.disconnect(), 600);
    },
  };
}
