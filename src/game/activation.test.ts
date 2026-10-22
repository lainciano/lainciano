import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gameStore, parseGameFlag, readActivation } from "./activation";

describe("parseGameFlag", () => {
  it("só 'on' exato liga", () => {
    expect(parseGameFlag("on")).toBe(true);
    expect(parseGameFlag("off")).toBe(false);
    expect(parseGameFlag(null)).toBe(false);
    expect(parseGameFlag("ON ")).toBe(false);
  });
});

describe("readActivation", () => {
  it("?jogo=1 liga, pede para gravar e limpa o parâmetro", () => {
    expect(readActivation("?jogo=1&x=2", null)).toEqual({ enabled: true, persist: "on", cleanSearch: "?x=2" });
  });
  it("chave já gravada liga sem regravar", () => {
    expect(readActivation("", "on")).toEqual({ enabled: true, persist: null, cleanSearch: "" });
  });
  it("só '1' liga; desligar é pelo console", () => {
    expect(readActivation("?jogo=0", "on")).toEqual({ enabled: true, persist: null, cleanSearch: "" });
    expect(readActivation("?jogo=0", null)).toEqual({ enabled: false, persist: null, cleanSearch: "" });
  });
});

describe("gameStore", () => {
  const data = new Map<string, string>();
  beforeEach(() => {
    data.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key),
    });
    gameStore.setEnabled(false);
    gameStore.close();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("requestOpen é false com a chave desligada", () => {
    expect(gameStore.requestOpen()).toBe(false);
    expect(gameStore.isOpen()).toBe(false);
  });
  it("setEnabled grava e remove a chave", () => {
    gameStore.setEnabled(true);
    expect(data.get("lainciano:jogo:v1")).toBe("on");
    expect(gameStore.isEnabled()).toBe(true);
    gameStore.setEnabled(false);
    expect(data.has("lainciano:jogo:v1")).toBe(false);
    expect(gameStore.isEnabled()).toBe(false);
  });
  it("abre uma vez e recusa a segunda enquanto aberto", () => {
    gameStore.setEnabled(true);
    expect(gameStore.requestOpen()).toBe(true);
    expect(gameStore.isOpen()).toBe(true);
    expect(gameStore.requestOpen()).toBe(false);
  });
  it("close notifica assinantes e fecha; desligar a chave também fecha", () => {
    gameStore.setEnabled(true);
    gameStore.requestOpen();
    const listener = vi.fn();
    const off = gameStore.subscribe(listener);
    gameStore.close();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(gameStore.isOpen()).toBe(false);
    off();
    gameStore.requestOpen();
    expect(listener).toHaveBeenCalledTimes(1);
    gameStore.setEnabled(false);
    expect(gameStore.isOpen()).toBe(false);
  });
  it("sem localStorage usa a memória da sessão", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("bloqueado");
      },
      removeItem: () => {
        throw new Error("bloqueado");
      },
    });
    gameStore.setEnabled(true);
    expect(gameStore.isEnabled()).toBe(true);
  });
});
