import { describe, expect, it } from "vitest";
import {
  FIRST_INSCRIPTION,
  KEY_PITCH,
  advanceInscription,
  keyPitch,
  phraseStatus,
  phraseText,
  revealMs,
  splitWords,
  type InscriptionParts,
  type InscriptionState,
} from "@/interaction/limiar/acts/inscriptions-plan";
import { INSCRIPTION_COUNT } from "@/interaction/limiar/sequence";
import { limiar } from "@/lib/content/copy";

/** O texto que o DOM monta a partir das palavras (espaço antes quando `space`). */
const rebuild = (parts: InscriptionParts) =>
  splitWords(parts)
    .map((w) => (w.space ? " " : "") + w.text)
    .join("");

describe("splitWords", () => {
  it("separa as palavras e marca só a palavra-chave", () => {
    const words = splitWords(["há ", "relíquias", " escondidas nestas salas."]);
    expect(words.map((w) => w.text)).toEqual(["há", "relíquias", "escondidas", "nestas", "salas."]);
    expect(words.filter((w) => w.key).map((w) => w.text)).toEqual(["relíquias"]);
    expect(words[0].space).toBe(false);
    expect(words.slice(1).every((w) => w.space)).toBe(true);
  });

  it("o texto remontado é idêntico à frase, para as três inscrições", () => {
    expect(limiar.inscriptions).toHaveLength(INSCRIPTION_COUNT);
    for (const parts of limiar.inscriptions) {
      expect(rebuild(parts)).toBe(phraseText(parts));
      expect(splitWords(parts).some((w) => w.key)).toBe(true);
    }
  });

  it("sem espaço na fronteira, as peças ficam coladas", () => {
    const words = splitWords(["a ", "cripta", ", sim."]);
    expect(words.map((w) => [w.text, w.space])).toEqual([
      ["a", false],
      ["cripta", true],
      [",", false],
      ["sim.", true],
    ]);
    expect(rebuild(["a ", "cripta", ", sim."])).toBe("a cripta, sim.");
  });

  it("palavra-chave com várias palavras marca todas", () => {
    expect(splitWords(["o ", "livro dos nomes", "."]).filter((w) => w.key)).toHaveLength(3);
  });
});

describe("revealMs e keyPitch", () => {
  it("a frase acende quando a última palavra termina", () => {
    expect(revealMs(5, 90, 500)).toBe(4 * 90 + 500);
    expect(revealMs(1, 90, 500)).toBe(500);
    expect(revealMs(0, 90, 500)).toBe(0);
  });

  it("o tique vai de 0,9 a 1,2 ao longo da frase", () => {
    expect(keyPitch(0, 6)).toBeCloseTo(KEY_PITCH[0]);
    expect(keyPitch(5, 6)).toBeCloseTo(KEY_PITCH[1]);
    const pitches = Array.from({ length: 6 }, (_, i) => keyPitch(i, 6));
    pitches.slice(1).forEach((p, i) => expect(p).toBeGreaterThan(pitches[i]));
    expect(keyPitch(0, 1)).toBe(0.9);
    expect(keyPitch(99, 6)).toBeCloseTo(1.2);
  });
});

describe("advanceInscription", () => {
  it("durante o acendimento, avançar completa a frase sem pular", () => {
    expect(advanceInscription(FIRST_INSCRIPTION, 3)).toEqual({ index: 0, revealed: true });
  });

  it("acesa, vai para a próxima; depois da última, done", () => {
    let state: InscriptionState | "done" = FIRST_INSCRIPTION;
    const seen: (InscriptionState | "done")[] = [];
    for (let i = 0; i < 6; i++) {
      state = advanceInscription(state as InscriptionState, 3);
      seen.push(state);
    }
    expect(seen).toEqual([
      { index: 0, revealed: true },
      { index: 1, revealed: false },
      { index: 1, revealed: true },
      { index: 2, revealed: false },
      { index: 2, revealed: true },
      "done",
    ]);
  });

  it("situação das frases na pilha", () => {
    expect([0, 1, 2].map((i) => phraseStatus(i, 1))).toEqual(["passada", "atual", "futura"]);
    expect([0, 1, 2].map((i) => phraseStatus(i, -1))).toEqual(["futura", "futura", "futura"]);
  });
});
