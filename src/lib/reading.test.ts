import { describe, expect, it } from "vitest";
import { READER, readingProgress, shouldUnlockReader } from "@/lib/reading";

describe("READER (spec 7.7, 8.4)", () => {
  it("95% do corpo; 15 s para página que não rola", () => {
    expect(READER).toEqual({ threshold: 0.95, dwellMs: 15000 });
  });
});

describe("readingProgress (fração do corpo que passou pela borda de baixo da janela)", () => {
  it("corpo ainda abaixo da janela: 0", () => {
    expect(readingProgress(900, 2000, 800)).toBe(0);
  });
  it("metade do corpo lida", () => {
    // topo do corpo 200 px acima do topo da janela: 800 + 200 = 1000 de 2000 já passaram
    expect(readingProgress(-200, 2000, 800)).toBe(0.5);
  });
  it("fim do corpo na borda de baixo: 1; passou disso: continua 1", () => {
    expect(readingProgress(-1200, 2000, 800)).toBe(1);
    expect(readingProgress(-3000, 2000, 800)).toBe(1);
  });
  it("corpo vazio (altura 0): 0, nunca divide por zero", () => {
    expect(readingProgress(0, 0, 800)).toBe(0);
  });
});

describe("shouldUnlockReader (só para quem leu — Review Focus 1)", () => {
  const base = { progress: 1, scrolled: false, scrollable: true, dwellMs: 0 };
  it("abaixo de 95%: nunca", () => {
    expect(shouldUnlockReader({ ...base, progress: 0.94, scrolled: true })).toBe(false);
  });
  it("95% com scroll desde a montagem: sim", () => {
    expect(shouldUnlockReader({ ...base, progress: 0.95, scrolled: true })).toBe(true);
  });
  it("95% na montagem sem scroll (post curto em tela alta, recarregar no fim): não", () => {
    expect(shouldUnlockReader({ ...base, dwellMs: 60000 })).toBe(false);
  });
  it("95% exatos sem scroll e sem esperar: não; com scroll: sim (borda)", () => {
    expect(shouldUnlockReader({ ...base, progress: READER.threshold })).toBe(false);
    expect(shouldUnlockReader({ ...base, progress: READER.threshold, scrolled: true })).toBe(true);
  });
  it("página que não rola mesmo com scroll registrado: vale o scroll", () => {
    expect(shouldUnlockReader({ ...base, scrolled: true, scrollable: false })).toBe(true);
  });
  it("página que não rola: só depois de 15 s", () => {
    expect(shouldUnlockReader({ ...base, scrollable: false, dwellMs: 14999 })).toBe(false);
    expect(shouldUnlockReader({ ...base, scrollable: false, dwellMs: 15000 })).toBe(true);
  });
});
