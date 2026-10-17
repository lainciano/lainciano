import { describe, expect, it } from "vitest";
import { shouldOpenConsole, type ShortcutEvent } from "@/interaction/console/shortcut";

const base: ShortcutEvent = {
  key: "/",
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  isComposing: false,
  defaultPrevented: false,
  target: { tagName: "BODY", isContentEditable: false },
  dialogOpen: false,
};

describe("atalho / do console (spec 8.6, D11)", () => {
  it("abre com / fora de campos", () => {
    expect(shouldOpenConsole(base)).toBe(true);
    expect(shouldOpenConsole({ ...base, target: { tagName: "A" } })).toBe(true);
    expect(shouldOpenConsole({ ...base, target: null })).toBe(true);
  });
  it("nunca rouba a tecla de quem digita", () => {
    for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) {
      expect(shouldOpenConsole({ ...base, target: { tagName } })).toBe(false);
    }
    expect(shouldOpenConsole({ ...base, target: { tagName: "DIV", isContentEditable: true } })).toBe(false);
    expect(shouldOpenConsole({ ...base, isComposing: true })).toBe(false);
  });
  it("ignora modificadores, outra tecla, evento já tratado e outro diálogo aberto", () => {
    expect(shouldOpenConsole({ ...base, ctrlKey: true })).toBe(false);
    expect(shouldOpenConsole({ ...base, metaKey: true })).toBe(false);
    expect(shouldOpenConsole({ ...base, altKey: true })).toBe(false);
    expect(shouldOpenConsole({ ...base, key: "?" })).toBe(false);
    expect(shouldOpenConsole({ ...base, defaultPrevented: true })).toBe(false);
    expect(shouldOpenConsole({ ...base, dialogOpen: true })).toBe(false);
  });
});
