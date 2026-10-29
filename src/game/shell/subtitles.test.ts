import { describe, expect, it } from "vitest";
import { lineDuration, splitWords, wordDelays, type Line } from "./subtitles";

describe("splitWords", () => {
  it("separa por espaços: 'a lâmpada balança' tem 3 palavras", () => {
    expect(splitWords("a lâmpada balança")).toEqual(["a", "lâmpada", "balança"]);
  });

  it("ignora espaços sobrando, quebras de linha e texto vazio", () => {
    expect(splitWords("  trancada.  ")).toEqual(["trancada."]);
    expect(splitWords("uma\nlinha  só")).toEqual(["uma", "linha", "só"]);
    expect(splitWords("")).toEqual([]);
    expect(splitWords("   ")).toEqual([]);
  });

  it("a pontuação fica colada à palavra (a legenda não separa a vírgula)", () => {
    expect(splitWords("sim, talvez… não.")).toEqual(["sim,", "talvez…", "não."]);
  });
});

describe("lineDuration", () => {
  it("texto vazio fica no piso de 3,2 s", () => {
    expect(lineDuration("")).toBe(3.2);
  });

  it("uma palavra curta ('trancada.') também fica no piso", () => {
    expect(lineDuration("trancada.")).toBe(3.2);
  });

  it("texto de 400 caracteres bate no teto de 10 s", () => {
    expect(lineDuration("a".repeat(400))).toBe(10);
    expect(lineDuration("palavra ".repeat(50))).toBe(10);
  });

  it("cresce com o tamanho do texto: 2,6 + 0,06/caractere + 0,045/palavra", () => {
    const text = "madeira gasta onde os braços apoiavam. alguém escreveu aqui por muito tempo.";
    const words = splitWords(text).length;
    expect(lineDuration(text)).toBeCloseTo(2.6 + text.length * 0.06 + words * 0.045, 6);
    expect(lineDuration(text)).toBeGreaterThan(lineDuration("madeira gasta."));
  });

  it("nunca sai de [3,2; 10]", () => {
    for (const n of [0, 1, 5, 12, 40, 100, 400, 2000]) {
      const d = lineDuration("x ".repeat(n));
      expect(d).toBeGreaterThanOrEqual(3.2);
      expect(d).toBeLessThanOrEqual(10);
    }
  });
});

describe("wordDelays", () => {
  it("palavra a palavra: cada uma entra 42 ms depois da anterior", () => {
    expect(wordDelays(4)).toEqual([0, 42, 84, 126]);
  });

  it("movimento reduzido: tudo de uma vez, sem atraso", () => {
    expect(wordDelays(4, true)).toEqual([0, 0, 0, 0]);
  });

  it("uma fala longa não demora mais que 1,2 s para acabar de aparecer", () => {
    const d = wordDelays(120);
    expect(d.at(-1)).toBeLessThanOrEqual(1200);
    expect(d[1]).toBeGreaterThan(0);
  });
});

describe("Line", () => {
  it("é o mesmo tipo da camada (reexportado)", () => {
    const l: Line = { text: "oi", label: "lain", kind: "speech" };
    expect(l.kind).toBe("speech");
  });
});
