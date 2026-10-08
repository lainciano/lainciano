export type ToastMessage = { id: number; sigil: string; title: string; detail: string };

/** Tempo que o aviso fica parado na tela. */
export const TOAST_HOLD_MS = 2600;

let current: ToastMessage | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export const toastStore = {
  show(message: Omit<ToastMessage, "id">) {
    seq += 1;
    current = { ...message, id: seq };
    emit();
  },
  clear(id: number) {
    if (current?.id !== id) return;
    current = null;
    emit();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: (): ToastMessage | null => current,
};
