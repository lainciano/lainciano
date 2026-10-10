import { RELIC_IDS } from "@/interaction/relics/catalog";

/** Barreiras do livro (spec 8.5, D3): piso anti-trapaça, teto de sanidade e folga de relógio. */
export const RUN_RULES = { minElapsedMs: 120_000, maxElapsedMs: 2_592_000_000, clockSkewMs: 60_000 } as const;

export type SubmissionError = "incomplete" | "too_fast" | "bad_time";

type Submission = { relics: readonly string[]; elapsedMs: number; issuedAt: number; now: number };

/** Ranking de honra: confere o que dá para conferir sem ver o jogo (spec 8.5). */
export function checkSubmission({ relics, elapsedMs, issuedAt, now }: Submission): { ok: true } | { ok: false; error: SubmissionError } {
  const unique = new Set(relics);
  if (relics.length !== RELIC_IDS.length || unique.size !== RELIC_IDS.length || !RELIC_IDS.every((id) => unique.has(id))) {
    return { ok: false, error: "incomplete" };
  }
  if (!Number.isFinite(issuedAt) || issuedAt > now + RUN_RULES.clockSkewMs) return { ok: false, error: "bad_time" };
  if (!Number.isInteger(elapsedMs) || elapsedMs < 0 || elapsedMs > RUN_RULES.maxElapsedMs) return { ok: false, error: "bad_time" };
  if (elapsedMs < RUN_RULES.minElapsedMs) return { ok: false, error: "too_fast" };
  return { ok: true };
}
