import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, initialSave } from "./schema";
import { SAVE_KEY, BROKEN_KEY, createSaveStore } from "./store";

const NOW = 1_700_000_000_000;

function memoryStorage(seed: Record<string, string> = {}, opts: { throwOnSet?: boolean } = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (opts.throwOnSet) throw new DOMException("quota", "QuotaExceededError");
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };
}

describe("save store", () => {
  it("chaves do contrato", () => {
    expect(SAVE_KEY).toBe("lainciano:jogo:save:v1");
    expect(BROKEN_KEY).toBe("lainciano:jogo:save:quebrado");
  });

  it("começa no estado inicial quando não há nada guardado", () => {
    const s = memoryStorage();
    const store = createSaveStore(s, () => NOW);
    expect(store.get()).toEqual(initialSave(NOW));
  });

  it("patch mescla e grava em lainciano:jogo:save:v1", () => {
    const s = memoryStorage();
    const store = createSaveStore(s, () => NOW);
    store.patch({ place: "mesa", items: ["chave"] });
    expect(store.get().place).toBe("mesa");
    expect(JSON.parse(s.map.get(SAVE_KEY)!)).toEqual({ ...initialSave(NOW), place: "mesa", items: ["chave"] });
  });

  it("recarrega o que foi gravado", () => {
    const s = memoryStorage();
    createSaveStore(s, () => NOW).patch({ playMs: 500 });
    expect(createSaveStore(s, () => NOW + 1).get().playMs).toBe(500);
  });

  it("save quebrado: guarda o original em quebrado, uma vez, sem sobrescrever", () => {
    const s = memoryStorage({ [SAVE_KEY]: "lixo" });
    const store = createSaveStore(s, () => NOW);
    expect(store.get()).toEqual(initialSave(NOW));
    expect(s.map.get(BROKEN_KEY)).toBe("lixo");

    s.map.set(SAVE_KEY, "outro lixo");
    createSaveStore(s, () => NOW);
    expect(s.map.get(BROKEN_KEY)).toBe("lixo");
  });

  it("save válido não cria cópia quebrada", () => {
    const s = memoryStorage({ [SAVE_KEY]: JSON.stringify(initialSave(NOW)) });
    createSaveStore(s, () => NOW);
    expect(s.map.has(BROKEN_KEY)).toBe(false);
  });

  it("reset volta ao inicial e grava", () => {
    const s = memoryStorage();
    const store = createSaveStore(s, () => NOW);
    store.patch({ items: ["chave"] });
    store.reset();
    expect(store.get()).toEqual(initialSave(NOW));
    expect(JSON.parse(s.map.get(SAVE_KEY)!)).toEqual(initialSave(NOW));
  });

  it("wipeGame remove só chaves lainciano:jogo:", () => {
    const s = memoryStorage({
      "lainciano:reliquias:v1": "x",
      "outra:chave": "y",
    });
    const store = createSaveStore(s, () => NOW);
    store.patch({ items: ["a"] });
    s.map.set("lainciano:jogo:save:quebrado", "z");
    s.map.set("lainciano:jogo:ativo", "on");
    store.wipeGame();
    expect([...s.map.keys()].sort()).toEqual(["lainciano:reliquias:v1", "outra:chave"]);
    expect(store.get()).toEqual(initialSave(NOW));
  });

  it("setItem que lança (cota) não derruba patch; o estado em memória segue", () => {
    const s = memoryStorage({}, { throwOnSet: true });
    const store = createSaveStore(s, () => NOW);
    expect(() => store.patch({ place: "mesa" })).not.toThrow();
    expect(store.get().place).toBe("mesa");
    expect(() => store.reset()).not.toThrow();
  });

  it("getItem que lança vira estado inicial", () => {
    const s = memoryStorage();
    s.getItem = () => {
      throw new Error("bloqueado");
    };
    expect(createSaveStore(s, () => NOW).get()).toEqual(initialSave(NOW));
  });

  it("settings parciais no patch substituem o objeto inteiro (quem chama mescla)", () => {
    const s = memoryStorage();
    const store = createSaveStore(s, () => NOW);
    store.patch({ settings: { ...DEFAULT_SETTINGS, fov: 70 } });
    expect(store.get().settings.fov).toBe(70);
  });
});
