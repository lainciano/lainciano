import { createHmac } from "node:crypto";
import { isIPv4, isIPv6 } from "node:net";
import { z } from "zod";
import { GLOBAL_KEY, type KeyedLimiter } from "./limiter";
import { checkSubmission } from "./rules";
import type { RankingStore } from "./store";
import { safeEqual, signRun, verifyRun } from "./token";
import { validateNickname } from "./validate";

export const BOOK_SIZE = 20;
export const MAX_BODY_BYTES = 2048;
/** Janela do memo do top 20 por instância: protege o Redis de GETs em laço (custo por comando). */
export const BOOK_MEMO_MS = 3000;
export const SECRET_MIN = 32;
export const ADMIN_MIN = 24;
const DAY_MS = 86_400_000;

export type RankingDeps = {
  store: RankingStore;
  submitLimiter: KeyedLimiter;
  runLimiter: KeyedLimiter;
  /** Tetos de todos os IPs juntos (chave GLOBAL_KEY). Só contam depois do limite do IP. */
  globalSubmitLimiter: KeyedLimiter;
  globalRunLimiter: KeyedLimiter;
  secret: string | null;
  adminToken: string | null;
  now: () => number;
  newRunId: () => string;
};

export type RankingApi = {
  createRun(request: Request): Promise<Response>;
  listTop(): Promise<Response>;
  listForModeration(request: Request): Promise<Response>;
  submit(request: Request): Promise<Response>;
  remove(request: Request, runId: string): Promise<Response>;
};

const NO_STORE = { "cache-control": "no-store" };

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

/** IPv6 → os 4 primeiros grupos (/64, o que um único host/assinante controla); IPv4 mapeado vira IPv4. */
function normalizeIp(raw: string): string {
  const ip = raw.split("%")[0];
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return mapped[1];
  if (isIPv4(ip) || !isIPv6(ip)) return ip;
  const tail = ip.replace(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/, "0:0"); // cauda IPv4 conta como 2 grupos
  const [head, rest] = tail.split("::");
  const left = head ? head.split(":") : [];
  const right = rest ? rest.split(":") : [];
  const groups = rest === undefined ? left : [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right];
  return `v6:${groups.slice(0, 4).map((group) => group.toLowerCase().padStart(4, "0")).join(":")}`;
}

/** Chave do limitador: HMAC do IP, nunca o IP em claro (D8). */
// x-forwarded-for só é confiável atrás da Vercel (ela sobrescreve o cabeçalho); fora dela o cliente escolhe o IP.
export function clientKey(secret: string, request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = normalizeIp(forwarded || request.headers.get("x-real-ip")?.trim() || "local");
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

/**
 * Falha inesperada (loja fora do ar etc.): a resposta leva só o código e o log só o nome do handler e do erro —
 * nunca mensagem, stack, IP nem segredo (Review Focus 3).
 */
function guarded<Args extends unknown[]>(name: string, handler: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      console.error("[ranking] falha", { handler: name, error: error instanceof Error ? error.name : "unknown" });
      return fail(500, "server_error");
    }
  };
}

export function createRankingApi(deps: RankingDeps): RankingApi {
  const secret = deps.secret && deps.secret.length >= SECRET_MIN ? deps.secret : null;
  const adminToken = deps.adminToken && deps.adminToken.length >= ADMIN_MIN ? deps.adminToken : null;

  const isAdmin = (request: Request) => {
    const header = request.headers.get("authorization") ?? "";
    const given = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
    return adminToken !== null && safeEqual(given, adminToken);
  };

  // Memo do top 20 por instância: invalidado pelas gravações/remoções desta instância; em outras instâncias a linha
  // nova pode levar até BOOK_MEMO_MS para aparecer. Erro da loja nunca é guardado.
  let memo: { at: number; entries: Awaited<ReturnType<RankingStore["top"]>> } | null = null;
  const topCached = async () => {
    const now = deps.now();
    if (memo && now >= memo.at && now - memo.at < BOOK_MEMO_MS) return memo.entries;
    const entries = await deps.store.top(BOOK_SIZE);
    memo = { at: now, entries };
    return entries;
  };

  const api: RankingApi = {
    async createRun(request) {
      if (!secret) return fail(503, "unavailable");
      if (isCrossSite(request)) return fail(403, "forbidden");
      if (!(await deps.runLimiter.hit(clientKey(secret, request), deps.now()))) return fail(429, "rate_limited");
      if (!(await deps.globalRunLimiter.hit(GLOBAL_KEY, deps.now()))) return fail(429, "rate_limited");
      const runId = deps.newRunId();
      const issuedAt = deps.now();
      return json(201, { runId, issuedAt, token: signRun(secret, runId, issuedAt) });
    },

    async listTop() {
      if (!secret) return fail(503, "unavailable"); // D11: sem API de verdade, nem o GET finge um livro vazio
      const entries = await topCached();
      return json(
        200,
        { entries: entries.map(({ nickname, elapsedMs, createdAt }, index) => ({
          position: index + 1,
          nickname,
          elapsedMs,
          createdAt: createdAt - (createdAt % DAY_MS), // só o dia (UTC), sem ms: menos rastreável
        })) },
      );
    },

    // Moderação: mesmo Bearer do DELETE; é o único lugar que mostra o runId (para quem precisa remover uma linha).
    async listForModeration(request) {
      if (!adminToken) return fail(404, "not_found");
      if (!isAdmin(request)) return fail(401, "unauthorized");
      const entries = await deps.store.top(BOOK_SIZE);
      return json(200, {
        entries: entries.map(({ runId, nickname, elapsedMs, createdAt }, index) => ({
          position: index + 1,
          runId,
          nickname,
          elapsedMs,
          createdAt,
        })),
      });
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
      if (!(await deps.globalSubmitLimiter.hit(GLOBAL_KEY, now))) return fail(429, "rate_limited");
      const result = await deps.store.record({
        runId: body.runId,
        nickname: body.nickname.trim(),
        elapsedMs: body.elapsedMs,
        createdAt: now,
      });
      if (!result.ok) return fail(409, "duplicate");
      memo = null;
      return json(201, { position: result.position });
    },

    async remove(request, runId) {
      if (!adminToken) return fail(404, "not_found");
      if (!isAdmin(request)) return fail(401, "unauthorized");
      const removed = await deps.store.remove(runId);
      memo = null;
      return removed ? json(200, { removed: true }) : fail(404, "not_found");
    },
  };

  return {
    createRun: guarded("createRun", api.createRun),
    listTop: guarded("listTop", api.listTop),
    listForModeration: guarded("listForModeration", api.listForModeration),
    submit: guarded("submit", api.submit),
    remove: guarded("remove", api.remove),
  };
}
