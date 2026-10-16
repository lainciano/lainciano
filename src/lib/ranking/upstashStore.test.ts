import { describe, expect, it } from "vitest";
import { SCRIPTS, createUpstashStore, type LuaRedis } from "@/lib/ranking/upstashStore";
import type { RankingEntry } from "@/lib/ranking/store";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const entry = (n: number, elapsedMs: number, createdAt: number, nickname = `nick${n}`): RankingEntry => ({
  runId: id(n),
  nickname,
  elapsedMs,
  createdAt,
});

/** Redis falso: interpreta os três scripts por identidade (a semântica real roda no teste de integração). */
function fakeRedis() {
  const zset = new Map<string, number>();
  const gates = new Set<string>();
  const hashes = new Map<string, Record<string, string>>();
  const calls: { script: string; keys: string[]; args: (string | number)[] }[] = [];
  const ordered = () =>
    [...zset.entries()].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1)).map(([member]) => member);
  const redis: LuaRedis = {
    async eval(script, keys, args) {
      calls.push({ script, keys, args });
      if (script === SCRIPTS.record) {
        const [z, gate, hash] = keys;
        const [member, elapsed, nickname, createdAt] = args.map(String);
        if (gates.has(gate)) return -1;
        gates.add(gate);
        zset.set(member, Number(elapsed));
        hashes.set(hash, { nickname, elapsedMs: elapsed, createdAt });
        void z;
        return ordered().indexOf(member) + 1;
      }
      if (script === SCRIPTS.top) {
        const [limit, prefix] = args;
        const out: string[] = [];
        for (const member of ordered().slice(0, Number(limit))) {
          const runId = member.slice(14);
          const h = hashes.get(`${prefix}${runId}`);
          if (h) out.push(runId, h.nickname, h.elapsedMs, h.createdAt);
        }
        return out;
      }
      if (script === SCRIPTS.remove) {
        const [, hash] = keys;
        const h = hashes.get(hash);
        if (!h) return 0;
        zset.delete(`${h.createdAt.padStart(13, "0")}:${String(args[0])}`);
        hashes.delete(hash);
        return 1;
      }
      throw new Error("script desconhecido");
    },
  };
  return { redis, calls, zset, gates, hashes };
}

describe("createUpstashStore", () => {
  it("grava e devolve a posição", async () => {
    const store = createUpstashStore(fakeRedis().redis);
    expect(await store.record(entry(1, 400, 1))).toEqual({ ok: true, position: 1 });
    expect(await store.record(entry(2, 200, 2))).toEqual({ ok: true, position: 1 });
    expect(await store.record(entry(3, 300, 3))).toEqual({ ok: true, position: 2 });
  });

  it("empate de tempo: o envio mais antigo vem antes (createdAt com 13 dígitos no membro)", async () => {
    const fake = fakeRedis();
    const store = createUpstashStore(fake.redis);
    await store.record(entry(1, 300, 1_700_000_000_000));
    await store.record(entry(2, 300, 999_999_999_999)); // 12 dígitos, mas enviado antes
    expect([...fake.zset.keys()]).toEqual([`1700000000000:${id(1)}`, `0999999999999:${id(2)}`]);
  });

  it("cada run grava uma vez, mesmo com outro apelido", async () => {
    const store = createUpstashStore(fakeRedis().redis);
    await store.record(entry(1, 400, 1, "lain"));
    expect(await store.record(entry(1, 100, 2, "outro"))).toEqual({ ok: false, error: "duplicate" });
    expect((await store.top(20)).map((e) => e.nickname)).toEqual(["lain"]);
  });

  it("top devolve a ordem e converte os campos (apelido numérico continua texto)", async () => {
    const store = createUpstashStore(fakeRedis().redis);
    await store.record(entry(1, 500, 10, "1234"));
    await store.record(entry(2, 300, 20, "ana"));
    expect(await store.top(20)).toEqual([
      { runId: id(2), nickname: "ana", elapsedMs: 300, createdAt: 20 },
      { runId: id(1), nickname: "1234", elapsedMs: 500, createdAt: 10 },
    ]);
  });

  it("remove apaga uma vez e mantém a lápide (gate)", async () => {
    const fake = fakeRedis();
    const store = createUpstashStore(fake.redis);
    await store.record(entry(1, 400, 1));
    expect(await store.remove(id(1))).toBe(true);
    expect(await store.remove(id(1))).toBe(false);
    expect(await store.top(20)).toEqual([]);
    expect(await store.record(entry(1, 400, 2))).toEqual({ ok: false, error: "duplicate" });
    expect(fake.gates.size).toBe(1);
  });

  it("runId que não é UUID nunca chega ao Redis", async () => {
    const fake = fakeRedis();
    const store = createUpstashStore(fake.redis);
    expect(await store.remove("a:b")).toBe(false);
    expect(await store.record({ ...entry(1, 400, 1), runId: "ranking:v1" })).toEqual({ ok: false, error: "duplicate" });
    expect(fake.calls).toHaveLength(0);
  });

  it("monta as chaves com o prefixo", async () => {
    const fake = fakeRedis();
    const store = createUpstashStore(fake.redis, "t:x");
    await store.record(entry(1, 400, 5));
    expect(fake.calls[0].keys).toEqual(["t:x", `t:x:gate:${id(1)}`, `t:x:${id(1)}`]);
    await store.top(20);
    expect(fake.calls[1].args).toEqual([20, "t:x:"]);
  });
});
