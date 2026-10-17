import { describe, expect, it } from "vitest";
import { INTENT_EVENTS, INTENT_FALLBACK_MS } from "@/rooms/shared/intent";

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
