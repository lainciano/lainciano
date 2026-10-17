import type { SfxName } from "@/interaction/sound/sfx";

export type ClickFeedback = { sound: Extract<SfxName, "click" | "tap"> | null; ripple: boolean };

/**
 * Todo clique responde (pedido do dono): link/botão → "click"; área vazia → "tap" mais grave; ambos com onda
 * no ponto do clique. Zonas com feedback próprio (arena, retrato) não duplicam som nem onda. Por teclado
 * (Enter/Espaço) só o som, sem onda no ponteiro.
 */
export function clickFeedback({
  interactive,
  ownFeedback,
  keyboard,
}: {
  interactive: boolean;
  ownFeedback: boolean;
  keyboard: boolean;
}): ClickFeedback {
  if (ownFeedback) return { sound: null, ripple: false };
  if (keyboard) return { sound: "click", ripple: false };
  return { sound: interactive ? "click" : "tap", ripple: true };
}
