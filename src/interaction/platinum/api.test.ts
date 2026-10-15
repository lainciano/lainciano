import { describe, expect, it } from "vitest";
import { fetchBook, requestTicket, submitErrorFrom, submitRun } from "@/interaction/platinum/api";

const reply = (status: number, body: unknown) => async () => Response.json(body, { status });
const offline = async () => {
  throw new TypeError("network");
};

describe("submitErrorFrom (código da API → mensagem conhecida)", () => {
  it("códigos conhecidos passam; o resto vira unavailable", () => {
    for (const code of ["invalid_nickname", "blocked_nickname", "rate_limited", "duplicate", "invalid_run", "too_fast", "incomplete"]) {
      expect(submitErrorFrom(code)).toBe(code);
    }
    expect(submitErrorFrom("bad_request")).toBe("invalid_run");
    expect(submitErrorFrom("qualquer")).toBe("unavailable");
    expect(submitErrorFrom(undefined)).toBe("unavailable");
  });
});

describe("requestTicket", () => {
  it("201 com bilhete bem formado", async () => {
    const ticket = { runId: "r", issuedAt: 1, token: "t" };
    expect(await requestTicket(reply(201, ticket))).toEqual(ticket);
  });
  it("503, corpo estranho ou rede fora → null", async () => {
    expect(await requestTicket(reply(503, { error: "unavailable" }))).toBeNull();
    expect(await requestTicket(reply(201, { runId: 1 }))).toBeNull();
    expect(await requestTicket(offline)).toBeNull();
  });
});

describe("submitRun", () => {
  const body = { runId: "r", issuedAt: 1, token: "t", nickname: "lain", relics: [], elapsedMs: 200_000 };
  it("201 → posição", async () => {
    expect(await submitRun(body, reply(201, { position: 4 }))).toEqual({ ok: true, position: 4 });
  });
  it("erro da API → código; rede fora → unavailable", async () => {
    expect(await submitRun(body, reply(429, { error: "rate_limited" }))).toEqual({ ok: false, error: "rate_limited" });
    expect(await submitRun(body, reply(500, "x"))).toEqual({ ok: false, error: "unavailable" });
    expect(await submitRun(body, offline)).toEqual({ ok: false, error: "unavailable" });
  });
});

describe("fetchBook", () => {
  it("lista válida; erro ou forma estranha → null", async () => {
    const entries = [{ position: 1, nickname: "lain", elapsedMs: 200_000, createdAt: 5 }];
    expect(await fetchBook(reply(200, { entries }))).toEqual(entries);
    expect(await fetchBook(reply(503, { error: "unavailable" }))).toBeNull();
    expect(await fetchBook(reply(200, { entries: [{ nickname: 3 }] }))).toBeNull();
    expect(await fetchBook(offline)).toBeNull();
  });
});
