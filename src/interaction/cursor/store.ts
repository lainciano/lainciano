let charge = 0;
const listeners = new Set<(value: number) => void>();

/** Progresso do gesto de segurar (0–1), desenhado como anel no cursor. */
export const cursorStore = {
  setCharge(progress: number) {
    charge = Math.min(1, Math.max(0, progress));
    listeners.forEach((listener) => listener(charge));
  },
  onCharge(listener: (value: number) => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
