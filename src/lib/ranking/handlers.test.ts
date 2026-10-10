import { beforeEach, describe, expect, it } from "vitest";
import { RELIC_IDS } from "@/interaction/relics/catalog";
import { BOOK_SIZE, MAX_BODY_BYTES, createRankingApi, type RankingApi } from "@/lib/ranking/handlers";
import { createMemoryLimiter } from "@/lib/ranking/limiter";
import { createMemoryStore } from "@/lib/ranking/store";

const SECRET = "segredo-de-teste-com-mais-de-32-caracteres!!";
const ADMIN = "token-de-admin-de-teste-24+";
let clock = 1_800_000_000_000;
let ids = 0;

function makeApi(overrides: Partial<Parameters<typeof createRankingApi>[0]> = {}): RankingApi {
  return createRankingApi({
    store: createMemoryStore(),
    submitLimiter: createMemoryLimiter(3, 3_600_000),
    runLimiter: createMemoryLimiter(20, 3_600_000),
    secret: SECRET,
    adminToken: ADMIN,
    now: () => clock,
    newRunId: () => `00000000-0000-4000-8000-${String((ids += 1)).padStart(12, "0")}`,
    ...overrides,
  });
}

const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

async function ticket(api: RankingApi) {
  const response = await api.createRun(post("/api/run", {}));
  return (await response.json()) as { runId: string; issuedAt: number; token: string };
}

async function submission(api: RankingApi, extra: Record<string, unknown> = {}) {
  return { ...(await ticket(api)), nickname: "lain", relics: [...RELIC_IDS], elapsedMs: 300_000, ...extra };
}

beforeEach(() => {
  clock = 1_800_000_000_000;
  ids = 0;
});

describe("POST /api/run", () => {
  it("emite bilhete assinado, sem cache", async () => {
    const response = await makeApi().createRun(post("/api/run", {}));
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toMatchObject({ runId: expect.stringMatching(/^[0-9a-f-]{36}$/), issuedAt: clock, token: expect.any(String) });
  });
  it("sem segredo (ou curto): 503 unavailable", async () => {
    for (const secret of [null, "curto"]) {
      const response = await makeApi({ secret }).createRun(post("/api/run", {}));
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "unavailable" });
    }
  });
  it("D7: 21º bilhete na hora do mesmo IP → 429", async () => {
    const api = makeApi();
    for (let i = 0; i < 20; i += 1) expect((await api.createRun(post("/api/run", {}))).status).toBe(201);
    expect((await api.createRun(post("/api/run", {}))).status).toBe(429);
    expect((await api.createRun(post("/api/run", {}, { "x-forwarded-for": "198.51.100.1" }))).status).toBe(201);
  });
});

describe("POST /api/ranking — caminho feliz e livro", () => {
  it("grava, devolve a posição e o GET lista sem runId", async () => {
    const api = makeApi();
    const first = await api.submit(post("/api/ranking", await submission(api, { elapsedMs: 400_000, nickname: "lento" })));
    expect(first.status).toBe(201);
    expect(await first.json()).toEqual({ position: 1 });
    clock += 1000;
    const second = await api.submit(post("/api/ranking", await submission(api, { elapsedMs: 200_000, nickname: "rapido" })));
    expect(await second.json()).toEqual({ position: 1 });

    const list = await api.listTop();
    expect(list.status).toBe(200);
    expect(list.headers.get("cache-control")).toBe("public, s-maxage=30, stale-while-revalidate=30");
    const { entries } = await list.json();
    expect(entries.map((e: { nickname: string }) => e.nickname)).toEqual(["rapido", "lento"]);
    expect(entries[0]).toEqual({ position: 1, nickname: "rapido", elapsedMs: 200_000, createdAt: clock });
    expect(JSON.stringify(entries)).not.toContain("runId");
  });
  it("apelido gravado sem os espaços das pontas", async () => {
    const api = makeApi();
    await api.submit(post("/api/ranking", await submission(api, { nickname: "  lain  " })));
    const { entries } = await (await api.listTop()).json();
    expect(entries[0].nickname).toBe("lain");
  });
  it(`livro mostra no máximo ${BOOK_SIZE}`, async () => {
    const api = makeApi({ submitLimiter: createMemoryLimiter(100, 3_600_000), runLimiter: createMemoryLimiter(100, 3_600_000) });
    for (let i = 0; i < 25; i += 1) await api.submit(post("/api/ranking", await submission(api, { nickname: `run${i}` })));
    const { entries } = await (await api.listTop()).json();
    expect(entries).toHaveLength(BOOK_SIZE);
  });
});

describe("POST /api/ranking — recusas (Review Focus 1–3)", () => {
  const expectError = async (response: Response, status: number, error: string) => {
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error });
  };

  it("token, runId ou issuedAt adulterados → invalid_run", async () => {
    const api = makeApi();
    const good = await submission(api);
    await expectError(await api.submit(post("/api/ranking", { ...good, token: "x".repeat(43) })), 400, "invalid_run");
    await expectError(await api.submit(post("/api/ranking", { ...good, issuedAt: good.issuedAt - 1 })), 400, "invalid_run");
    await expectError(
      await api.submit(post("/api/ranking", { ...good, runId: "00000000-0000-4000-8000-999999999999" })),
      400,
      "invalid_run",
    );
  });
  it("bilhete do futuro → invalid_run", async () => {
    const api = makeApi();
    const good = await submission(api);
    clock -= 120_000; // o servidor "volta no tempo": o bilhete parece emitido no futuro
    await expectError(await api.submit(post("/api/ranking", good)), 400, "invalid_run");
  });
  it("relíquias incompletas → incomplete; menos de 120 s → too_fast", async () => {
    const api = makeApi();
    await expectError(await api.submit(post("/api/ranking", await submission(api, { relics: RELIC_IDS.slice(1) }))), 400, "incomplete");
    await expectError(await api.submit(post("/api/ranking", await submission(api, { elapsedMs: 119_999 }))), 400, "too_fast");
  });
  it("apelido inválido ou bloqueado, e isso não gasta o limite", async () => {
    const api = makeApi();
    await expectError(await api.submit(post("/api/ranking", await submission(api, { nickname: "<b>x</b>" }))), 400, "invalid_nickname");
    await expectError(await api.submit(post("/api/ranking", await submission(api, { nickname: "c4r4lh0" }))), 400, "blocked_nickname");
    for (let i = 0; i < 3; i += 1) {
      expect((await api.submit(post("/api/ranking", await submission(api, { nickname: `ok${i}` })))).status).toBe(201);
    }
  });
  it("4º envio válido na hora do mesmo IP → 429 rate_limited", async () => {
    const api = makeApi();
    for (let i = 0; i < 3; i += 1) await api.submit(post("/api/ranking", await submission(api, { nickname: `ok${i}` })));
    await expectError(await api.submit(post("/api/ranking", await submission(api))), 429, "rate_limited");
  });
  it("a mesma run duas vezes → 409 duplicate", async () => {
    const api = makeApi();
    const good = await submission(api);
    expect((await api.submit(post("/api/ranking", good))).status).toBe(201);
    await expectError(await api.submit(post("/api/ranking", { ...good, nickname: "outro" })), 409, "duplicate");
  });
  it("corpo grande, JSON quebrado ou tipos errados → 400 bad_request", async () => {
    const api = makeApi();
    await expectError(await api.submit(post("/api/ranking", "x".repeat(MAX_BODY_BYTES + 1))), 400, "bad_request");
    await expectError(await api.submit(post("/api/ranking", "{nope")), 400, "bad_request");
    await expectError(await api.submit(post("/api/ranking", { ...(await submission(api)), elapsedMs: "300000" })), 400, "bad_request");
    await expectError(await api.submit(post("/api/ranking", [])), 400, "bad_request");
  });
  it("sem segredo → 503 unavailable", async () => {
    await expectError(await makeApi({ secret: null }).submit(post("/api/ranking", {})), 503, "unavailable");
  });
});

describe("DELETE /api/ranking/[runId] (D10)", () => {
  const del = (runId: string, auth?: string) =>
    new Request(`http://localhost/api/ranking/${runId}`, {
      method: "DELETE",
      headers: auth ? { authorization: auth } : {},
    });

  it("com o token de admin apaga; de novo → 404", async () => {
    const api = makeApi();
    const good = await submission(api);
    await api.submit(post("/api/ranking", good));
    const removed = await api.remove(del(good.runId, `Bearer ${ADMIN}`), good.runId);
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({ removed: true });
    expect((await api.remove(del(good.runId, `Bearer ${ADMIN}`), good.runId)).status).toBe(404);
    expect((await (await api.listTop()).json()).entries).toEqual([]);
  });
  it("sem token, token errado ou formato errado → 401 e nada some", async () => {
    const api = makeApi();
    const good = await submission(api);
    await api.submit(post("/api/ranking", good));
    for (const auth of [undefined, "Bearer errado", ADMIN, `Basic ${ADMIN}`]) {
      expect((await api.remove(del(good.runId, auth), good.runId)).status).toBe(401);
    }
    expect((await (await api.listTop()).json()).entries).toHaveLength(1);
  });
  it("ADMIN_TOKEN ausente ou curto → 404 (a rota não existe)", async () => {
    for (const adminToken of [null, "curto"]) {
      expect((await makeApi({ adminToken }).remove(del("x", "Bearer x"), "x")).status).toBe(404);
    }
  });
});

describe("endurecimento extra", () => {
  it("corpo com caracteres multibyte acima de 2 KB (em bytes) → 400 bad_request", async () => {
    const api = makeApi();
    const body = JSON.stringify({ nickname: "é".repeat(MAX_BODY_BYTES / 2 + 1) }); // < 2048 caracteres, > 2048 bytes
    expect(body.length).toBeLessThan(MAX_BODY_BYTES + 20);
    const response = await api.submit(post("/api/ranking", body));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "bad_request" });
  });
  it("loja que lança → 500 server_error sem vazar a mensagem", async () => {
    const store = createMemoryStore();
    store.top = async () => {
      throw new Error("segredo-interno-do-redis");
    };
    const response = await makeApi({ store }).listTop();
    expect(response.status).toBe(500);
    expect(await response.text()).toBe('{"error":"server_error"}');
  });
});
