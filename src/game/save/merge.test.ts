import { describe, expect, it } from "vitest";
import { mergeSavePatch } from "./merge";
import { DEFAULT_SETTINGS, initialSave } from "./schema";

const base = () => initialSave(1_700_000_000_000);

describe("mergeSavePatch", () => {
  it("funde flags chave a chave: bilhete (patch da mesa) + porta-norte (exit da camada) coexistem", () => {
    const afterTicket = mergeSavePatch(base(), { flags: { bilhete: true } });
    const afterExit = mergeSavePatch(afterTicket, { flags: { "porta-norte": true } });
    expect(afterExit.flags).toEqual({ bilhete: true, "porta-norte": true });
  });

  it("flags: a chave do patch vence a do save, e `false` desliga", () => {
    const s = mergeSavePatch({ ...base(), flags: { a: true, b: true } }, { flags: { a: false, c: true } });
    expect(s.flags).toEqual({ a: false, b: true, c: true });
  });

  it("funde puzzles um nível (o valor de cada puzzle é substituído inteiro)", () => {
    const s = mergeSavePatch(
      { ...base(), puzzles: { gaveta: { n: 1, extra: 2 }, outro: 7 } },
      { puzzles: { gaveta: { n: 2 } } },
    );
    expect(s.puzzles).toEqual({ gaveta: { n: 2 }, outro: 7 });
  });

  it("substitui items, relics e settings (quem patcha passa o valor completo)", () => {
    const start = { ...base(), items: ["a"], relics: [{ id: "r", clean: true }] };
    const s = mergeSavePatch(start, {
      items: ["b"],
      relics: [],
      settings: { ...DEFAULT_SETTINGS, fov: 70 },
      place: "mesa",
      playMs: 5,
    });
    expect(s.items).toEqual(["b"]);
    expect(s.relics).toEqual([]);
    expect(s.settings.fov).toBe(70);
    expect(s.place).toBe("mesa");
    expect(s.playMs).toBe(5);
  });

  it("não muta o save de entrada nem o patch", () => {
    const start = { ...base(), flags: { a: true } };
    const patch = { flags: { b: true } };
    const s = mergeSavePatch(start, patch);
    expect(start.flags).toEqual({ a: true });
    expect(patch.flags).toEqual({ b: true });
    expect(s).not.toBe(start);
  });

  it("ignora chaves undefined e mantém version 1", () => {
    const start = { ...base(), place: "mesa" };
    const s = mergeSavePatch(start, { place: undefined, version: 2 as unknown as 1 });
    expect(s.place).toBe("mesa");
    expect(s.version).toBe(1);
  });

  it("patch vazio devolve um save igual", () => {
    expect(mergeSavePatch(base(), {})).toEqual(base());
  });
});
