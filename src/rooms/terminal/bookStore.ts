import { fetchBook, type BookEntry } from "@/interaction/platinum/api";

export type BookState = { status: "loading" } | { status: "ready"; entries: BookEntry[] } | { status: "failed" };

let state: BookState = { status: "loading" };
let loading = false;
const listeners = new Set<() => void>();
const set = (next: BookState) => {
  state = next;
  listeners.forEach((listener) => listener());
};

/** Estado do livro fora do React (lição 3): o componente só assina; carregar não faz setState em efeito. */
export const bookStore = {
  load() {
    if (loading) return;
    loading = true;
    set({ status: "loading" });
    void fetchBook().then((entries) => {
      loading = false;
      set(entries ? { status: "ready", entries } : { status: "failed" });
    });
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: () => state,
};
