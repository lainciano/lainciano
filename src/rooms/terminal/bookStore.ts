import { fetchBook, type BookEntry } from "@/interaction/platinum/api";

// Recarregando, as linhas antigas continuam (sem piscar a tabela).
export type BookState =
  | { status: "loading"; entries?: BookEntry[] }
  | { status: "ready"; entries: BookEntry[] }
  | { status: "failed" };

let state: BookState = { status: "loading" };
let loading = false;
let again = false;
const listeners = new Set<() => void>();
const set = (next: BookState) => {
  state = next;
  listeners.forEach((listener) => listener());
};

/** Estado do livro fora do React (lição 3): o componente só assina; carregar não faz setState em efeito. */
export const bookStore = {
  load() {
    // Pedido durante uma carga em voo (ex.: gravou agora): repete ao terminar, para não mostrar tabela velha.
    if (loading) {
      again = true;
      return;
    }
    loading = true;
    const previous = state.status === "failed" ? undefined : state.entries;
    set({ status: "loading", entries: previous });
    void fetchBook().then((entries) => {
      loading = false;
      if (again) {
        again = false;
        bookStore.load();
        return;
      }
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
