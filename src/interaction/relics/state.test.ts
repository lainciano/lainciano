import { describe, expect, it } from "vitest";
import { RELIC_IDS } from "@/interaction/relics/catalog";
import {
  EMPTY_STATE, attachTicket, dropTicket, formatElapsed, markRecorded, parseRelicState, platinumElapsedMs, startRun, unlockRelic,
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

const OLD_IDS = ["sangue", "leitura", "arremesso", "case", "lente", "leitor", "orbita", "terminal", "sudo", "explorador"] as const;

describe("11ª relíquia", () => {
  it("a platina exige as 11 relíquias", () => {
    let s = startRun(EMPTY_STATE, "r", 1_000);
    for (const id of OLD_IDS) {
      const r = unlockRelic(s, id, 2_000);
      expect(r.becamePlatinum).toBe(false);
      s = r.state;
    }
    expect(unlockRelic(s, "limiar", 3_000).becamePlatinum).toBe(true);
    expect(RELIC_IDS).toHaveLength(11);
  });
  it("estado salvo com 10/10 antigo perde a platina local e mantém a posição no livro", () => {
    const s = parseRelicState(JSON.stringify({ won: OLD_IDS, runId: "r", startedAt: 1, platinumAt: 2, recordedPosition: 3 }));
    expect(s.platinumAt).toBeNull();
    expect(s.recordedPosition).toBe(3);
    expect(s.won).toHaveLength(10);
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

describe("bilhete e gravação (Fase 6, D4)", () => {
  const ticket = { runId: "3f2b6c1e-9a4d-4e8b-8f1a-2c3d4e5f6a7b", issuedAt: 1_800_000_000_000, token: "tok" };

  it("attachTicket troca o runId local pelo do servidor e guarda o bilhete; o cronômetro não muda", () => {
    const state = startRun(EMPTY_STATE, "local-1", 1000);
    const next = attachTicket(state, ticket);
    expect(next).toEqual({ ...state, runId: ticket.runId, ticket: { issuedAt: ticket.issuedAt, token: "tok" } });
    expect(next.startedAt).toBe(1000);
  });
  it("dropTicket zera só o bilhete; runId e cronômetro ficam", () => {
    const state = attachTicket(startRun(EMPTY_STATE, "local-1", 1000), ticket);
    const dropped = dropTicket(state);
    expect(dropped.ticket).toBeNull();
    expect(dropped).toEqual({ ...state, ticket: null });
    expect(dropped.startedAt).toBe(1000);
    expect(dropTicket(dropped)).toBe(dropped);
    expect(attachTicket(dropped, { ...ticket, runId: "novo", token: "t2" }).runId).toBe("novo");
  });
  it("um segundo bilhete não substitui o primeiro", () => {
    const once = attachTicket(EMPTY_STATE, ticket);
    expect(attachTicket(once, { ...ticket, runId: "outro", token: "x" })).toBe(once);
  });
  it("markRecorded guarda a posição", () => {
    expect(markRecorded(EMPTY_STATE, 3).recordedPosition).toBe(3);
  });
  it("parseRelicState lê bilhete e posição válidos e descarta lixo", () => {
    const saved = { ...attachTicket(EMPTY_STATE, ticket), recordedPosition: 2 };
    expect(parseRelicState(JSON.stringify(saved))).toMatchObject({ ticket: { issuedAt: ticket.issuedAt, token: "tok" }, recordedPosition: 2 });
    const junk = parseRelicState(JSON.stringify({ ticket: { issuedAt: "x", token: 1 }, recordedPosition: -1 }));
    expect(junk.ticket).toBeNull();
    expect(junk.recordedPosition).toBeNull();
  });
  it("parseRelicState descarta bilhete guardado sem runId", () => {
    const parsed = parseRelicState(JSON.stringify({ ticket: { issuedAt: 1, token: "tok" } }));
    expect(parsed.runId).toBeNull();
    expect(parsed.ticket).toBeNull();
  });
});
