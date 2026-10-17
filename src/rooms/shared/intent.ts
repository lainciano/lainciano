/** Depois do `load`, tempo (ms) em que a cena nasce mesmo sem interação: além do TTI de uma página lenta. */
export const INTENT_FALLBACK_MS = 8000;

/** Eventos que mostram intenção de usar a sala (mouse, toque, teclado). */
export const INTENT_EVENTS = ["pointerenter", "pointerdown", "pointermove", "focusin", "touchstart"] as const;
