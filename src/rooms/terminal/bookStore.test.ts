import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchBook = vi.fn();
vi.mock("@/interaction/platinum/api", () => ({ fetchBook: () => fetchBook() }));

const entry = (nickname: string) => ({ position: 1, nickname, elapsedMs: 130000, createdAt: Date.UTC(2026, 9, 9) });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("bookStore", () => {
  let store: typeof import("./bookStore").bookStore;
  beforeEach(async () => {
    vi.resetModules();
    fetchBook.mockReset();
    store = (await import("./bookStore")).bookStore;
  });

  it("mantém as linhas antigas enquanto recarrega", async () => {
    fetchBook.mockResolvedValueOnce([entry("a")]);
    store.load();
    await flush();
    expect(store.getSnapshot()).toEqual({ status: "ready", entries: [entry("a")] });
    fetchBook.mockResolvedValueOnce([entry("b")]);
    store.load();
    expect(store.getSnapshot()).toEqual({ status: "loading", entries: [entry("a")] });
    await flush();
    expect(store.getSnapshot()).toEqual({ status: "ready", entries: [entry("b")] });
  });

  it("pedido durante carga em voo repete ao terminar", async () => {
    fetchBook.mockResolvedValueOnce([entry("velho")]).mockResolvedValueOnce([entry("novo")]);
    store.load();
    store.load();
    await flush();
    await flush();
    expect(fetchBook).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot()).toEqual({ status: "ready", entries: [entry("novo")] });
  });

  it("falha vira failed", async () => {
    fetchBook.mockResolvedValueOnce(null);
    store.load();
    await flush();
    expect(store.getSnapshot()).toEqual({ status: "failed" });
  });
});
