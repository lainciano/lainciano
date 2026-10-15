import { beforeEach, describe, expect, it, vi } from "vitest";

describe("lenis-bridge", () => {
  const stop = vi.fn();
  const start = vi.fn();
  let bridge: typeof import("./lenis-bridge");

  beforeEach(async () => {
    vi.resetModules();
    stop.mockClear();
    start.mockClear();
    bridge = await import("./lenis-bridge");
    bridge.registerLenisControls({ stop, start });
  });

  it("para uma vez e só retoma quando o último dono libera", () => {
    bridge.pauseLenis();
    bridge.pauseLenis();
    expect(stop).toHaveBeenCalledTimes(1);
    bridge.resumeLenis();
    expect(start).not.toHaveBeenCalled();
    bridge.resumeLenis();
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("resume sem pausa não deixa o contador negativo", () => {
    bridge.resumeLenis();
    bridge.resumeLenis();
    bridge.pauseLenis();
    expect(stop).toHaveBeenCalledTimes(1);
    bridge.resumeLenis();
    expect(start).toHaveBeenCalledTimes(3);
  });
});
