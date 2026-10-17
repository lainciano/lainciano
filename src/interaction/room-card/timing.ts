/**
 * Tempos do cartão de entrada de sala (s). Alongado a pedido do dono ("acabando rápido demais"):
 * entrada das letras ≈ 2,2 s, parada com tudo visível 1,8 s e saída em cortina 0,9 s ≈ 4,9 s, pulável a qualquer gesto.
 */
export const CARD = {
  letters: 1.3,
  stagger: 0.08,
  line: 1.0,
  epigraphAt: 1.0,
  epigraph: 0.9,
  hold: 1.8,
  exit: 0.9,
  skipTo: 0.25,
} as const;

/** Fim da entrada com o título mais longo ("Biblioteca", 10 letras): 0,1 + letters + 9 × stagger. */
export const ENTRY_END_S = 2.2;

/** Duração natural do cartão sem ninguém pular. */
export function cardDurationS(): number {
  return ENTRY_END_S + CARD.hold + CARD.exit;
}

/** Temporizador de segurança do CSS: sempre depois do fim natural, para o cartão nunca prender a página. */
export const FAILSAFE_S = 9;
