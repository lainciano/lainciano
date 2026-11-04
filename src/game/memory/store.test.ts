import { describe, expect, it } from "vitest";
import { createSaveStore, ACTIVATION_KEY } from "../save/store";
import { MEMORY_LIMITS } from "./schema";
import { createMemoryStore, MEMORY_KEY, SESSION_KEY, type MemoryEnv } from "./store";

const min = (n: number) => n * 60_000;
const T0 = new Date(2026, 10, 4, 2, 15).getTime(); // 02:15 local: madrugada

function memoryStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

const ENV: MemoryEnv = { reading: false, sound: true, scares: true, touch: false, lang: "pt-BR", tz: "America/Sao_Paulo" };

function setup(over: Partial<MemoryEnv> = {}, seed: Record<string, string> = {}) {
  const storage = memoryStorage(seed);
  const session = memoryStorage();
  let t = T0;
  const env = { ...ENV, ...over };
  const store = createMemoryStore(storage, () => t, { session, env: () => env });
  return { storage, session, env, store, at: (v: number) => (t = v) };
}

describe("memória: store", () => {
  it("ausente → inicial; corrompida → inicial (sem guardar cópia)", () => {
    expect(setup().store.get().visits).toBe(0);
    const s = setup({}, { [MEMORY_KEY]: "{quebrado" });
    expect(s.store.get().visits).toBe(0);
    expect([...s.storage.map.keys()]).toEqual([MEMORY_KEY]); // nenhuma chave "quebrado"
  });

  it("visit() duas vezes em 5 min conta 1; depois de 31 min conta 2", () => {
    const s = setup();
    s.store.visit();
    s.at(T0 + min(5));
    s.store.visit();
    expect(s.store.get().visits).toBe(1);
    s.at(T0 + min(5) + min(31));
    s.store.visit();
    expect(s.store.get().visits).toBe(2);
  });

  it("recarregar (mesma sessão) não conta; fechar a aba (sem marca) conta", () => {
    const s = setup();
    s.store.visit();
    s.at(T0 + min(1));
    const reload = createMemoryStore(s.storage, () => T0 + min(1), { session: s.session, env: () => s.env });
    reload.visit();
    expect(reload.get().visits).toBe(1);
    s.session.removeItem(SESSION_KEY);
    const reopened = createMemoryStore(s.storage, () => T0 + min(2), { session: s.session, env: () => s.env });
    reopened.visit();
    expect(reopened.get().visits).toBe(2);
  });

  it("arrivals guarda HH:MM local (as últimas 8), madrugada e preferências; nada de timestamp", () => {
    const s = setup({ touch: true });
    for (let i = 0; i < 10; i++) {
      s.at(T0 + i * min(40));
      s.session.removeItem(SESSION_KEY);
      s.store.visit();
    }
    const m = s.store.get();
    expect(m.visits).toBe(10);
    expect(m.arrivals).toHaveLength(8);
    expect(m.arrivals.every((a) => /^\d\d:\d\d$/.test(a))).toBe(true);
    expect(m.arrivals[0]).toBe("03:35"); // 02:15 + 2 × 40 min: as duas primeiras saíram
    expect(m.device).toBe("touch");
    expect(m.lang).toBe("pt-BR");
    expect(m.tz).toBe("America/Sao_Paulo");
    expect(m.prefs).toEqual({ sound: true, reading: false, scares: true });
    expect(s.storage.map.get(MEMORY_KEY)).not.toMatch(/T\d\d:\d\d:\d\d|Z"|-03:00/);
  });

  it("madrugada só vale para 00:00–05:00", () => {
    const s = setup();
    s.store.visit();
    expect(s.store.get().night).toBe(true);
    const d = setup();
    d.at(new Date(2026, 10, 4, 14, 0).getTime());
    d.store.visit();
    expect(d.store.get().night).toBe(false);
  });

  it("exame: primeiro objeto e lista sem repetição; ids inválidos são ignorados", () => {
    const { store } = setup();
    store.record({ type: "examine", id: "bilhete" });
    store.record({ type: "examine", id: "caderno" });
    store.record({ type: "examine", id: "bilhete" });
    store.record({ type: "examine", id: "um texto selecionado qualquer" });
    expect(store.get().firstExamined).toBe("bilhete");
    expect(store.get().examined).toEqual(["bilhete", "caderno"]);
  });

  it("hesitação só conta acima de 8 s e guarda no máx. 20", () => {
    const { store } = setup();
    store.record({ type: "hesitate", id: "mesa", ms: 8000 });
    store.record({ type: "hesitate", id: "mesa", ms: 3000 });
    expect(store.get().hesitations).toEqual([]);
    for (let i = 0; i < 30; i++) store.record({ type: "hesitate", id: "mesa", ms: 9000 + i });
    expect(store.get().hesitations).toHaveLength(MEMORY_LIMITS.hesitations);
    expect(store.get().hesitations.at(-1)!.ms).toBe(9029);
  });

  it("tempo por lugar soma; pistas contam; forçar não repete", () => {
    const { store } = setup();
    store.record({ type: "place", id: "mesa", ms: 4000 });
    store.record({ type: "place", id: "mesa", ms: 2500 });
    store.record({ type: "hint", id: "cinza" });
    store.record({ type: "hint", id: "cinza" });
    store.record({ type: "force", id: "cinza" });
    store.record({ type: "force", id: "cinza" });
    const m = store.get();
    expect(m.placeMs).toEqual({ mesa: 6500 });
    expect(m.hints).toEqual({ cinza: 2 });
    expect(m.forced).toEqual(["cinza"]);
  });

  it("close guarda a hora da saída", () => {
    const s = setup();
    s.store.visit();
    s.at(T0 + min(3));
    s.store.close();
    expect(s.store.get().lastClosedAt).toBe(T0 + min(3));
  });

  it("modo leitura não grava nada (nem visita, nem evento)", () => {
    const s = setup({ reading: true });
    s.store.visit();
    s.store.record({ type: "examine", id: "bilhete" });
    s.store.close();
    expect(s.store.get().visits).toBe(0);
    expect(s.store.get().examined).toEqual([]);
    expect(s.storage.map.has(MEMORY_KEY)).toBe(false);
    expect(s.session.map.has(SESSION_KEY)).toBe(false);
  });

  it("storage que lança não derruba o jogo", () => {
    const boom = () => {
      throw new DOMException("bloqueado", "SecurityError");
    };
    const store = createMemoryStore({ getItem: boom, setItem: boom, removeItem: boom }, () => T0, { session: { getItem: boom, setItem: boom, removeItem: boom }, env: () => ENV });
    store.visit();
    store.record({ type: "examine", id: "bilhete" });
    expect(store.get().visits).toBe(1);
    expect(store.get().examined).toEqual(["bilhete"]);
  });

  it("JSON gravado < 4 KB após 100 eventos e no pior caso dos tetos", () => {
    const s = setup();
    s.store.visit();
    for (let i = 0; i < 100; i++) {
      const id = `objeto-${i % 40}`;
      s.store.record({ type: i % 4 === 0 ? "examine" : i % 4 === 1 ? "hesitate" : i % 4 === 2 ? "place" : "hint", id, ms: 9000 + i });
    }
    expect(s.storage.map.get(MEMORY_KEY)!.length).toBeLessThan(4096);

    // pior caso: ids no tamanho máximo em todas as listas cheias
    const w = setup();
    w.store.visit();
    const longId = (i: number) => `${"x".repeat(MEMORY_LIMITS.idLength - 3)}${String(i).padStart(3, "0")}`;
    for (let i = 0; i < 40; i++) {
      w.store.record({ type: "examine", id: longId(i) });
      w.store.record({ type: "place", id: longId(i), ms: MEMORY_LIMITS.maxMs });
      w.store.record({ type: "hesitate", id: longId(i), ms: MEMORY_LIMITS.maxMs });
      w.store.record({ type: "hint", id: longId(i) });
      w.store.record({ type: "force", id: longId(i) });
    }
    expect(w.storage.map.get(MEMORY_KEY)!.length).toBeLessThan(4096);
  });

  it("wipe() esquece tudo e a próxima abertura é a 1ª visita", () => {
    const s = setup();
    s.store.visit();
    s.store.wipe();
    expect(s.storage.map.has(MEMORY_KEY)).toBe(false);
    expect(s.store.get().visits).toBe(0);
    s.store.visit();
    expect(s.store.get().visits).toBe(1);
  });

  it("wipeGame do save apaga a memória e preserva a chave de ativação", () => {
    const s = setup({}, { [ACTIVATION_KEY]: "on" });
    s.store.visit();
    s.store.record({ type: "examine", id: "bilhete" });
    expect(s.storage.map.has(MEMORY_KEY)).toBe(true);
    createSaveStore(s.storage, () => T0).wipeGame();
    expect(s.storage.map.has(MEMORY_KEY)).toBe(false);
    expect(s.storage.map.get(ACTIVATION_KEY)).toBe("on");
  });
});
