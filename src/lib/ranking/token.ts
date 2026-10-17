import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** O que o token assina (spec 8.5): "runId:issuedAt". */
export function runPayload(runId: string, issuedAt: number): string {
  return `${runId}:${issuedAt}`;
}

export function signRun(secret: string, runId: string, issuedAt: number): string {
  return createHmac("sha256", secret).update(runPayload(runId, issuedAt)).digest("base64url");
}

/** Comparação em tempo constante para quaisquer comprimentos (compara os SHA-256, sempre 32 bytes). */
export function safeEqual(a: string, b: string): boolean {
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right) && a.length === b.length;
}

export function verifyRun(secret: string, runId: string, issuedAt: number, token: string): boolean {
  return safeEqual(signRun(secret, runId, issuedAt), token);
}
