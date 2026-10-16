import { beforeEach, describe, expect, it, vi } from "vitest";
import { RELIC_IDS } from "@/interaction/relics/catalog";
import { BOOK_SIZE, BOOK_MEMO_MS, MAX_BODY_BYTES, clientKey, createRankingApi, type RankingApi } from "@/lib/ranking/handlers";
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
    globalSubmitLimiter: createMemoryLimiter(1000, 3_600_000),
    globalRunLimiter: createMemoryLimiter(1000, 3_600_000),
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
    expect(list.headers.get("cache-control")).toBe("no-store"); // F7: a linha recém-gravada aparece na hora
    const { entries } = await list.json();
    expect(entries.map((e: { nickname: string }) => e.nickname)).toEqual(["rapido", "lento"]);
    expect(entries[0]).toEqual({ position: 1, nickname: "rapido", elapsedMs: 200_000, createdAt: clock - (clock % 86_400_000) });
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

describe("fix wave A (revisão de segurança)", () => {
  const del = (runId: string) =>
    new Request(`http://localhost/api/ranking/${runId}`, { method: "DELETE", headers: { authorization: `Bearer ${ADMIN}` } });

  it("I1: apagar não libera o runId — reenviar o mesmo corpo → 409 duplicate", async () => {
    const api = makeApi({ submitLimiter: createMemoryLimiter(10, 3_600_000) });
    const good = await submission(api);
    expect((await api.submit(post("/api/ranking", good))).status).toBe(201);
    expect((await api.remove(del(good.runId), good.runId)).status).toBe(200);
    const again = await api.submit(post("/api/ranking", good));
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: "duplicate" });
    expect((await (await api.listTop()).json()).entries).toEqual([]);
  });

  it("M1: sec-fetch-site diferente de same-origin → 403 forbidden nos dois POSTs", async () => {
    const api = makeApi();
    for (const site of ["cross-site", "same-site", "none"]) {
      const run = await api.createRun(post("/api/run", {}, { "sec-fetch-site": site }));
      expect(run.status).toBe(403);
      expect(run.headers.get("cache-control")).toBe("no-store");
      expect(await run.json()).toEqual({ error: "forbidden" });
      const sub = await api.submit(post("/api/ranking", await submission(api), { "sec-fetch-site": site }));
      expect(sub.status).toBe(403);
      expect(await sub.json()).toEqual({ error: "forbidden" });
    }
  });
  it("M1: same-origin ou sem o cabeçalho (curl) passa", async () => {
    const api = makeApi();
    expect((await api.createRun(post("/api/run", {}, { "sec-fetch-site": "same-origin" }))).status).toBe(201);
    const good = await submission(api);
    expect((await api.submit(post("/api/ranking", good, { "sec-fetch-site": "same-origin" }))).status).toBe(201);
  });
  it("M1: a recusa cross-site não gasta cota do limitador", async () => {
    const api = makeApi({ runLimiter: createMemoryLimiter(1, 3_600_000) });
    await api.createRun(post("/api/run", {}, { "sec-fetch-site": "cross-site" }));
    expect((await api.createRun(post("/api/run", {}))).status).toBe(201);
  });
  it("M1: POST /api/ranking exige content-type application/json → 400 bad_request", async () => {
    const api = makeApi();
    const good = await submission(api);
    for (const type of ["text/plain", "application/x-www-form-urlencoded", ""]) {
      const response = await api.submit(post("/api/ranking", good, { "content-type": type }));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "bad_request" });
    }
    expect((await api.submit(post("/api/ranking", good, { "content-type": "application/json; charset=utf-8" }))).status).toBe(201);
  });

  it("M2/D11: GET sem segredo → 503 unavailable, sem cache", async () => {
    const response = await makeApi({ secret: null }).listTop();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "unavailable" });
  });

  it("M4: createdAt público arredondado para o início do dia UTC; ordem segue o valor exato", async () => {
    const api = makeApi({ submitLimiter: createMemoryLimiter(10, 3_600_000) });
    const dayStart = clock - (clock % 86_400_000);
    clock = dayStart + 5_000;
    await api.submit(post("/api/ranking", await submission(api, { nickname: "primeiro" })));
    clock = dayStart + 7_777;
    await api.submit(post("/api/ranking", await submission(api, { nickname: "segundo" })));
    const { entries } = await (await api.listTop()).json();
    expect(entries.map((e: { nickname: string }) => e.nickname)).toEqual(["primeiro", "segundo"]);
    expect(entries.map((e: { createdAt: number }) => e.createdAt)).toEqual([dayStart, dayStart]);
  });

  const stream = (chunks: Uint8Array[], onPull?: () => void) => {
    let i = 0;
    return new ReadableStream<Uint8Array>({
      pull(controller) {
        onPull?.();
        if (i < chunks.length) controller.enqueue(chunks[i++]);
        else controller.close();
      },
    });
  };
  const streamed = (body: ReadableStream<Uint8Array>) =>
    new Request("http://localhost/api/ranking", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      duplex: "half",
    } as RequestInit);

  it("#9: corpo em pedaços sem content-length acima de 2 KB → 400 e para de ler", async () => {
    const api = makeApi();
    const chunk = new TextEncoder().encode("x".repeat(1024));
    let pulls = 0;
    const response = await api.submit(streamed(stream(Array(50).fill(chunk), () => (pulls += 1))));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "bad_request" });
    expect(pulls).toBeLessThan(10); // não consumiu os 50 KB
  });
  it("#9: pedaços multibyte contam em bytes", async () => {
    const api = makeApi();
    const chunk = new TextEncoder().encode("é".repeat(600)); // 1200 bytes cada
    const response = await api.submit(streamed(stream([chunk, chunk])));
    expect(response.status).toBe(400);
  });
  it("#9: corpo em pedaços dentro do limite ainda é aceito", async () => {
    const api = makeApi();
    const good = JSON.stringify(await submission(api));
    const bytes = new TextEncoder().encode(good);
    const response = await api.submit(streamed(stream([bytes.slice(0, 50), bytes.slice(50)])));
    expect(response.status).toBe(201);
  });
});

describe("tetos globais (todos os IPs)", () => {
  const from = (ip: string) => ({ "x-forwarded-for": ip });

  it("bilhetes: estourou o teto global → 429 mesmo para um IP novo", async () => {
    const api = makeApi({ globalRunLimiter: createMemoryLimiter(2, 3_600_000) });
    expect((await api.createRun(post("/api/run", {}, from("198.51.100.1")))).status).toBe(201);
    expect((await api.createRun(post("/api/run", {}, from("198.51.100.2")))).status).toBe(201);
    const blocked = await api.createRun(post("/api/run", {}, from("198.51.100.3")));
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: "rate_limited" });
  });

  it("envios: estourou o teto global → 429 mesmo para um IP novo", async () => {
    const api = makeApi({ globalSubmitLimiter: createMemoryLimiter(1, 3_600_000) });
    const first = await submission(api);
    expect((await api.submit(post("/api/ranking", first, from("198.51.100.1")))).status).toBe(201);
    const second = await submission(api, { nickname: "outra" });
    expect((await api.submit(post("/api/ranking", second, from("198.51.100.2")))).status).toBe(429);
  });

  it("IP já bloqueado não gasta o teto global", async () => {
    const global = createMemoryLimiter(100, 3_600_000);
    const api = makeApi({ submitLimiter: createMemoryLimiter(1, 3_600_000), globalSubmitLimiter: global });
    expect((await api.submit(post("/api/ranking", await submission(api)))).status).toBe(201);
    for (let i = 0; i < 5; i += 1) {
      expect((await api.submit(post("/api/ranking", await submission(api, { nickname: `n${i}x` })))).status).toBe(429);
    }
    let allowed = 0;
    while (await global.hit("global", clock)) allowed += 1;
    expect(allowed).toBe(99); // só o 1º envio consumiu o teto
  });
});

describe("GET /api/ranking/moderation (Fase 7)", () => {
  const get = (token?: string) =>
    new Request("http://localhost/api/ranking/moderation", { headers: token ? { authorization: `Bearer ${token}` } : {} });

  it("sem ADMIN_TOKEN → 404; sem Bearer ou errado → 401", async () => {
    expect((await makeApi({ adminToken: null }).listForModeration(get(ADMIN))).status).toBe(404);
    const api = makeApi();
    expect((await api.listForModeration(get())).status).toBe(401);
    expect((await api.listForModeration(get("errado"))).status).toBe(401);
  });

  it("com Bearer lista o top com runId e createdAt exato, sem cache", async () => {
    const api = makeApi();
    const body = await submission(api, { nickname: "lain" });
    await api.submit(post("/api/ranking", body));
    const response = await api.listForModeration(get(ADMIN));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).entries).toEqual([
      { position: 1, runId: body.runId, nickname: "lain", elapsedMs: 300_000, createdAt: clock },
    ]);
  });

  it("o GET público nunca expõe o runId", async () => {
    const api = makeApi();
    await api.submit(post("/api/ranking", await submission(api)));
    expect(JSON.stringify(await (await api.listTop()).json())).not.toMatch(/runId|[0-9a-f]{8}-[0-9a-f]{4}/);
  });
});

describe("log de falha (Fase 7)", () => {
  it("registra só o nome do handler e do erro: nada de mensagem, stack, IP ou segredo", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const store = createMemoryStore();
    store.top = async () => {
      throw new TypeError("senha=hunter2 203.0.113.7");
    };
    await makeApi({ store }).listTop();
    expect(spy).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).toContain("listTop");
    expect(logged).toContain("TypeError");
    expect(logged).not.toMatch(/hunter2|203\.0\.113\.7|stack/);
    spy.mockRestore();
  });
});

describe("memo do top 20 (custo no Redis)", () => {
  const countingStore = () => {
    const store = createMemoryStore();
    let reads = 0;
    const top = store.top.bind(store);
    store.top = async (limit) => ((reads += 1), top(limit));
    return { store, reads: () => reads };
  };

  it("GETs seguidos dentro da janela leem a loja uma vez; depois da janela, de novo", async () => {
    const { store, reads } = countingStore();
    const api = makeApi({ store });
    await api.listTop();
    await api.listTop();
    expect(reads()).toBe(1);
    clock += BOOK_MEMO_MS + 1;
    await api.listTop();
    expect(reads()).toBe(2);
  });

  it("gravar e remover pela própria instância invalidam o memo (a linha aparece na hora)", async () => {
    const { store } = countingStore();
    const api = makeApi({ store });
    expect((await (await api.listTop()).json()).entries).toEqual([]);
    const body = await submission(api, { nickname: "lain" });
    await api.submit(post("/api/ranking", body));
    expect((await (await api.listTop()).json()).entries).toHaveLength(1);
    await api.remove(new Request("http://localhost/x", { method: "DELETE", headers: { authorization: `Bearer ${ADMIN}` } }), body.runId);
    expect((await (await api.listTop()).json()).entries).toEqual([]);
  });

  it("erro da loja não é guardado no memo", async () => {
    const store = createMemoryStore();
    let fail = true;
    const top = store.top.bind(store);
    store.top = async (limit) => {
      if (fail) throw new Error("fora");
      return top(limit);
    };
    const api = makeApi({ store });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await api.listTop()).status).toBe(500);
    fail = false;
    expect((await api.listTop()).status).toBe(200);
  });

  it("o memo é separado por resposta: a moderação sempre lê a loja", async () => {
    const { store, reads } = countingStore();
    const api = makeApi({ store });
    await api.listTop();
    await api.listForModeration(new Request("http://localhost/m", { headers: { authorization: `Bearer ${ADMIN}` } }));
    expect(reads()).toBe(2);
  });
});

describe("clientKey (IPv6 reduzido a /64)", () => {
  const key = (ip: string) => clientKey(SECRET, new Request("http://localhost/", { headers: { "x-forwarded-for": ip } }));
  it("endereços do mesmo /64 dão a mesma chave; /64 diferentes, chaves diferentes", () => {
    expect(key("2001:db8:1:2:aaaa::1")).toBe(key("2001:db8:1:2:bbbb:cccc:dddd:eeee"));
    expect(key("2001:db8:1:2::1")).not.toBe(key("2001:db8:1:3::1"));
  });
  it("forma abreviada e expandida são o mesmo endereço", () => {
    expect(key("2001:db8::1")).toBe(key("2001:0db8:0000:0000:0000:0000:0000:0001"));
  });
  it("IPv4 e IPv4 mapeado em IPv6 dão a mesma chave; IPv4 distintos, chaves distintas", () => {
    expect(key("203.0.113.7")).toBe(key("::ffff:203.0.113.7"));
    expect(key("203.0.113.7")).not.toBe(key("203.0.113.8"));
  });
  it("lixo no cabeçalho não quebra (vira a chave do texto)", () => {
    expect(() => key("não-é-ip")).not.toThrow();
  });
});
