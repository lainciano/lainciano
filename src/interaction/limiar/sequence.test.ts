import { describe, expect, it } from "vitest";
import {
  ACTS,
  INSCRIPTION_COUNT,
  TIMING,
  closeOutcome,
  nextAct,
  transitionFor,
  type Act,
  type TransitionKind,
} from "@/interaction/limiar/sequence";

describe("nextAct", () => {
  it("percorre os 5 atos e termina em null", () => {
    const seen: Act[] = [];
    let act: Act | null = ACTS[0];
    while (act) {
      seen.push(act);
      act = nextAct(act);
    }
    expect(seen).toEqual(["som", "abertura", "gesto", "inscricoes", "reliquia"]);
    expect(nextAct("reliquia")).toBeNull();
  });
});

describe("transitionFor", () => {
  const table: Array<[Act, TransitionKind]> = [
    ["som", "ember"],
    ["abertura", "engraving"],
    ["gesto", "iris"],
    ["inscricoes", "slices"],
    ["reliquia", "ember"],
  ];

  it.each(table)("%s -> %s com movimento normal", (act, kind) => {
    expect(transitionFor(act, { reduced: false })).toBe(kind);
  });

  it.each(table)("%s -> fade com movimento reduzido", (act) => {
    expect(transitionFor(act, { reduced: true })).toBe("fade");
  });
});

describe("constantes", () => {
  it("expõe tempos e contagem do spec", () => {
    expect(TIMING.holdFillMs).toBe(1500);
    expect(TIMING.holdDrainMs).toBe(900);
    expect(TIMING.exitMs).toEqual([500, 750]);
    expect(INSCRIPTION_COUNT).toBe(3);
  });
});

describe("closeOutcome", () => {
  const base = { collected: false, hasRelic: false, hasSoundPref: false };

  it("concede a relíquia ao completar coletada", () => {
    expect(closeOutcome({ ...base, reason: "complete", collected: true }).grantRelic).toBe(true);
  });

  it("pular sem coletar não concede e writeSoundOff segue hasSoundPref", () => {
    expect(closeOutcome({ ...base, reason: "skip" })).toEqual({
      grantRelic: false,
      writeSoundOff: true,
      enableReading: false,
    });
    expect(closeOutcome({ ...base, reason: "skip", hasSoundPref: true }).writeSoundOff).toBe(false);
  });

  it("pular depois de coletar também concede", () => {
    expect(closeOutcome({ ...base, reason: "skip", collected: true }).grantRelic).toBe(true);
  });

  it("não concede de novo se já tem a relíquia", () => {
    expect(
      closeOutcome({ ...base, reason: "complete", collected: true, hasRelic: true }).grantRelic,
    ).toBe(false);
  });

  it("reading liga o modo leitura", () => {
    expect(closeOutcome({ ...base, reason: "reading" }).enableReading).toBe(true);
    expect(closeOutcome({ ...base, reason: "complete" }).enableReading).toBe(false);
  });
});
