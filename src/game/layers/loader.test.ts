import { describe, expect, it, vi } from "vitest";
import { initialSave } from "../save/schema";
import type { SaveV1 } from "../save/schema";
import { createLayerRunner, loadLayer, MAX_LOAD_FAILURES } from "./loader";
import type { GameCtx, Layer, LayerId, LayerInstance, SavePatch } from "./types";

const SAVE: SaveV1 = initialSave(1_700_000_000_000);

type Calls = string[];

function fakeInstance(
  name: string,
  calls: Calls,
  o: { exit?: () => SavePatch; dispose?: () => void; enter?: (s: SaveV1) => void } = {},
) {
  const inst = {
    places: { places: {}, edges: {} },
    colliders: [],
    surfaces: [],
    objects: [],
    enter: vi.fn((s: SaveV1) => {
      calls.push(`${name}.enter`);
      o.enter?.(s);
    }),
    update: vi.fn(),
    exit: vi.fn((): SavePatch => {
      calls.push(`${name}.exit`);
      return o.exit ? o.exit() : { place: `${name}-place` };
    }),
    dispose: vi.fn(() => {
      calls.push(`${name}.dispose`);
      o.dispose?.();
    }),
  } satisfies LayerInstance;
  return inst;
}

/** Camada falsa cujo `load` só termina quando o teste manda. */
function deferredLayer(id: LayerId, name: string, calls: Calls) {
  const instance = fakeInstance(name, calls);
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const gate = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const load = vi.fn(async (): Promise<LayerInstance> => {
    calls.push(`${name}.load`);
    await gate;
    return instance;
  });
  const layer: Layer = {
    id,
    manifest: { id, textures: [], models: [], audio: [], budget: { triangles: 0, textureBytes: 0 } },
    load,
  };
  return { layer, instance, load, resolve, reject };
}

function immediateLayer(id: LayerId, name: string, calls: Calls, o?: Parameters<typeof fakeInstance>[2]) {
  const instance = fakeInstance(name, calls, o);
  const load = vi.fn(async () => {
    calls.push(`${name}.load`);
    return instance;
  });
  const layer: Layer = {
    id,
    manifest: { id, textures: [], models: [], audio: [], budget: { triangles: 0, textureBytes: 0 } },
    load,
  };
  return { layer, instance, load };
}

function failingLayer(id: LayerId, error: unknown) {
  const load = vi.fn(async (): Promise<LayerInstance> => {
    throw error;
  });
  const layer: Layer = {
    id,
    manifest: { id, textures: [], models: [], audio: [], budget: { triangles: 0, textureBytes: 0 } },
    load,
  };
  return { layer, load };
}

function fakeCtx() {
  const patch = vi.fn();
  const ctx = { save: { get: () => SAVE, patch, reset: vi.fn(), wipeGame: vi.fn() } } as unknown as GameCtx;
  return { ctx, patch };
}

/** Deixa as promessas pendentes andarem. */
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe("loadLayer", () => {
  it("devolve a instância sem entrar nela", async () => {
    const calls: Calls = [];
    const { layer, instance } = immediateLayer("cinza", "a", calls);
    const r = await loadLayer(layer, fakeCtx().ctx, new AbortController().signal);
    expect(r).toEqual({ ok: true, instance });
    expect(instance.enter).not.toHaveBeenCalled();
    expect(instance.dispose).not.toHaveBeenCalled();
  });

  it("load resolvido DEPOIS do abort → aborted e dispose exatamente uma vez", async () => {
    const calls: Calls = [];
    const { layer, instance, resolve } = deferredLayer("cinza", "a", calls);
    const ac = new AbortController();
    const p = loadLayer(layer, fakeCtx().ctx, ac.signal);
    await tick();
    ac.abort();
    resolve();
    expect(await p).toEqual({ ok: false, reason: "aborted" });
    expect(instance.dispose).toHaveBeenCalledTimes(1);
    expect(instance.enter).not.toHaveBeenCalled();
    expect(instance.update).not.toHaveBeenCalled();
  });

  it("sinal já abortado ao entrar → aborted sem chamar load", async () => {
    const calls: Calls = [];
    const { layer, load } = immediateLayer("cinza", "a", calls);
    const ac = new AbortController();
    ac.abort();
    expect(await loadLayer(layer, fakeCtx().ctx, ac.signal)).toEqual({ ok: false, reason: "aborted" });
    expect(load).not.toHaveBeenCalled();
  });

  it("load que rejeita → failed com o erro", async () => {
    const boom = new Error("textura 404");
    const { layer } = failingLayer("cinza", boom);
    expect(await loadLayer(layer, fakeCtx().ctx, new AbortController().signal)).toEqual({
      ok: false,
      reason: "failed",
      error: boom,
    });
  });

  it("load que lança de forma síncrona → failed", async () => {
    const boom = new Error("sync");
    const layer: Layer = {
      ...failingLayer("cinza", boom).layer,
      load: () => {
        throw boom;
      },
    };
    expect(await loadLayer(layer, fakeCtx().ctx, new AbortController().signal)).toEqual({
      ok: false,
      reason: "failed",
      error: boom,
    });
  });

  it("load que rejeita depois do abort → aborted (o erro é consequência do cancelamento)", async () => {
    const calls: Calls = [];
    const { layer, reject } = deferredLayer("cinza", "a", calls);
    const ac = new AbortController();
    const p = loadLayer(layer, fakeCtx().ctx, ac.signal);
    await tick();
    ac.abort();
    reject(new DOMException("aborted", "AbortError"));
    expect(await p).toEqual({ ok: false, reason: "aborted" });
  });

  it("dispose da instância tardia que lança não faz o carregador lançar", async () => {
    const calls: Calls = [];
    const { layer, instance, resolve } = deferredLayer("cinza", "a", calls);
    instance.dispose.mockImplementation(() => {
      throw new Error("gl perdido");
    });
    const ac = new AbortController();
    const p = loadLayer(layer, fakeCtx().ctx, ac.signal);
    await tick();
    ac.abort();
    resolve();
    await expect(p).resolves.toEqual({ ok: false, reason: "aborted" });
    expect(instance.dispose).toHaveBeenCalledTimes(1);
  });
});

describe("createLayerRunner", () => {
  it("enter carrega, entra com o save e expõe current", async () => {
    const calls: Calls = [];
    const { layer, instance } = immediateLayer("cinza", "a", calls);
    const runner = createLayerRunner(fakeCtx().ctx);
    expect(runner.current()).toBeNull();
    expect(await runner.enter(layer, SAVE)).toEqual({ ok: true, instance });
    expect(runner.current()).toBe(instance);
    expect(instance.enter).toHaveBeenCalledWith(SAVE);
    expect(calls).toEqual(["a.load", "a.enter"]);
  });

  it("trocar de camada chama exit() e dispose() da atual ANTES de carregar a nova", async () => {
    const calls: Calls = [];
    const a = immediateLayer("cinza", "a", calls, { exit: () => ({ place: "mesa" }) });
    const b = immediateLayer("antessala", "b", calls);
    const { ctx, patch } = fakeCtx();
    const runner = createLayerRunner(ctx);
    await runner.enter(a.layer, SAVE);
    calls.length = 0;
    await runner.enter(b.layer, SAVE);
    expect(calls).toEqual(["a.exit", "a.dispose", "b.load", "b.enter"]);
    expect(a.instance.dispose).toHaveBeenCalledTimes(1);
    expect(runner.current()).toBe(b.instance);
    // o que a camada velha mudou não se perde e a nova já entra com isso
    expect(patch).toHaveBeenCalledWith({ place: "mesa" });
    expect(b.instance.enter).toHaveBeenCalledWith({ ...SAVE, place: "mesa" });
  });

  it("durante o carregamento da nova camada, current() é null (a velha já foi descartada)", async () => {
    const calls: Calls = [];
    const a = immediateLayer("cinza", "a", calls);
    const b = deferredLayer("antessala", "b", calls);
    const runner = createLayerRunner(fakeCtx().ctx);
    await runner.enter(a.layer, SAVE);
    const p = runner.enter(b.layer, SAVE);
    await tick();
    expect(runner.current()).toBeNull();
    b.resolve();
    await p;
    expect(runner.current()).toBe(b.instance);
  });

  it("exit() que lança não impede dispose() nem a troca", async () => {
    const calls: Calls = [];
    const a = immediateLayer("cinza", "a", calls, {
      exit: () => {
        throw new Error("exit quebrou");
      },
    });
    const b = immediateLayer("antessala", "b", calls);
    const onError = vi.fn();
    const { ctx, patch } = fakeCtx();
    const runner = createLayerRunner(ctx, { onError });
    await runner.enter(a.layer, SAVE);
    const r = await runner.enter(b.layer, SAVE);
    expect(r.ok).toBe(true);
    expect(a.instance.dispose).toHaveBeenCalledTimes(1);
    expect(patch).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(runner.current()).toBe(b.instance);
  });

  it("dispose() da camada que lança não impede o resto: estado limpo e a próxima camada carrega", async () => {
    const calls: Calls = [];
    const a = immediateLayer("cinza", "a", calls, {
      dispose: () => {
        throw new Error("dispose quebrou");
      },
    });
    const b = immediateLayer("antessala", "b", calls);
    const onError = vi.fn();
    const runner = createLayerRunner(fakeCtx().ctx, { onError });
    await runner.enter(a.layer, SAVE);
    expect(runner.leave()).toEqual({ place: "a-place" });
    expect(runner.current()).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
    expect((await runner.enter(b.layer, SAVE)).ok).toBe(true);
  });

  it("duas chamadas enter concorrentes: a mais nova vence e a antiga é abortada e descartada", async () => {
    const calls: Calls = [];
    const a = deferredLayer("cinza", "a", calls);
    const b = deferredLayer("antessala", "b", calls);
    const runner = createLayerRunner(fakeCtx().ctx);
    const pa = runner.enter(a.layer, SAVE);
    await tick();
    const pb = runner.enter(b.layer, SAVE);
    await tick();
    // a antiga termina primeiro, já cancelada
    a.resolve();
    expect(await pa).toEqual({ ok: false, reason: "aborted" });
    expect(a.instance.dispose).toHaveBeenCalledTimes(1);
    expect(a.instance.enter).not.toHaveBeenCalled();
    expect(runner.current()).toBeNull();
    b.resolve();
    expect(await pb).toEqual({ ok: true, instance: b.instance });
    expect(runner.current()).toBe(b.instance);
    expect(b.instance.dispose).not.toHaveBeenCalled();
  });

  it("a antiga que termina DEPOIS da nova também não acorda a cena", async () => {
    const calls: Calls = [];
    const a = deferredLayer("cinza", "a", calls);
    const b = deferredLayer("antessala", "b", calls);
    const runner = createLayerRunner(fakeCtx().ctx);
    const pa = runner.enter(a.layer, SAVE);
    await tick();
    const pb = runner.enter(b.layer, SAVE);
    b.resolve();
    await pb;
    a.resolve();
    expect(await pa).toEqual({ ok: false, reason: "aborted" });
    expect(a.instance.dispose).toHaveBeenCalledTimes(1);
    expect(a.instance.enter).not.toHaveBeenCalled();
    expect(runner.current()).toBe(b.instance);
  });

  it("falha na carga da antiga, já substituída, não conta como falha", async () => {
    const calls: Calls = [];
    const a = deferredLayer("cinza", "a", calls);
    const b = immediateLayer("antessala", "b", calls);
    const runner = createLayerRunner(fakeCtx().ctx);
    const pa = runner.enter(a.layer, SAVE);
    await tick();
    await runner.enter(b.layer, SAVE);
    a.reject(new Error("tarde"));
    expect(await pa).toEqual({ ok: false, reason: "aborted" });
    expect(runner.failures()).toBe(0);
  });

  it("dispose() do runner com carga pendente aborta; o resultado tardio é descartado uma vez", async () => {
    const calls: Calls = [];
    const a = deferredLayer("cinza", "a", calls);
    const runner = createLayerRunner(fakeCtx().ctx);
    const p = runner.enter(a.layer, SAVE);
    await tick();
    runner.dispose();
    a.resolve();
    expect(await p).toEqual({ ok: false, reason: "aborted" });
    expect(a.instance.dispose).toHaveBeenCalledTimes(1);
    expect(a.instance.enter).not.toHaveBeenCalled();
    expect(a.instance.update).not.toHaveBeenCalled();
    expect(runner.current()).toBeNull();
  });

  it("dispose() com a carga pendente que rejeita → aborted, sem falha contada", async () => {
    const calls: Calls = [];
    const a = deferredLayer("cinza", "a", calls);
    const runner = createLayerRunner(fakeCtx().ctx);
    const p = runner.enter(a.layer, SAVE);
    await tick();
    runner.dispose();
    a.reject(new Error("x"));
    expect(await p).toEqual({ ok: false, reason: "aborted" });
    expect(runner.failures()).toBe(0);
  });

  it("dispose() descarta a camada atual (exit antes), grava o patch e é idempotente", async () => {
    const calls: Calls = [];
    const a = immediateLayer("cinza", "a", calls);
    const { ctx, patch } = fakeCtx();
    const runner = createLayerRunner(ctx);
    await runner.enter(a.layer, SAVE);
    runner.dispose();
    runner.dispose();
    expect(calls).toEqual(["a.load", "a.enter", "a.exit", "a.dispose"]);
    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledWith({ place: "a-place" });
    expect(runner.current()).toBeNull();
  });

  it("dispose() ainda descarta se o save.patch lançar", async () => {
    const calls: Calls = [];
    const a = immediateLayer("cinza", "a", calls);
    const { ctx, patch } = fakeCtx();
    patch.mockImplementation(() => {
      throw new Error("storage");
    });
    const onError = vi.fn();
    const runner = createLayerRunner(ctx, { onError });
    await runner.enter(a.layer, SAVE);
    expect(() => runner.dispose()).not.toThrow();
    expect(a.instance.dispose).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("os métodos funcionam soltos do objeto (sem depender de this)", async () => {
    const calls: Calls = [];
    const a = immediateLayer("cinza", "a", calls);
    const { enter, dispose } = createLayerRunner(fakeCtx().ctx);
    await enter(a.layer, SAVE);
    dispose();
    expect(a.instance.dispose).toHaveBeenCalledTimes(1);
  });

  it("enter depois de dispose() → aborted, sem chamar load", async () => {
    const calls: Calls = [];
    const a = immediateLayer("cinza", "a", calls);
    const runner = createLayerRunner(fakeCtx().ctx);
    runner.dispose();
    expect(await runner.enter(a.layer, SAVE)).toEqual({ ok: false, reason: "aborted" });
    expect(a.load).not.toHaveBeenCalled();
    expect(runner.current()).toBeNull();
  });

  it("leave() devolve o patch, zera current e não deixa nada para trás", async () => {
    const calls: Calls = [];
    const a = immediateLayer("cinza", "a", calls);
    const runner = createLayerRunner(fakeCtx().ctx);
    expect(runner.leave()).toBeNull();
    await runner.enter(a.layer, SAVE);
    expect(runner.leave()).toEqual({ place: "a-place" });
    expect(runner.current()).toBeNull();
    expect(a.instance.dispose).toHaveBeenCalledTimes(1);
    expect(runner.leave()).toBeNull();
    expect(a.instance.exit).toHaveBeenCalledTimes(1);
  });

  it("leave() com exit() que lança → null, mas dispose acontece", async () => {
    const calls: Calls = [];
    const a = immediateLayer("cinza", "a", calls, {
      exit: () => {
        throw new Error("x");
      },
    });
    const runner = createLayerRunner(fakeCtx().ctx, { onError: vi.fn() });
    await runner.enter(a.layer, SAVE);
    expect(runner.leave()).toBeNull();
    expect(a.instance.dispose).toHaveBeenCalledTimes(1);
  });

  it("leave() também cancela a carga pendente", async () => {
    const calls: Calls = [];
    const a = deferredLayer("cinza", "a", calls);
    const runner = createLayerRunner(fakeCtx().ctx);
    const p = runner.enter(a.layer, SAVE);
    await tick();
    expect(runner.leave()).toBeNull();
    a.resolve();
    expect(await p).toEqual({ ok: false, reason: "aborted" });
    expect(a.instance.dispose).toHaveBeenCalledTimes(1);
    expect(runner.current()).toBeNull();
  });

  describe("falhas", () => {
    it("MAX_LOAD_FAILURES é 3", () => {
      expect(MAX_LOAD_FAILURES).toBe(3);
    });

    it("três falhas seguidas → failures() === 3", async () => {
      const bad = failingLayer("cinza", new Error("emperrou"));
      const runner = createLayerRunner(fakeCtx().ctx);
      expect(runner.failures()).toBe(0);
      for (let i = 1; i <= MAX_LOAD_FAILURES; i++) {
        const r = await runner.enter(bad.layer, SAVE);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe("failed");
        expect(runner.failures()).toBe(i);
      }
      expect(runner.current()).toBeNull();
    });

    it("falha seguida de sucesso zera o contador", async () => {
      const calls: Calls = [];
      const bad = failingLayer("cinza", new Error("x"));
      const good = immediateLayer("cinza", "a", calls);
      const runner = createLayerRunner(fakeCtx().ctx);
      await runner.enter(bad.layer, SAVE);
      await runner.enter(bad.layer, SAVE);
      expect(runner.failures()).toBe(2);
      await runner.enter(good.layer, SAVE);
      expect(runner.failures()).toBe(0);
    });

    it("aborto não conta nem zera", async () => {
      const calls: Calls = [];
      const bad = failingLayer("cinza", new Error("x"));
      const slow = deferredLayer("cinza", "a", calls);
      const runner = createLayerRunner(fakeCtx().ctx);
      await runner.enter(bad.layer, SAVE);
      const p = runner.enter(slow.layer, SAVE);
      await tick();
      runner.leave();
      slow.resolve();
      await p;
      expect(runner.failures()).toBe(1);
    });

    it("instance.enter() que lança → failed, instância descartada uma vez, conta como falha", async () => {
      const calls: Calls = [];
      const a = immediateLayer("cinza", "a", calls, {
        enter: () => {
          throw new Error("save estranho");
        },
      });
      const runner = createLayerRunner(fakeCtx().ctx, { onError: vi.fn() });
      const r = await runner.enter(a.layer, SAVE);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("failed");
      expect(a.instance.dispose).toHaveBeenCalledTimes(1);
      expect(runner.current()).toBeNull();
      expect(runner.failures()).toBe(1);
    });

    it("tentar de novo depois de falhar funciona", async () => {
      const calls: Calls = [];
      const good = immediateLayer("cinza", "a", calls);
      const bad = failingLayer("cinza", new Error("x"));
      const runner = createLayerRunner(fakeCtx().ctx);
      await runner.enter(bad.layer, SAVE);
      const r = await runner.enter(good.layer, SAVE);
      expect(r.ok).toBe(true);
      expect(runner.current()).toBe(good.instance);
    });
  });
});
