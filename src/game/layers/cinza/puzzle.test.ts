import { describe, expect, it } from "vitest";
import { mergeSavePatch } from "../../save/merge";
import { initialSave, type SaveV1 } from "../../save/schema";
import { createSaveStore } from "../../save/store";
import { CINZA_HINTS, CINZA_LINES, cinzaPatch, cinzaPuzzle, cinzaSteps, doorHold, DOOR_TARGET, KEY_ITEM, readCinza, type CinzaAction, type CinzaState } from "./puzzle";
import { DOOR_FLAG } from "./places";

const S0 = cinzaPuzzle.initial;
const run = (s: CinzaState, ...actions: CinzaAction[]) => {
  let state = s;
  const effects = [];
  for (const a of actions) {
    const r = cinzaPuzzle.reduce(state, a);
    state = r.state;
    effects.push(...r.effects);
  }
  return { state, effects };
};

describe("puzzle da sala cinza · redutor puro", () => {
  it("estado inicial: nada lido, nada pego, porta fechada, nenhuma pista", () => {
    expect(S0).toEqual({ keyTaken: false, noteRead: false, doorOpen: false, forced: false, hints: 0 });
    expect(cinzaPuzzle.solved(S0)).toBe(false);
    expect(cinzaPuzzle.id).toBe("cinza");
    expect(cinzaPuzzle.exit).toEqual({ type: "force-door" });
  });

  it("use-door sem a chave: estado igual, bate na porta e diz que está trancada", () => {
    const r = cinzaPuzzle.reduce(S0, { type: "use-door" });
    expect(r.state).toEqual(S0);
    expect(r.effects).toEqual([
      { type: "sfx", name: "knock" },
      { type: "say", text: CINZA_LINES.doorLocked },
    ]);
    expect(CINZA_LINES.doorLocked).toBe("trancada.");
  });

  it("caminho completo: lê o bilhete → pega a chave no armário → usa na porta → resolvido e abre a porta norte", () => {
    const { state, effects } = run(S0, { type: "read-note" }, { type: "take-key" }, { type: "use-door" });
    expect(state).toEqual({ keyTaken: true, noteRead: true, doorOpen: true, forced: false, hints: 0 });
    expect(cinzaPuzzle.solved(state)).toBe(true);
    expect(effects).toContainEqual({ type: "open", target: "porta-norte" });
    expect(DOOR_TARGET).toBe("porta-norte");
    expect(effects).toContainEqual({ type: "say", text: CINZA_LINES.keyFound });
    expect(effects).toContainEqual({ type: "say", text: CINZA_LINES.doorUnlocked });
  });

  it("o armário sem saber da chave (nem bilhete, nem a 2ª pista) não a entrega; depois da 2ª pista, entrega", () => {
    const blind = cinzaPuzzle.reduce(S0, { type: "take-key" });
    expect(blind.state).toEqual(S0);
    expect(blind.effects).toEqual([{ type: "say", text: CINZA_LINES.wardrobeBlind }]);
    // a 2ª pista diz onde está: quem a ouviu acha a chave sem ter lido o bilhete
    const told = run(S0, { type: "hint" }, { type: "hint" }, { type: "take-key" });
    expect(told.state.keyTaken).toBe(true);
    // pegar de novo: o armário já está vazio, nada muda
    const again = cinzaPuzzle.reduce(told.state, { type: "take-key" });
    expect(again.state).toBe(told.state);
    expect(again.effects).toEqual([{ type: "say", text: CINZA_LINES.wardrobeEmpty }]);
  });

  it("force-door antes da 3ª pista é ignorado (nem estado, nem efeito); depois dela, abre com forced", () => {
    for (const hints of [0, 1, 2]) {
      const s = { ...S0, hints };
      const r = cinzaPuzzle.reduce(s, { type: "force-door" });
      expect(r.state, `pista ${hints}`).toBe(s);
      expect(r.effects, `pista ${hints}`).toEqual([]);
    }
    const r = run(S0, { type: "hint" }, { type: "hint" }, { type: "hint" }, { type: "force-door" });
    expect(r.state).toMatchObject({ doorOpen: true, forced: true, keyTaken: false });
    expect(cinzaPuzzle.solved(r.state)).toBe(true);
    expect(r.effects).toContainEqual({ type: "open", target: "porta-norte" });
    expect(r.effects).toContainEqual({ type: "say", text: CINZA_LINES.doorForced });
  });

  it("porta já aberta: usar ou forçar de novo não muda nada nem reabre", () => {
    const open = run(S0, { type: "read-note" }, { type: "take-key" }, { type: "use-door" }).state;
    const used = cinzaPuzzle.reduce(open, { type: "use-door" });
    expect(used.state).toBe(open);
    expect(used.effects).toEqual([{ type: "say", text: CINZA_LINES.doorOpen }]);
    const forced = cinzaPuzzle.reduce({ ...open, hints: 3 }, { type: "force-door" });
    expect(forced.effects.some((e) => e.type === "open")).toBe(false);
  });

  it("as pistas sobem até 3 e param; ler o bilhete duas vezes não muda nada", () => {
    const r = run(S0, { type: "hint" }, { type: "hint" }, { type: "hint" }, { type: "hint" }, { type: "hint" });
    expect(r.state.hints).toBe(3);
    expect(r.effects).toEqual([]);
    const read = run(S0, { type: "read-note" }).state;
    expect(cinzaPuzzle.reduce(read, { type: "read-note" }).state).toBe(read);
  });

  it("as pistas são as do plano, e o bilhete, as falas e as pistas contam a mesma história (armário, prateleira de cima, porta norte)", () => {
    expect(CINZA_HINTS).toEqual([
      "o bilhete na mesa fala de um armário.",
      "a chave fica na prateleira de cima do armário.",
      "a porta ao norte usa a chave. ou cede, se insistir.",
    ]);
    expect(cinzaPuzzle.hints).toBe(CINZA_HINTS);
    expect(CINZA_LINES.keyFound).toMatch(/prateleira de cima/);
    // a chavinha da fechadura do armário (que se vê no modelo) não é a da porta: a fala desarma a confusão
    expect(CINZA_LINES.wardrobeBlind).toMatch(/só do armário|só serve no armário/);
    expect(Object.values(CINZA_LINES).join(" ")).not.toMatch(/a chave ficou na fechadura/);
  });

  it("passos (para zerar a escada): bilhete, chave e porta contam; pista não conta", () => {
    expect(cinzaSteps(S0)).toBe(0);
    expect(cinzaSteps(run(S0, { type: "hint" }).state)).toBe(0);
    expect(cinzaSteps(run(S0, { type: "read-note" }).state)).toBe(1);
    expect(cinzaSteps(run(S0, { type: "read-note" }, { type: "take-key" }).state)).toBe(2);
    expect(cinzaSteps(run(S0, { type: "read-note" }, { type: "take-key" }, { type: "use-door" }).state)).toBe(3);
  });
});

describe("puzzle da sala cinza · save (save.puzzles.cinza, itens e a flag da porta)", () => {
  const withPuzzle = (p: unknown, extra: Partial<SaveV1> = {}): SaveV1 => ({ ...initialSave(0), puzzles: { cinza: p }, ...extra });

  it("readCinza: ausente ou estragado vira o inicial; campos estranhos são ignorados; pistas presas a 0..3", () => {
    expect(readCinza(initialSave(0))).toEqual(S0);
    expect(readCinza(withPuzzle("lixo"))).toEqual(S0);
    expect(readCinza(withPuzzle(null))).toEqual(S0);
    expect(readCinza(withPuzzle({ keyTaken: "sim", hints: 99, extra: 1 }))).toEqual({ ...S0, hints: 3 });
    expect(readCinza(withPuzzle({ hints: -4 }))).toEqual(S0);
    expect(readCinza(withPuzzle({ hints: 1.7 }))).toEqual({ ...S0, hints: 1 });
    expect(readCinza(withPuzzle({ noteRead: true, keyTaken: true }))).toEqual({ ...S0, noteRead: true, keyTaken: true });
  });

  it("readCinza: um save só com a flag da porta (sem puzzles.cinza) lê a porta aberta, como o enter", () => {
    expect(readCinza({ ...initialSave(0), flags: { [DOOR_FLAG]: true } })).toEqual({ ...S0, doorOpen: true });
    expect(readCinza({ ...initialSave(0), flags: { [DOOR_FLAG]: true }, puzzles: { cinza: { hints: 2 } } })).toEqual({ ...S0, doorOpen: true, hints: 2 });
    expect(doorHold({ ...initialSave(0), flags: { [DOOR_FLAG]: true }, puzzles: { cinza: { hints: 3 } } })).toBeUndefined();
  });

  it("cinzaPatch: estado inteiro em puzzles.cinza, a chave no inventário enquanto está na mão, a flag da porta", () => {
    const base = initialSave(0);
    const taken = { ...S0, noteRead: true, keyTaken: true };
    const p1 = cinzaPatch({ ...base, items: ["mapa"] }, taken);
    expect(p1.puzzles).toEqual({ cinza: taken });
    expect(p1.items).toEqual(["mapa", KEY_ITEM]);
    expect(p1.flags).toEqual({ [DOOR_FLAG]: false });
    // abrir com a chave: ela fica na fechadura da porta (sai do inventário) e a flag da porta liga
    const opened = { ...taken, doorOpen: true };
    const p2 = cinzaPatch({ ...base, items: ["mapa", KEY_ITEM] }, opened);
    expect(p2.items).toEqual(["mapa"]);
    expect(p2.flags).toEqual({ [DOOR_FLAG]: true });
    // forçada sem a chave: nada entra no inventário
    expect(cinzaPatch(base, { ...S0, hints: 3, doorOpen: true, forced: true }).items).toEqual([]);
  });

  it("mergeSavePatch: o patch do puzzle não apaga outras flags nem outros puzzles (um nível)", () => {
    const save = { ...initialSave(0), flags: { "lido:bilhete": true }, puzzles: { outro: { x: 1 } } };
    const next = mergeSavePatch(save, cinzaPatch(save, { ...S0, keyTaken: true, noteRead: true, doorOpen: true }));
    expect(next.flags).toEqual({ "lido:bilhete": true, [DOOR_FLAG]: true });
    expect(next.puzzles).toEqual({ outro: { x: 1 }, cinza: { ...S0, keyTaken: true, noteRead: true, doorOpen: true } });
  });

  it("sobrevive a recarregar: o store grava, um store novo sobre o mesmo storage lê a chave e as pistas", () => {
    const map = new Map<string, string>();
    const storage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
      key: (i: number) => [...map.keys()][i] ?? null,
      get length() {
        return map.size;
      },
    };
    const a = createSaveStore(storage, () => 0);
    const state = { ...S0, noteRead: true, keyTaken: true, hints: 2 };
    a.patch(cinzaPatch(a.get(), state));
    const b = createSaveStore(storage, () => 0);
    expect(readCinza(b.get())).toEqual(state);
    expect(b.get().items).toContain(KEY_ITEM);
  });

  it("segurar a porta (forçar) só depois da 3ª pista, com a porta fechada e SEM a chave (com ela, E usa a chave)", () => {
    expect(doorHold(withPuzzle({ hints: 2 }))).toBeUndefined();
    expect(doorHold(withPuzzle({ hints: 3 }))).toEqual({ seconds: 1.4, verb: "forçar a porta" });
    expect(doorHold(withPuzzle({ hints: 3, keyTaken: true }))).toBeUndefined();
    expect(doorHold(withPuzzle({ hints: 3, doorOpen: true, forced: true }))).toBeUndefined();
  });
});
