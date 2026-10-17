import { describe, expect, it } from "vitest";
import { runPayload, safeEqual, signRun, verifyRun } from "@/lib/ranking/token";

const SECRET = "segredo-de-teste-com-mais-de-32-caracteres!!";
const RUN = "3f2b6c1e-9a4d-4e8b-8f1a-2c3d4e5f6a7b";

describe("bilhete da run (spec 8.5: HMAC-SHA256(secret, runId:inicio))", () => {
  it("payload é runId:issuedAt", () => {
    expect(runPayload(RUN, 1700000000000)).toBe(`${RUN}:1700000000000`);
  });
  it("assinatura confere e é base64url estável", () => {
    const token = signRun(SECRET, RUN, 1700000000000);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(signRun(SECRET, RUN, 1700000000000)).toBe(token);
    expect(verifyRun(SECRET, RUN, 1700000000000, token)).toBe(true);
  });
  it("qualquer troca invalida (Review Focus 1)", () => {
    const token = signRun(SECRET, RUN, 1700000000000);
    expect(verifyRun(SECRET, RUN, 1700000000001, token)).toBe(false);
    expect(verifyRun(SECRET, RUN.replace("3f", "4f"), 1700000000000, token)).toBe(false);
    expect(verifyRun("outro-segredo-de-teste-com-32-caracteres!!", RUN, 1700000000000, token)).toBe(false);
    const flipped = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
    expect(verifyRun(SECRET, RUN, 1700000000000, flipped)).toBe(false);
  });
  it("token de comprimento diferente ou vazio não lança", () => {
    expect(verifyRun(SECRET, RUN, 1700000000000, "curto")).toBe(false);
    expect(verifyRun(SECRET, RUN, 1700000000000, "")).toBe(false);
  });
});

describe("safeEqual (tempo constante, comprimentos quaisquer)", () => {
  it("igual, diferente e comprimentos diferentes", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
