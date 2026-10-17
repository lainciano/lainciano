/** Cliente do livro (spec 8.5). Toda falha vira um valor conhecido: o jogo nunca quebra por causa da API. */
export type Ticket = { runId: string; issuedAt: number; token: string };
export type BookEntry = { position: number; nickname: string; elapsedMs: number; createdAt: number };
export type SubmitError =
  | "invalid_nickname"
  | "blocked_nickname"
  | "rate_limited"
  | "duplicate"
  | "invalid_run"
  | "too_fast"
  | "incomplete"
  | "unavailable";
export type SubmitBody = Ticket & { nickname: string; relics: readonly string[]; elapsedMs: number };

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
const defaultFetch: Fetcher = (input, init) => fetch(input, init);

const KNOWN: readonly SubmitError[] = ["invalid_nickname", "blocked_nickname", "rate_limited", "duplicate", "invalid_run", "too_fast", "incomplete"];

export function submitErrorFrom(code: unknown): SubmitError {
  if (code === "bad_request") return "invalid_run";
  return KNOWN.includes(code as SubmitError) ? (code as SubmitError) : "unavailable";
}

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

async function readBody(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const body = (await response.json()) as unknown;
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function requestTicket(fetcher: Fetcher = defaultFetch): Promise<Ticket | null> {
  try {
    const response = await fetcher("/api/run", { method: "POST" });
    const body = await readBody(response);
    if (response.status !== 201 || !body) return null;
    const { runId, issuedAt, token } = body;
    return typeof runId === "string" && isNumber(issuedAt) && typeof token === "string" ? { runId, issuedAt, token } : null;
  } catch {
    return null;
  }
}

export async function submitRun(
  body: SubmitBody,
  fetcher: Fetcher = defaultFetch,
): Promise<{ ok: true; position: number } | { ok: false; error: SubmitError }> {
  try {
    const response = await fetcher("/api/ranking", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const parsed = await readBody(response);
    if (response.status === 201 && parsed && isNumber(parsed.position)) return { ok: true, position: parsed.position };
    return { ok: false, error: submitErrorFrom(parsed?.error) };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}

const isEntry = (value: unknown): value is BookEntry => {
  const entry = value as Record<string, unknown> | null;
  return Boolean(entry) && isNumber(entry!.position) && typeof entry!.nickname === "string" && isNumber(entry!.elapsedMs) && isNumber(entry!.createdAt);
};

export async function fetchBook(fetcher: Fetcher = defaultFetch): Promise<BookEntry[] | null> {
  try {
    const response = await fetcher("/api/ranking", { cache: "no-store" });
    const body = await readBody(response);
    if (!response.ok || !body || !Array.isArray(body.entries) || !body.entries.every(isEntry)) return null;
    return body.entries;
  } catch {
    return null;
  }
}
