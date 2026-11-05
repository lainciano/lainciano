import { describe, expect, it } from "vitest";
import { createPanelStack, openPanel } from "./panelStack";

describe("pilha de painéis", () => {
  it("vazia é andar", () => {
    const s = createPanelStack();
    expect(s.mode()).toBe("walk");
    expect(s.size()).toBe(0);
    expect(s.top()).toBeUndefined();
    expect(s.pop()).toBeUndefined();
  });

  it("empilhar muda o modo para o do topo", () => {
    const s = createPanelStack();
    s.push({ mode: "phone" });
    expect(s.mode()).toBe("phone");
    s.push({ mode: "examine", id: "bilhete" });
    expect(s.mode()).toBe("examine");
    expect(s.top()).toEqual({ mode: "examine", id: "bilhete" });
  });

  it("fechar um documento aberto pelo celular volta ao celular, e depois ao jogo", () => {
    const s = createPanelStack();
    s.push({ mode: "phone" });
    s.push({ mode: "read", id: "carta" });
    expect(s.pop()).toEqual({ mode: "read", id: "carta" });
    expect(s.mode()).toBe("phone");
    expect(s.pop()).toEqual({ mode: "phone" });
    expect(s.mode()).toBe("walk");
  });

  it("clear esvazia tudo de uma vez", () => {
    const s = createPanelStack();
    s.push({ mode: "phone" });
    s.push({ mode: "read" });
    s.clear();
    expect(s.size()).toBe(0);
    expect(s.mode()).toBe("walk");
  });

  it("has diz se há um painel daquele modo em qualquer posição", () => {
    const s = createPanelStack();
    s.push({ mode: "phone" });
    s.push({ mode: "examine" });
    expect(s.has("phone")).toBe(true);
    expect(s.has("read")).toBe(false);
  });

  it("o painel devolvido é uma cópia: mexer nele não mexe na pilha", () => {
    const s = createPanelStack();
    s.push({ mode: "examine", id: "a" });
    const top = s.top();
    if (top) top.id = "outro";
    expect(s.top()?.id).toBe("a");
  });
});

describe("openPanel: abrir com desfazer", () => {
  it("empilha, sincroniza e só então constrói (a ordem é parte do contrato)", () => {
    const s = createPanelStack();
    const calls: string[] = [];
    openPanel(s, { mode: "examine", id: "x" }, () => calls.push(`sync:${s.size()}`), () => calls.push(`build:${s.size()}`));
    expect(calls).toEqual(["sync:1", "build:1"]);
    expect(s.top()).toEqual({ mode: "examine", id: "x" });
  });

  it("se construir lançar, desempilha, sincroniza de novo e relança (nada de painel fantasma)", () => {
    const s = createPanelStack();
    s.push({ mode: "phone" });
    const sizes: number[] = [];
    const boom = new Error("falhou");
    expect(() =>
      openPanel(s, { mode: "examine" }, () => sizes.push(s.size()), () => {
        throw boom;
      }),
    ).toThrow(boom);
    expect(s.mode()).toBe("phone");
    expect(s.size()).toBe(1);
    expect(sizes).toEqual([2, 1]);
  });

  it("falha com a pilha vazia volta a andar", () => {
    const s = createPanelStack();
    expect(() =>
      openPanel(s, { mode: "examine" }, () => {}, () => {
        throw new Error("x");
      }),
    ).toThrow("x");
    expect(s.mode()).toBe("walk");
  });
});
