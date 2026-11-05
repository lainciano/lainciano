import { describe, expect, it, vi } from "vitest";
import { INTENT_EVENTS, INTENT_FALLBACK_MS, armIntentFallback } from "@/rooms/shared/intent";

describe("intenção de usar a sala (cena WebGL sob demanda)", () => {
  it("o prazo de segurança vem depois do TTI de uma página lenta (≥ 6 s)", () => {
    expect(INTENT_FALLBACK_MS).toBeGreaterThanOrEqual(6000);
  });
  it("mouse, toque e teclado contam como intenção", () => {
    for (const type of ["pointerenter", "pointerdown", "focusin", "touchstart"]) {
      expect(INTENT_EVENTS).toContain(type);
    }
  });
});

describe("armIntentFallback (o prazo só conta com o Limiar fechado)", () => {
  function fakeStore(open: boolean) {
    const closers = new Set<() => void>();
    return {
      isOpen: () => open,
      onClose(listener: () => void) {
        closers.add(listener);
        return () => closers.delete(listener);
      },
      close() {
        open = false;
        [...closers].forEach((l) => l());
      },
      size: () => closers.size,
    };
  }

  it("com o Limiar fechado arma o prazo na hora", () => {
    vi.useFakeTimers();
    const fire = vi.fn();
    armIntentFallback(fakeStore(false), fire);
    vi.advanceTimersByTime(INTENT_FALLBACK_MS - 1);
    expect(fire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fire).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("com o Limiar aberto não arma; arma ao fechar", () => {
    vi.useFakeTimers();
    const store = fakeStore(true);
    const fire = vi.fn();
    armIntentFallback(store, fire);
    vi.advanceTimersByTime(INTENT_FALLBACK_MS * 3);
    expect(fire).not.toHaveBeenCalled();
    store.close();
    vi.advanceTimersByTime(INTENT_FALLBACK_MS);
    expect(fire).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("cancelar solta o ouvinte e o prazo", () => {
    vi.useFakeTimers();
    const store = fakeStore(true);
    const fire = vi.fn();
    const cancel = armIntentFallback(store, fire);
    cancel();
    expect(store.size()).toBe(0);
    store.close();
    vi.advanceTimersByTime(INTENT_FALLBACK_MS * 2);
    expect(fire).not.toHaveBeenCalled();

    const fire2 = vi.fn();
    armIntentFallback(fakeStore(false), fire2)();
    vi.advanceTimersByTime(INTENT_FALLBACK_MS * 2);
    expect(fire2).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
