import { useSyncExternalStore } from "react";

let open = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

/** Tela de platina aberta? (spec 8.5). Aberta pelo InteractionProvider na 10ª relíquia e pelo `cripta`. */
export const platinumStore = {
  open() {
    if (open) return;
    open = true;
    emit();
  },
  close() {
    if (!open) return;
    open = false;
    emit();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: () => open,
};

export function usePlatinumOpen(): boolean {
  return useSyncExternalStore(platinumStore.subscribe, platinumStore.getSnapshot, () => false);
}
