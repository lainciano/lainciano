import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGameAudio, soundKey, type AudioBus, type GameAudioEnv } from "./game-audio";

// AudioContext falso: conta nós e guarda os valores que o jogo agendou, sem som de verdade.
class FakeParam {
  value = 0;
  calls: [string, number][] = [];
  setValueAtTime(v: number) {
    this.value = v;
    this.calls.push(["set", v]);
  }
  exponentialRampToValueAtTime(v: number) {
    this.calls.push(["exp", v]);
  }
  linearRampToValueAtTime(v: number) {
    this.calls.push(["lin", v]);
  }
  setTargetAtTime(v: number) {
    this.value = v;
    this.calls.push(["target", v]);
  }
  cancelScheduledValues() {}
}
class FakeNode {
  gain = new FakeParam();
  frequency = new FakeParam();
  Q = new FakeParam();
  type = "";
  buffer: unknown = null;
  loop = false;
  onended: (() => void) | null = null;
  started = 0;
  stopped = 0;
  connected: unknown[] = [];
  disconnected = 0;
  connect(n: unknown) {
    this.connected.push(n);
    return n;
  }
  disconnect() {
    this.disconnected += 1;
  }
  start() {
    this.started += 1;
  }
  stop() {
    this.stopped += 1;
  }
}
class FakeCtx {
  currentTime = 0;
  state: "running" | "suspended" = "running";
  made: Record<string, FakeNode[]> = {};
  private make(kind: string) {
    const n = new FakeNode();
    (this.made[kind] ??= []).push(n);
    return n;
  }
  createGain = () => this.make("gain");
  createOscillator = () => this.make("osc");
  createBufferSource = () => this.make("src");
  createBiquadFilter = () => this.make("filter");
  suspend = vi.fn(async () => {
    this.state = "suspended";
  });
  resume = vi.fn(async () => {
    this.state = "running";
  });
  /** Termina todas as vozes (o navegador dispara `onended` quando o som acaba). */
  drain() {
    for (const kind of ["src", "osc"]) for (const n of this.made[kind] ?? []) n.onended?.();
  }
  count(kind: string) {
    return this.made[kind]?.length ?? 0;
  }
}

function setup(initialVolume = 1, overrides = {}) {
  const ctx = new FakeCtx();
  const dest = new FakeNode();
  const state = { on: true };
  const listeners = new Set<() => void>();
  const env: GameAudioEnv = {
    bus: () => (state.on ? ({ ctx, destination: dest } as unknown as AudioBus) : null),
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    noise: () => ({}) as AudioBuffer,
    rand: () => 0.5,
  };
  const audio = createGameAudio(initialVolume, overrides, env);
  return { ctx, dest, state, listeners, audio, emit: () => listeners.forEach((l) => l()) };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createGameAudio · silêncio", () => {
  it("sem barramento (som desligado, modo leitura ou antes do gesto) nada é criado", () => {
    const { ctx, state, audio } = setup();
    state.on = false;
    audio.step("granilite");
    audio.object("madeira", "knock");
    audio.sfx("force");
    audio.flashClick();
    audio.phoneKey("1");
    audio.paper();
    audio.room("calm");
    expect(Object.keys(ctx.made)).toHaveLength(0);
  });

  it("um passo sozinho cria uma saída e vozes; sem barramento antes, o barramento aparece depois", () => {
    const { ctx, state, audio, emit } = setup();
    state.on = false;
    audio.room("calm");
    expect(ctx.count("osc")).toBe(0);
    // o visitante dá o 1º gesto / liga o som: o site avisa e o zumbido nasce
    state.on = true;
    emit();
    expect(ctx.count("osc")).toBeGreaterThan(4);
    audio.step("granilite");
    expect(ctx.count("src")).toBe(1);
  });

  it("sfx desconhecido não toca nada", () => {
    const { ctx, audio } = setup();
    audio.sfx("nao-existe");
    audio.sfx("toString");
    expect(Object.keys(ctx.made)).toHaveLength(0);
  });
});

describe("createGameAudio · sons", () => {
  it("cada som nomeado toca (ruído e/ou tom)", () => {
    const { ctx, audio } = setup();
    for (const name of ["knock", "key", "unlock", "force"]) {
      const before = ctx.count("src") + ctx.count("osc");
      audio.sfx(name);
      expect(ctx.count("src") + ctx.count("osc"), name).toBeGreaterThan(before);
      ctx.drain();
    }
    const before = ctx.count("src");
    for (const play of [() => audio.flashClick(), () => audio.phoneKey("5"), () => audio.paper()]) {
      const n = ctx.count("src");
      play();
      expect(ctx.count("src")).toBeGreaterThan(n);
      ctx.drain();
    }
    expect(ctx.count("src")).toBeGreaterThan(before);
  });

  it("a tábua solta soma o rangido (um oscilador dente de serra a mais que o granilite)", () => {
    const a = setup();
    a.audio.step("granilite");
    const b = setup();
    b.audio.step("tabua-solta");
    expect(b.ctx.count("osc")).toBe(a.ctx.count("osc") + 1);
  });

  it("o limite de vozes segura rajadas", () => {
    const { ctx, audio } = setup();
    for (let i = 0; i < 100; i++) audio.step("granilite");
    expect(ctx.count("src") + ctx.count("osc")).toBeLessThanOrEqual(16);
  });

  it("a troca do dono vence a receita procedural", () => {
    const player = vi.fn();
    const { ctx, audio } = setup(1, { [soundKey.paper]: player });
    audio.paper();
    expect(player).toHaveBeenCalledTimes(1);
    expect(Object.keys(ctx.made).filter((k) => k !== "gain")).toHaveLength(0);
  });
});

describe("createGameAudio · volume", () => {
  it("o volume inicial e o ao vivo chegam ao nó de saída (curva quadrática)", () => {
    const { ctx, dest, audio } = setup(0.5);
    audio.step("madeira");
    const out = ctx.made.gain[0];
    expect(dest.connected).toEqual([]);
    expect(out.connected).toEqual([dest]);
    const half = out.gain.value;
    audio.setVolume(1);
    expect(out.gain.value).toBeGreaterThan(half);
    audio.setVolume(0);
    expect(out.gain.value).toBe(0);
    audio.setVolume(Number.NaN);
    expect(out.gain.value).toBe(0);
    audio.setVolume(7);
    expect(out.gain.value).toBeGreaterThan(half);
  });
});

describe("createGameAudio · zumbido da sala", () => {
  it("room(calm) liga o zumbido baixo; room(tension) sobe o nível sem recriar", () => {
    const { ctx, audio } = setup();
    audio.room("calm");
    const oscs = ctx.count("osc");
    const level = ctx.made.gain.find((g) => g.gain.calls.some(([k]) => k === "target"))!;
    const calm = level.gain.value;
    expect(calm).toBeLessThan(0.02);
    audio.room("tension");
    expect(ctx.count("osc")).toBe(oscs);
    expect(level.gain.value).toBeGreaterThan(calm);
  });

  it("som desligado no site some o zumbido (fade) e ligar de novo o traz de volta", () => {
    const { ctx, state, audio, emit } = setup();
    audio.room("calm");
    const oscs = ctx.count("osc");
    state.on = false;
    emit();
    expect(ctx.made.osc.every((o) => o.stopped >= 1)).toBe(true);
    state.on = true;
    emit();
    expect(ctx.count("osc")).toBe(oscs * 2);
  });

  it("suspend: zumbido sai, tudo mudo e o contexto dorme; resume acorda e volta", async () => {
    const { ctx, audio } = setup();
    audio.room("calm");
    audio.suspend();
    audio.step("granilite");
    expect(ctx.count("src")).toBe(0);
    vi.advanceTimersByTime(500);
    expect(ctx.suspend).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    audio.resume();
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    expect(ctx.count("osc")).toBeGreaterThan(10); // zumbido novo
    audio.step("granilite");
    expect(ctx.count("src")).toBe(1);
  });

  it("suspend e resume rápidos (< 450 ms) não dormem o contexto", () => {
    const { ctx, audio } = setup();
    audio.step("granilite");
    audio.suspend();
    audio.resume();
    vi.advanceTimersByTime(1000);
    expect(ctx.suspend).not.toHaveBeenCalled();
  });

  it("dispose é idempotente, para o zumbido, solta a escuta e silencia tudo", () => {
    const { ctx, listeners, audio } = setup();
    audio.room("calm");
    audio.dispose();
    audio.dispose();
    expect(listeners.size).toBe(0);
    expect(ctx.made.osc.every((o) => o.stopped >= 1)).toBe(true);
    const n = ctx.count("src");
    audio.step("granilite");
    audio.room("tension");
    expect(ctx.count("src")).toBe(n);
    vi.advanceTimersByTime(1000);
    expect(ctx.made.gain.some((g) => g.disconnected > 0)).toBe(true);
  });
});
