import { readingStore } from "@/interaction/reading-mode/store";

/** Vibração curta em celulares que suportam (Android); nada em modo leitura. */
export function vibrate(pattern: number | number[]) {
  if (readingStore.getSnapshot()) return;
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  // Sem gesto do usuário o Chrome bloqueia e registra um erro no console (relíquia ganha por comando, na montagem).
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  navigator.vibrate(pattern);
}
