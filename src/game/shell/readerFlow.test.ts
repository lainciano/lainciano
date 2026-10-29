import { describe, expect, it, vi } from "vitest";
import type { Doc } from "../layers/types";
import { createPanelStack } from "./panelStack";
import { createReaderFlow, type ReaderView } from "./readerFlow";

const BILHETE: Doc = { id: "bilhete", title: "bilhete", text: "o que abre a porta está no armário." };
const CARTA: Doc = { id: "carta", title: "carta", text: "oi." };

function setup() {
  const stack = createPanelStack();
  const sync = vi.fn();
  const views: (ReaderView | null)[] = [];
  const flow = createReaderFlow(stack, sync, { reader: (v) => views.push(v) });
  return { stack, sync, views, flow };
}

describe("leitor sobre a pilha de painéis", () => {
  it("abrir empilha 'read', sincroniza (a lanterna guarda) e mostra o papel (nível 1) primeiro", () => {
    const { stack, sync, views, flow } = setup();
    expect(flow.open(BILHETE)).toBe(true);
    expect(stack.mode()).toBe("read");
    expect(stack.top()).toEqual({ mode: "read", id: "bilhete" });
    expect(sync).toHaveBeenCalledTimes(1);
    expect(views.at(-1)).toEqual({ doc: BILHETE, clean: false });
    expect(flow.view()?.doc.id).toBe("bilhete");
  });

  it("R alterna papel e texto limpo; R de novo volta ao papel", () => {
    const { views, flow } = setup();
    flow.open(BILHETE);
    flow.toggle();
    expect(views.at(-1)).toEqual({ doc: BILHETE, clean: true });
    flow.toggle();
    expect(views.at(-1)).toEqual({ doc: BILHETE, clean: false });
  });

  it("fechar desempilha, sincroniza e diz que a pilha esvaziou (só então o mouse trava de novo)", () => {
    const { stack, sync, views, flow } = setup();
    flow.open(BILHETE);
    sync.mockClear();
    expect(flow.close()).toEqual({ closed: true, emptied: true, back: "walk" });
    expect(stack.size()).toBe(0);
    expect(stack.mode()).toBe("walk");
    expect(sync).toHaveBeenCalledTimes(1);
    expect(views.at(-1)).toBeNull();
    expect(flow.view()).toBeNull();
  });

  it("fechar sem leitor aberto não faz nada", () => {
    const { stack, sync, flow } = setup();
    expect(flow.close()).toEqual({ closed: false, emptied: false, back: "walk" });
    expect(sync).not.toHaveBeenCalled();
    stack.push({ mode: "examine", id: "caderno" });
    expect(flow.close().closed).toBe(false);
    expect(stack.mode()).toBe("examine");
  });

  it("não abre um segundo leitor por cima do primeiro", () => {
    const { stack, flow } = setup();
    flow.open(BILHETE);
    expect(flow.open(CARTA)).toBe(false);
    expect(stack.size()).toBe(1);
    expect(flow.view()?.doc.id).toBe("bilhete");
  });

  it("aberto a partir do celular (returnTo): fechar volta ao celular, nunca ao jogo", () => {
    const { stack, sync, views, flow } = setup();
    stack.push({ mode: "phone" });
    expect(flow.open(CARTA, { returnTo: "phone" })).toBe(true);
    expect(stack.top()).toEqual({ mode: "read", id: "carta", returnTo: "phone" });
    expect(views.at(-1)).toEqual({ doc: CARTA, clean: false, returnTo: "phone" });
    sync.mockClear();
    const r = flow.close();
    expect(r).toEqual({ closed: true, emptied: false, back: "phone" });
    expect(stack.mode()).toBe("phone");
    expect(stack.size()).toBe(1);
    // o celular segue aberto: a lanterna continua guardada (sync com a pilha ainda cheia)
    expect(sync).toHaveBeenCalledTimes(1);
    expect(views.at(-1)).toBeNull();
    // fechar o celular depois esvazia a pilha
    expect(stack.pop()).toEqual({ mode: "phone" });
    expect(stack.mode()).toBe("walk");
  });

  it("sem returnTo, um leitor aberto sobre o celular também volta ao celular (a pilha manda)", () => {
    const { stack, flow } = setup();
    stack.push({ mode: "phone" });
    flow.open(CARTA);
    expect(flow.close().back).toBe("phone");
    expect(stack.mode()).toBe("phone");
  });

  it("returnTo 'phone' sem celular aberto é erro de quem chama: nada é empilhado", () => {
    const { stack, sync, views, flow } = setup();
    expect(() => flow.open(CARTA, { returnTo: "phone" })).toThrow(/celular/);
    expect(stack.size()).toBe(0);
    expect(sync).not.toHaveBeenCalled();
    expect(views).toEqual([]);
  });

  it("se mostrar o documento falhar, desfaz: sem painel fantasma e a lanterna volta", () => {
    const stack = createPanelStack();
    const sync = vi.fn();
    const flow = createReaderFlow(stack, sync, {
      reader: () => {
        throw new Error("boom");
      },
    });
    expect(() => flow.open(BILHETE)).toThrow("boom");
    expect(stack.size()).toBe(0);
    expect(stack.mode()).toBe("walk");
    expect(sync).toHaveBeenCalledTimes(2); // abriu (guarda) e desfez (volta)
    expect(flow.view()).toBeNull();
  });

  it("abrir, fechar e abrir de novo começa sempre no papel", () => {
    const { flow, views } = setup();
    flow.open(BILHETE);
    flow.toggle();
    flow.close();
    flow.open(BILHETE);
    expect(views.at(-1)).toEqual({ doc: BILHETE, clean: false });
  });

  it("toggle sem leitor aberto não faz nada", () => {
    const { flow, views } = setup();
    flow.toggle();
    expect(views).toEqual([]);
  });

  it("20 ciclos abrir/fechar deixam a pilha vazia", () => {
    const { stack, flow } = setup();
    for (let i = 0; i < 20; i++) {
      flow.open(BILHETE);
      flow.toggle();
      flow.close();
    }
    expect(stack.size()).toBe(0);
    expect(flow.view()).toBeNull();
  });
});
