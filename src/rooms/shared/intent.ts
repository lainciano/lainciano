/** Depois do `load`, tempo (ms) em que a cena nasce mesmo sem interação: além do TTI de uma página lenta. */
export const INTENT_FALLBACK_MS = 8000;

/** Eventos que mostram intenção de usar a sala (mouse, toque, teclado). */
export const INTENT_EVENTS = ["pointerenter", "pointerdown", "pointermove", "focusin", "touchstart"] as const;

/** O que o prazo precisa saber do Limiar: se está aberto e quando fecha (o `limiarStore` cumpre isso). */
export type IntentGate = { isOpen(): boolean; onClose(listener: () => void): () => void };

/**
 * Arma o prazo de segurança só com o Limiar fechado; aberto, espera o fechamento para armar. Assim a cena
 * não nasce por baixo da intro e o TBT do Limiar não paga a criação do WebGL. Devolve o cancelamento.
 */
export function armIntentFallback(gate: IntentGate, fire: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let unsubscribe = () => {};
  const arm = () => {
    timer = setTimeout(fire, INTENT_FALLBACK_MS);
  };
  if (gate.isOpen()) {
    unsubscribe = gate.onClose(() => {
      unsubscribe();
      arm();
    });
  } else {
    arm();
  }
  return () => {
    unsubscribe();
    if (timer !== undefined) clearTimeout(timer);
  };
}
