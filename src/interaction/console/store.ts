import { useSyncExternalStore } from "react";
import { EMPTY_HISTORY, type History } from "./parse";

type InlineTarget = { focus(): void };

let open = false;
let inline: InlineTarget | null = null;
let history: History = EMPTY_HISTORY;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

/** Console global: aberto/fechado, console embutido da página (Contato, 404) e histórico compartilhado. */
export const consoleStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: (): boolean => open,
  /** Com um console embutido na página, foca ele em vez de abrir o sobreposto (D11). */
  open() {
    if (inline) {
      inline.focus();
      return;
    }
    if (open) return;
    open = true;
    emit();
  },
  close() {
    if (!open) return;
    open = false;
    emit();
  },
  registerInline(target: InlineTarget) {
    inline = target;
    return () => {
      if (inline === target) inline = null;
    };
  },
  getHistory: (): History => history,
  setHistory(next: History) {
    history = next;
  },
};

export function useConsoleOpen(): boolean {
  return useSyncExternalStore(consoleStore.subscribe, consoleStore.getSnapshot, () => false);
}
