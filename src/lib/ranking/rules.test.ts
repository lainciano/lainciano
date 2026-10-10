import { describe, expect, it } from "vitest";
import { RELIC_IDS } from "@/interaction/relics/catalog";
import { RUN_RULES, checkSubmission } from "@/lib/ranking/rules";

const NOW = 1_800_000_000_000;
const base = { relics: [...RELIC_IDS], elapsedMs: 300_000, issuedAt: NOW - 3_600_000, now: NOW };

describe("RUN_RULES", () => {
  it("piso de 120 s (spec 8.5), teto de 30 dias, folga de relógio de 1 min", () => {
    expect(RUN_RULES).toEqual({ minElapsedMs: 120_000, maxElapsedMs: 2_592_000_000, clockSkewMs: 60_000 });
  });
});

describe("checkSubmission", () => {
  it("run completa e plausível passa", () => {
    expect(checkSubmission(base)).toEqual({ ok: true });
  });
  it("as 10 relíquias, sem faltar, repetir nem inventar", () => {
    expect(checkSubmission({ ...base, relics: RELIC_IDS.slice(1) })).toEqual({ ok: false, error: "incomplete" });
    expect(checkSubmission({ ...base, relics: [...RELIC_IDS.slice(1), RELIC_IDS[1]] })).toEqual({ ok: false, error: "incomplete" });
    expect(checkSubmission({ ...base, relics: [...RELIC_IDS.slice(1), "coroa"] })).toEqual({ ok: false, error: "incomplete" });
    expect(checkSubmission({ ...base, relics: [...RELIC_IDS, "sangue"] })).toEqual({ ok: false, error: "incomplete" });
  });
  it("a ordem das relíquias não importa", () => {
    expect(checkSubmission({ ...base, relics: [...RELIC_IDS].reverse() })).toEqual({ ok: true });
  });
  it("menos de 120 s é rápido demais; exatamente 120 s passa", () => {
    expect(checkSubmission({ ...base, elapsedMs: 119_999 })).toEqual({ ok: false, error: "too_fast" });
    expect(checkSubmission({ ...base, elapsedMs: 120_000 })).toEqual({ ok: true });
  });
  it("tempo não inteiro, negativo ou acima de 30 dias é inválido", () => {
    for (const elapsedMs of [300_000.5, -1, 2_592_000_001, Number.NaN]) {
      expect(checkSubmission({ ...base, elapsedMs })).toEqual({ ok: false, error: "bad_time" });
    }
  });
  it("bilhete emitido no futuro (além da folga) é inválido", () => {
    expect(checkSubmission({ ...base, issuedAt: NOW + 60_001 })).toEqual({ ok: false, error: "bad_time" });
    expect(checkSubmission({ ...base, issuedAt: NOW + 60_000 })).toEqual({ ok: true });
  });
});
