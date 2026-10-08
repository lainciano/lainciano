import { describe, expect, it } from "vitest";
import { RELIC_IDS } from "@/interaction/relics/catalog";
import {
  EMPTY_STATE, formatElapsed, parseRelicState, platinumElapsedMs, startRun, unlockRelic,
} from "@/interaction/relics/state";

describe("startRun", () => {
  it("inicia uma vez e não reinicia", () => {
    const a = startRun(EMPTY_STATE, "r1", 100);
    expect(a).toMatchObject({ runId: "r1", startedAt: 100 });
    expect(startRun(a, "r2", 999)).toBe(a);
  });
});

describe("unlockRelic", () => {
  it("desbloqueia uma vez", () => {
    const first = unlockRelic(EMPTY_STATE, "sangue", 10);
    expect(first.isNew).toBe(true);
    expect(first.state.won).toEqual(["sangue"]);
    const again = unlockRelic(first.state, "sangue", 20);
    expect(again.isNew).toBe(false);
    expect(again.state).toBe(first.state);
  });
  it("platina exatamente na 10ª", () => {
    let s = startRun(EMPTY_STATE, "r", 1_000);
    const [last, ...rest] = [...RELIC_IDS].reverse();
    for (const id of rest) {
      const r = unlockRelic(s, id, 2_000);
      expect(r.becamePlatinum).toBe(false);
      s = r.state;
    }
    const final = unlockRelic(s, last, 61_000);
    expect(final.becamePlatinum).toBe(true);
    expect(platinumElapsedMs(final.state)).toBe(60_000);
  });
});

describe("parseRelicState", () => {
  it("JSON inválido vira estado vazio", () => expect(parseRelicState("{oops")).toEqual(EMPTY_STATE));
  it("descarta ids desconhecidos e duplicados", () => {
    const s = parseRelicState(JSON.stringify({ won: ["sangue", "x", "sangue"], runId: "r", startedAt: 5 }));
    expect(s.won).toEqual(["sangue"]);
    expect(s.startedAt).toBe(5);
  });
  it("ignora platinumAt sem as 10 relíquias", () => {
    const s = parseRelicState(JSON.stringify({ won: ["sangue"], platinumAt: 9 }));
    expect(s.platinumAt).toBeNull();
  });
});

describe("formatElapsed", () => {
  it("mm:ss com zero à esquerda", () => {
    expect(formatElapsed(65_000)).toBe("01:05");
    expect(formatElapsed(3_600_000)).toBe("60:00");
  });
});
