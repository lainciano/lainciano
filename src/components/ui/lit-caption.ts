export type CaptionWord = { text: string; key: boolean };

/** Quebra parágrafos em palavras; palavra-chave por igualdade exata, com pontuação (como no protótipo). */
export function splitCaption(paragraphs: readonly string[], keywords: readonly string[] = []): CaptionWord[][] {
  return paragraphs.map((paragraph) =>
    paragraph
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((text) => ({ text, key: keywords.includes(text) })),
  );
}

/** Quantas palavras acendem para um progresso de scroll (0–1). */
export function litCount(progress: number, total: number): number {
  return Math.round(Math.min(1, Math.max(0, progress)) * total);
}

/** Relíquia Leitura: legenda acesa até 99% (spec 7.3, 8.4). */
export function isCaptionComplete(progress: number): boolean {
  return progress > 0.99;
}
