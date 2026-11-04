import { describe, expect, it } from "vitest";
import { createRecoveryLimiter, MAX_RECOVERIES, WINDOW_MS } from "./recovery";

describe("createRecoveryLimiter", () => {
  it("permite 3 recriações por minuto e recusa a 4ª", () => {
    const l = createRecoveryLimiter();
    for (let i = 0; i < MAX_RECOVERIES; i++) {
      expect(l.canRecover(1000 + i)).toBe(true);
      expect(l.take(1000 + i)).toBe(true);
    }
    expect(l.canRecover(5000)).toBe(false);
    expect(l.take(5000)).toBe(false);
  });

  it("recusar não conta: a janela libera quando a mais antiga sai", () => {
    const l = createRecoveryLimiter();
    l.take(0);
    l.take(10_000);
    l.take(20_000);
    expect(l.take(30_000)).toBe(false);
    expect(l.canRecover(WINDOW_MS - 1)).toBe(false);
    expect(l.canRecover(WINDOW_MS)).toBe(true);
    expect(l.take(WINDOW_MS)).toBe(true);
    expect(l.canRecover(WINDOW_MS + 1)).toBe(false);
  });

  it("canRecover não consome", () => {
    const l = createRecoveryLimiter(1);
    expect(l.canRecover(0)).toBe(true);
    expect(l.canRecover(0)).toBe(true);
    expect(l.take(0)).toBe(true);
    expect(l.canRecover(1)).toBe(false);
  });
});
