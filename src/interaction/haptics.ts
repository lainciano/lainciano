import { readingStore } from "@/interaction/reading-mode/store";

/** Vibração curta em celulares que suportam (Android); nada em modo leitura. */
export function vibrate(pattern: number | number[]) {
  if (readingStore.getSnapshot()) return;
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
}
