import type { CloseReason } from "./store";

export type { CloseReason };

export const ACTS = ["som", "abertura", "gesto", "inscricoes", "reliquia"] as const;
export type Act = (typeof ACTS)[number];
export type TransitionKind = "ember" | "engraving" | "iris" | "slices" | "fade";

export function nextAct(act: Act): Act | null {
  return ACTS[ACTS.indexOf(act) + 1] ?? null;
}

const TRANSITIONS: Record<Act, TransitionKind> = {
  som: "ember",
  abertura: "engraving",
  gesto: "iris",
  inscricoes: "slices",
  reliquia: "ember",
};

/** Transição que sai do ato dado. Movimento reduzido troca tudo por fade. */
export function transitionFor(act: Act, opts: { reduced: boolean }): TransitionKind {
  return opts.reduced ? "fade" : TRANSITIONS[act];
}

export const TIMING = {
  sweepMs: 2400,
  openingAutoMs: 4500,
  holdFillMs: 1500,
  holdDrainMs: 900,
  wordStaggerMs: 90,
  inscriptionAutoMs: 5000,
  endingHoldMs: 2400,
  exitMs: [500, 750],
  enterMs: [500, 900],
} as const;

export const INSCRIPTION_COUNT = 3;

/** Efeitos colaterais a aplicar quando o Limiar fecha (quem chama é que os executa). */
export function closeOutcome(input: {
  reason: CloseReason;
  collected: boolean;
  hasRelic: boolean;
  hasSoundPref: boolean;
}): { grantRelic: boolean; writeSoundOff: boolean; enableReading: boolean } {
  return {
    grantRelic: input.collected && !input.hasRelic,
    writeSoundOff: !input.hasSoundPref,
    enableReading: input.reason === "reading",
  };
}

/**
 * Relíquias acesas na faixa de HUD do Limiar: as do store e, se a do Limiar já foi pega, ela também
 * (a concessão real só acontece ao fechar, mas o pip acende na hora).
 */
export function stripWon(won: readonly string[], collected: boolean): readonly string[] {
  return collected && !won.includes("limiar") ? [...won, "limiar"] : won;
}

/**
 * O que a casca faz ao hidratar com a marca do boot (`data-limiar="open"`): diálogo ainda aberto segue
 * aberto; fechado (Esc nativo antes da hidratação) conta como pular e nunca reabre.
 */
export function bootState(flagged: boolean, dialogOpen: boolean): "open" | "skipped" | "none" {
  if (!flagged) return "none";
  return dialogOpen ? "open" : "skipped";
}
