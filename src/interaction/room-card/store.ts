import type { Chapter } from "./chapters";

let current: Chapter | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

/** Cartão de entrada de sala em exibição (null = nenhum). */
export const roomCardStore = {
  show(chapter: Chapter) {
    current = chapter;
    emit();
  },
  clear() {
    if (current === null) return;
    current = null;
    emit();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: (): Chapter | null => current,
};
