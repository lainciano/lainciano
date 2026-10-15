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

  it("várias pausas de navegação antes da troca de rota contam como uma", () => {
    bridge.pauseLenis("navigation");
    bridge.pauseLenis("navigation");
    expect(stop).toHaveBeenCalledTimes(1);
    bridge.resumeLenis("navigation"); // retomada do SmoothScroll na troca de pathname
    expect(start).toHaveBeenCalledTimes(1);
    bridge.resumeLenis();
    expect(start).toHaveBeenCalledTimes(2); // nada preso: religa e nunca fica negativo
    bridge.pauseLenis();
    bridge.resumeLenis();
    expect(start).toHaveBeenCalledTimes(3);
  });

  it("aninhamento de diálogos segue valendo com a navegação segurando", () => {
    bridge.pauseLenis("navigation");
    bridge.pauseLenis(); // diálogo
    bridge.pauseLenis(); // diálogo aninhado
    expect(stop).toHaveBeenCalledTimes(1);
    bridge.resumeLenis();
    bridge.resumeLenis();
    expect(start).not.toHaveBeenCalled();
    bridge.resumeLenis("navigation");
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("liberar a navegação não rouba a pausa de um diálogo aberto", () => {
    bridge.pauseLenis();
    bridge.pauseLenis("navigation");
    bridge.resumeLenis("navigation");
    expect(start).not.toHaveBeenCalled();
    bridge.resumeLenis();
    expect(start).toHaveBeenCalledTimes(1);
  });
});
