import { describe, expect, it } from "vitest";
import { compareEntries, createMemoryStore, type RankingEntry } from "@/lib/ranking/store";

const entry = (runId: string, elapsedMs: number, createdAt: number, nickname = runId): RankingEntry => ({
  runId,
  nickname,
  elapsedMs,
  createdAt,
});

describe("compareEntries (spec 8.5, D5)", () => {
  it("menor tempo primeiro; empate pelo envio mais antigo; depois runId", () => {
    const list = [entry("c", 500, 10), entry("a", 300, 30), entry("b", 300, 20), entry("d", 300, 20)];
    expect(list.sort(compareEntries).map((e) => e.runId)).toEqual(["b", "d", "a", "c"]);
  });
});

describe("createMemoryStore", () => {
  it("grava e devolve a posição", async () => {
    const store = createMemoryStore();
    expect(await store.record(entry("a", 400, 1))).toEqual({ ok: true, position: 1 });
    expect(await store.record(entry("b", 200, 2))).toEqual({ ok: true, position: 1 });
    expect(await store.record(entry("c", 300, 3))).toEqual({ ok: true, position: 2 });
  });
  it("cada run grava uma vez, mesmo com outro apelido", async () => {
    const store = createMemoryStore();
    await store.record(entry("a", 400, 1, "lain"));
    expect(await store.record(entry("a", 100, 2, "outro"))).toEqual({ ok: false, error: "duplicate" });
    expect((await store.top(20)).map((e) => e.nickname)).toEqual(["lain"]);
  });
  it("top respeita o limite e a ordem", async () => {
    const store = createMemoryStore();
    for (let i = 0; i < 25; i += 1) await store.record(entry(`r${i}`, 1000 - i, i));
    const top = await store.top(20);
    expect(top).toHaveLength(20);
    expect(top[0].runId).toBe("r24");
  });
  it("remove apaga uma vez", async () => {
    const store = createMemoryStore();
    await store.record(entry("a", 400, 1));
    expect(await store.remove("a")).toBe(true);
    expect(await store.remove("a")).toBe(false);
    expect(await store.top(20)).toEqual([]);
  });
});

describe("tombstone (I1)", () => {
  it("remove apaga a linha mas mantém o runId queimado: gravar de novo → duplicate", async () => {
    const store = createMemoryStore();
    await store.record(entry("a", 400, 1));
    expect(await store.remove("a")).toBe(true);
    expect(await store.record(entry("a", 400, 2))).toEqual({ ok: false, error: "duplicate" });
    expect(await store.top(20)).toEqual([]);
  });
});
