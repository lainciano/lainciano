import { useSyncExternalStore } from "react";

export type LimiarSource = "boot" | "console";
export type CloseReason = "complete" | "skip" | "reading";

type State = { open: boolean; source: LimiarSource | null };

let state: State = { open: false, source: null };
const listeners = new Set<() => void>();
const closeListeners = new Set<(reason: CloseReason) => void>();

function emit() {
  for (const listener of [...listeners]) listener();
}

/** Estado aberto/fechado do Limiar. Não toca DOM, som nem relíquias: só guarda e avisa quem escuta. */
export const limiarStore = {
  isOpen: () => state.open,
  getSource: () => state.source,
  open(source: LimiarSource): boolean {
    if (state.open) return false;
    state = { open: true, source };
    emit();
    return true;
  },
  close(reason: CloseReason): boolean {
    if (!state.open) return false;
    state = { open: false, source: null };
    emit();
    for (const listener of [...closeListeners]) listener(reason);
    return true;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  onClose(listener: (reason: CloseReason) => void): () => void {
    closeListeners.add(listener);
    return () => {
      closeListeners.delete(listener);
    };
  },
};

export function useLimiarOpen(): boolean {
  return useSyncExternalStore(limiarStore.subscribe, limiarStore.isOpen, () => false);
}
