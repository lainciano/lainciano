import { describe, expect, it } from "vitest";
import { createPanelStack } from "./panelStack";

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
