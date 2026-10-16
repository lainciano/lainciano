import { describe, expect, it } from "vitest";
import { SCRIPTS, createUpstashStore, type RankingRedis } from "@/lib/ranking/upstashStore";
import type { RankingEntry } from "@/lib/ranking/store";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const entry = (n: number, elapsedMs: number, createdAt: number, nickname = `nick${n}`): RankingEntry => ({
  runId: id(n),
  nickname,
  elapsedMs,
  createdAt,
});

/** Redis falso: interpreta os scripts por identidade (a semântica real roda no teste de integração). */
function fakeRedis() {
  const zset = new Map<string, number>();
  const strings = new Map<string, string>();
  const calls: { op: string; args: unknown[] }[] = [];
  const ordered = () => [...zset.entries()].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1));
  const redis: RankingRedis = {
    async eval(script, keys, args) {
      calls.push({ op: "eval", args: [script === SCRIPTS.record ? "record" : "remove", keys, args] });
      if (script === SCRIPTS.record) {
        const [, gate, holder] = keys;
        const [member, elapsed] = args.map(String);
        if (strings.has(gate)) return -1;
        zset.set(member, Number(elapsed));
        strings.set(holder, member);
        strings.set(gate, "1");
        return ordered().findIndex(([m]) => m === member) + 1;
      }
      if (script === SCRIPTS.remove) {
        const [, holder] = keys;
        const member = strings.get(holder);
        if (!member) return 0;
        zset.delete(member);
        strings.delete(holder);
        return 1;
      }
      throw new Error("script desconhecido");
    },
    async zrange(key, start, stop, options) {
      calls.push({ op: "zrange", args: [key, start, stop, options] });
      const slice = ordered().slice(start, stop + 1);
      return slice.flatMap(([member, score]) => [member, String(score)]);
    },
  };
  return { redis, calls, zset, strings };
}

describe("createUpstashStore", () => {
  it("grava e devolve a posição", async () => {
    const store = createUpstashStore(fakeRedis().redis);
    expect(await store.record(entry(1, 400, 1))).toEqual({ ok: true, position: 1 });
    expect(await store.record(entry(2, 200, 2))).toEqual({ ok: true, position: 1 });
    expect(await store.record(entry(3, 300, 3))).toEqual({ ok: true, position: 2 });
  });

  it("o membro carrega createdAt (13 dígitos), runId e apelido; empate de tempo desempata pelo envio mais antigo", async () => {
    const fake = fakeRedis();
    const store = createUpstashStore(fake.redis);
    await store.record(entry(1, 300, 1_700_000_000_000, "ana"));
    await store.record(entry(2, 300, 999_999_999_999, "bia")); // 12 dígitos, mas enviado antes
    expect([...fake.zset.keys()]).toEqual([`1700000000000:${id(1)}:ana`, `0999999999999:${id(2)}:bia`]);
    expect((await store.top(20)).map((e) => e.nickname)).toEqual(["bia", "ana"]); // bia enviou antes
  });

  it("cada run grava uma vez, mesmo com outro apelido", async () => {
    const store = createUpstashStore(fakeRedis().redis);
    await store.record(entry(1, 400, 1, "lain"));
    expect(await store.record(entry(1, 100, 2, "outro"))).toEqual({ ok: false, error: "duplicate" });
    expect((await store.top(20)).map((e) => e.nickname)).toEqual(["lain"]);
  });

  it("top é UM comando (ZRANGE com scores), na ordem, e converte os campos", async () => {
    const fake = fakeRedis();
    const store = createUpstashStore(fake.redis);
    await store.record(entry(1, 500, 10, "1234"));
    await store.record(entry(2, 300, 20, "ana"));
    fake.calls.length = 0;
    expect(await store.top(20)).toEqual([
      { runId: id(2), nickname: "ana", elapsedMs: 300, createdAt: 20 },
      { runId: id(1), nickname: "1234", elapsedMs: 500, createdAt: 10 },
    ]);
    expect(fake.calls).toEqual([{ op: "zrange", args: ["ranking:v1", 0, 19, { withScores: true }] }]);
  });

  it("top com limite inválido não consulta o Redis (ZRANGE 0 -1 devolveria tudo)", async () => {
    const fake = fakeRedis();
    const store = createUpstashStore(fake.redis);
    for (const bad of [0, -1, 1.5, Number.NaN]) expect(await store.top(bad)).toEqual([]);
    expect(fake.calls).toHaveLength(0);
  });

  it("membro malformado no ZSET é ignorado, não quebra o livro", async () => {
    const fake = fakeRedis();
    fake.zset.set("lixo", 100);
    const store = createUpstashStore(fake.redis);
    await store.record(entry(1, 500, 10, "ana"));
    expect((await store.top(20)).map((e) => e.nickname)).toEqual(["ana"]);
  });

  it("remove apaga uma vez, tira a linha do ZSET e mantém a lápide (gate)", async () => {
    const fake = fakeRedis();
    const store = createUpstashStore(fake.redis);
    await store.record(entry(1, 400, 1));
    expect(await store.remove(id(1))).toBe(true);
    expect(fake.zset.size).toBe(0); // sem membro órfão
    expect(await store.remove(id(1))).toBe(false);
    expect(await store.top(20)).toEqual([]);
    expect(await store.record(entry(1, 400, 2))).toEqual({ ok: false, error: "duplicate" });
    expect(fake.strings.has(`ranking:v1:gate:${id(1)}`)).toBe(true);
  });

  it("runId que não é UUID nunca chega ao Redis", async () => {
    const fake = fakeRedis();
    const store = createUpstashStore(fake.redis);
    expect(await store.remove("a:b")).toBe(false);
    expect(await store.record({ ...entry(1, 400, 1), runId: "ranking:v1" })).toEqual({ ok: false, error: "duplicate" });
    expect(fake.calls).toHaveLength(0);
  });

  it("apelido fora do formato nunca vira membro (o ':' separa os campos)", async () => {
    const fake = fakeRedis();
    const store = createUpstashStore(fake.redis);
    await expect(store.record(entry(1, 400, 1, "a:b"))).rejects.toThrow();
    expect(fake.calls).toHaveLength(0);
  });

  it("resposta estranha do Redis vira erro, não sucesso com posição inválida", async () => {
    const bad = (value: unknown): RankingRedis => ({ eval: async () => value, zrange: async () => [] });
    for (const value of [null, undefined, "Aborted", 0, Number.NaN, 1.5]) {
      await expect(createUpstashStore(bad(value)).record(entry(1, 400, 1))).rejects.toThrow();
    }
  });

  it("monta as chaves com o prefixo", async () => {
    const fake = fakeRedis();
    const store = createUpstashStore(fake.redis, "t:x");
    await store.record(entry(1, 400, 5));
    expect(fake.calls[0].args[1]).toEqual(["t:x", `t:x:gate:${id(1)}`, `t:x:${id(1)}`]);
    await store.top(20);
    expect(fake.calls[1].args[0]).toBe("t:x");
  });
});
