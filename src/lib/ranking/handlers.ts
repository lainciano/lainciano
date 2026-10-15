import { createHmac } from "node:crypto";
import { z } from "zod";
import type { KeyedLimiter } from "./limiter";
import { checkSubmission } from "./rules";
import type { RankingStore } from "./store";
import { safeEqual, signRun, verifyRun } from "./token";
import { validateNickname } from "./validate";

export const BOOK_SIZE = 20;
export const MAX_BODY_BYTES = 2048;
export const SECRET_MIN = 32;
export const ADMIN_MIN = 24;
const DAY_MS = 86_400_000;

export type RankingDeps = {
  store: RankingStore;
  submitLimiter: KeyedLimiter;
  runLimiter: KeyedLimiter;
  secret: string | null;
  adminToken: string | null;
  now: () => number;
  newRunId: () => string;
};

export type RankingApi = {
  createRun(request: Request): Promise<Response>;
  listTop(): Promise<Response>;
  submit(request: Request): Promise<Response>;
  remove(request: Request, runId: string): Promise<Response>;
};

const NO_STORE = { "cache-control": "no-store" };
const BOOK_CACHE = { "cache-control": "public, s-maxage=30, stale-while-revalidate=30" };

const json = (status: number, body: unknown, headers: Record<string, string> = NO_STORE) =>
  Response.json(body, { status, headers });
const fail = (status: number, error: string) => json(status, { error });

// Spec 8.5 (D2): bilhete + apelido + as relíquias + o tempo medido no navegador.
const submissionSchema = z.object({
  runId: z.uuid(),
  issuedAt: z.number().int().nonnegative(),
  token: z.string().min(1).max(128),
  nickname: z.string().max(64),
  relics: z.array(z.string().max(32)).max(32),
  elapsedMs: z.number(),
});

/** Chave do limitador: HMAC do IP, nunca o IP em claro (D8). */
export function clientKey(secret: string, request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip")?.trim() || "local";
  return createHmac("sha256", secret).update(`ip:${ip}`).digest("base64url");
}

/** Lê o corpo por pedaços e aborta ao passar de 2 KB (em bytes), mesmo sem content-length. */
async function readJson(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES || !request.body) return undefined;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return undefined;
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    return undefined;
  }
}

/** Só o próprio site chama os POSTs: pedido "simples" de outro site não gasta a cota do visitante (M1). */
const isCrossSite = (request: Request) => {
  const site = request.headers.get("sec-fetch-site");
  return site !== null && site !== "same-origin";
};

/** Falha inesperada (loja fora do ar etc.): só o código, nunca stack nem mensagem (Review Focus 3). */
function guarded<Args extends unknown[]>(handler: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch {
      return fail(500, "server_error");
    }
  };
}

export function createRankingApi(deps: RankingDeps): RankingApi {
  const secret = deps.secret && deps.secret.length >= SECRET_MIN ? deps.secret : null;
  const adminToken = deps.adminToken && deps.adminToken.length >= ADMIN_MIN ? deps.adminToken : null;

  const api: RankingApi = {
    async createRun(request) {
      if (!secret) return fail(503, "unavailable");
      if (isCrossSite(request)) return fail(403, "forbidden");
      if (!(await deps.runLimiter.hit(clientKey(secret, request), deps.now()))) return fail(429, "rate_limited");
      const runId = deps.newRunId();
      const issuedAt = deps.now();
      return json(201, { runId, issuedAt, token: signRun(secret, runId, issuedAt) });
    },

    async listTop() {
      if (!secret) return fail(503, "unavailable"); // D11: sem API de verdade, nem o GET finge um livro vazio
      const entries = await deps.store.top(BOOK_SIZE);
      return json(
        200,
        { entries: entries.map(({ nickname, elapsedMs, createdAt }, index) => ({
          position: index + 1,
          nickname,
          elapsedMs,
          createdAt: createdAt - (createdAt % DAY_MS), // só o dia (UTC), sem ms: menos rastreável
        })) },
        BOOK_CACHE,
      );
    },

    // Ordem das checagens (D6): o limitador só conta envios que passaram em tudo.
    async submit(request) {
      if (!secret) return fail(503, "unavailable");
      if (isCrossSite(request)) return fail(403, "forbidden");
      if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return fail(400, "bad_request");
      const parsed = submissionSchema.safeParse(await readJson(request));
      if (!parsed.success) return fail(400, "bad_request");
      const body = parsed.data;
      const now = deps.now();
      if (!verifyRun(secret, body.runId, body.issuedAt, body.token)) return fail(400, "invalid_run");
      const check = checkSubmission({ relics: body.relics, elapsedMs: body.elapsedMs, issuedAt: body.issuedAt, now });
      if (!check.ok) return fail(400, check.error === "bad_time" ? "invalid_run" : check.error);
      const verdict = validateNickname(body.nickname);
      if (verdict !== "ok") return fail(400, verdict === "invalid" ? "invalid_nickname" : "blocked_nickname");
      if (!(await deps.submitLimiter.hit(clientKey(secret, request), now))) return fail(429, "rate_limited");
      const result = await deps.store.record({
        runId: body.runId,
        nickname: body.nickname.trim(),
        elapsedMs: body.elapsedMs,
        createdAt: now,
      });
      if (!result.ok) return fail(409, "duplicate");
      return json(201, { position: result.position });
    },

    async remove(request, runId) {
      if (!adminToken) return fail(404, "not_found");
      const header = request.headers.get("authorization") ?? "";
      const given = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
      if (!safeEqual(given, adminToken)) return fail(401, "unauthorized");
      return (await deps.store.remove(runId)) ? json(200, { removed: true }) : fail(404, "not_found");
    },
  };

  return {
    createRun: guarded(api.createRun),
    listTop: guarded(api.listTop),
    submit: guarded(api.submit),
    remove: guarded(api.remove),
  };
}
