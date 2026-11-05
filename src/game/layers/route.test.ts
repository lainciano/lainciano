import { describe, expect, it } from "vitest";
import { mergeSavePatch } from "../save/merge";
import { DEFAULT_SETTINGS, initialSave, type SaveV1 } from "../save/schema";
import { ANTESSALA_ARRIVED, layerEntry, layerForPath } from "./route";

/** Aplica a entrada como a sessão faz (`fresh` = reset + patch). */
function enter(save: SaveV1, target: "cinza" | "antessala"): SaveV1 {
  const e = layerEntry(save, target);
  if (e.kind === "keep") return save;
  return mergeSavePatch(e.kind === "fresh" ? initialSave(save.startedAt) : save, e.patch);
}

describe("layerForPath", () => {
  it.each(["/", "/work/x", "/blog/post", "/contact", ""])("na 1B %j cai na antessala", (p) => {
    expect(layerForPath(p)).toBe("antessala");
    expect(layerForPath(p, "?jogo=1")).toBe("antessala");
  });

  it("a sala cinza só abre com ?debug=1&camada=cinza (debug ligado)", () => {
    expect(layerForPath("/", "?debug=1&camada=cinza", true)).toBe("cinza");
    expect(layerForPath("/work/x", "?camada=cinza&debug=1", true)).toBe("cinza");
    expect(layerForPath("/", "?camada=cinza", false)).toBe("antessala");
    expect(layerForPath("/", "?debug=1&camada=porao", true)).toBe("antessala");
  });
});

describe("layerEntry (o save ao entrar na camada)", () => {
  const settings = { ...DEFAULT_SETTINGS, fov: 74, volume: 0.4, quality: 360 as const };
  const oldCinza: SaveV1 = { ...initialSave(5), layer: "cinza", place: "mesa", items: ["chave"], flags: { "lido:bilhete": true }, puzzles: { cinza: { hints: 2 } }, settings, playMs: 9000 };

  it("save novo nasce na antessala", () => {
    expect(initialSave(0).layer).toBe("antessala");
  });

  it("save da 1A (cinza) abre a Antessala na entrada, preservando os ajustes e sem o progresso da cinza", () => {
    const next = enter(oldCinza, "antessala");
    expect(next.layer).toBe("antessala");
    expect(next.place).toBe("entrada");
    expect(next.settings).toEqual(settings);
    expect(next.items).toEqual([]);
    expect(next.puzzles).toEqual({});
    expect(next.flags).toEqual({ [ANTESSALA_ARRIVED]: true });
  });

  it("quem já chegou à Antessala e passou pela cinza de debug volta sem perder nada", () => {
    const progressed: SaveV1 = { ...initialSave(0), place: "balcao", items: ["cartao"], flags: { [ANTESSALA_ARRIVED]: true, "lido:carta": true }, puzzles: { antessala: { x: 1 } } };
    const inCinza = enter(progressed, "cinza");
    expect(inCinza.layer).toBe("cinza");
    expect(inCinza.items).toEqual(["cartao"]);
    const back = enter(inCinza, "antessala");
    expect(back.layer).toBe("antessala");
    expect(back.place).toBe("entrada");
    expect(back.items).toEqual(["cartao"]);
    expect(back.flags["lido:carta"]).toBe(true);
    expect(back.puzzles).toEqual({ antessala: { x: 1 } });
  });

  it("na antessala marca a chegada uma vez; depois não mexe", () => {
    const first = enter(initialSave(0), "antessala");
    expect(first.flags[ANTESSALA_ARRIVED]).toBe(true);
    expect(layerEntry(first, "antessala")).toEqual({ kind: "keep" });
  });

  it("abrir a cinza de debug só troca a camada (o lugar salvo fica)", () => {
    const save: SaveV1 = { ...initialSave(0), place: "mesa" };
    expect(enter(save, "cinza")).toMatchObject({ layer: "cinza", place: "mesa" });
    expect(layerEntry({ ...save, layer: "cinza" }, "cinza")).toEqual({ kind: "keep" });
  });
});
