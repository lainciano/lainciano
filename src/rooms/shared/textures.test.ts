import { describe, expect, it, vi } from "vitest";
import { createBitmapCache } from "@/rooms/shared/textures";

const fakeBitmap = () => ({ close: vi.fn() }) as unknown as ImageBitmap;

describe("createBitmapCache", () => {
  it("carrega cada URL uma vez (lição da Fase 2)", async () => {
    const load = vi.fn(async () => fakeBitmap());
    const cache = createBitmapCache(load);
    const [a, b] = await Promise.all([cache.get("/a.png"), cache.get("/a.png")]);
    expect(a).toBe(b);
    expect(load).toHaveBeenCalledTimes(1);
    expect(cache.size()).toBe(1);
  });
  it("falha não fica no cache (tenta de novo depois)", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("rede")).mockResolvedValueOnce(fakeBitmap());
    const cache = createBitmapCache(load);
    await expect(cache.get("/a.png")).rejects.toThrow("rede");
    await expect(cache.get("/a.png")).resolves.toBeDefined();
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("dispose fecha todos os bitmaps e esvazia", async () => {
    const bitmaps = [fakeBitmap(), fakeBitmap()];
    let i = 0;
    const cache = createBitmapCache(async () => bitmaps[i++]);
    await cache.get("/a.png");
    await cache.get("/b.png");
    await cache.dispose();
    expect(bitmaps[0].close).toHaveBeenCalled();
    expect(bitmaps[1].close).toHaveBeenCalled();
    expect(cache.size()).toBe(0);
  });
});
