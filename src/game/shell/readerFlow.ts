import type { Doc } from "../layers/types";
import type { InputMode } from "../input/actions";
import { openPanel, type PanelMode, type PanelStack } from "./panelStack";

/**
 * Leitor em dois níveis sobre a pilha de painéis (T10). Lógica pura, sem DOM: o nível 1 é o papel e o nível 2 o
 * texto limpo (R alterna); abrir empilha `read` (a lanterna guarda por `sync`), fechar desempilha.
 *
 * Fechar volta ao que estava debaixo: um documento aberto a partir do celular (`returnTo: "phone"`) devolve o
 * celular, na mesma tela e item, nunca o jogo com o celular fechado. Só quando a pilha esvazia (`emptied`) o mouse
 * pode travar de novo; quem fecha só chama `panelClosed()` nesse caso.
 */
export type ReaderView = { doc: Doc; clean: boolean; returnTo?: PanelMode };

export type ReaderUi = {
  /** Leitor aberto (ou com o nível trocado) / fechado (`null`). */
  reader(view: ReaderView | null): void;
};

export type ReaderClose = {
  closed: boolean;
  /** A pilha ficou vazia: o jogo voltou a andar. */
  emptied: boolean;
  /** Onde se está depois de fechar (`walk` ou o painel que estava embaixo). */
  back: InputMode;
};

export type ReaderFlow = {
  /** Abre o documento. `false` se já há um leitor aberto. Lança (sem empilhar nada) se `returnTo` não bate com a pilha. */
  open(doc: Doc, opts?: { returnTo?: PanelMode }): boolean;
  close(): ReaderClose;
  /** R: alterna papel e texto limpo. */
  toggle(): void;
  view(): ReaderView | null;
};

export function createReaderFlow(stack: PanelStack, sync: () => void, ui: ReaderUi): ReaderFlow {
  let current: ReaderView | null = null;

  const result = (closed: boolean): ReaderClose => ({ closed, emptied: closed && stack.size() === 0, back: stack.mode() });

  return {
    open(doc, opts) {
      if (stack.has("read")) return false;
      const returnTo = opts?.returnTo;
      if (returnTo && stack.top()?.mode !== returnTo) {
        throw new Error(`o leitor pediu voltar ao ${returnTo === "phone" ? "celular" : returnTo}, que não está aberto`);
      }
      const view: ReaderView = returnTo ? { doc, clean: false, returnTo } : { doc, clean: false };
      try {
        openPanel(stack, returnTo ? { mode: "read", id: doc.id, returnTo } : { mode: "read", id: doc.id }, sync, () => ui.reader(view));
      } catch (error) {
        current = null;
        throw error;
      }
      current = view;
      return true;
    },
    close() {
      if (stack.top()?.mode !== "read") return result(false);
      stack.pop();
      current = null;
      sync();
      ui.reader(null);
      return result(true);
    },
    toggle() {
      if (!current || stack.top()?.mode !== "read") return;
      current = { ...current, clean: !current.clean };
      ui.reader(current);
    },
    view: () => current,
  };
}
