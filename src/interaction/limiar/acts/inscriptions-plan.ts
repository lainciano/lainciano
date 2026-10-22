/**
 * Lógica pura do ato Inscrições (spec Limiar 3.4): palavras de cada frase, quanto a frase leva para acender,
 * a altura do tique de cada palavra e a progressão entre as frases.
 */

export type InscriptionParts = readonly [before: string, keyword: string, after: string];

/** Palavra animada: `space` diz se havia espaço antes dela (o texto do DOM fica idêntico à frase). */
export type Word = { text: string; key: boolean; space: boolean };

export function splitWords(parts: InscriptionParts): Word[] {
  const words: Word[] = [];
  let space = false;
  parts.forEach((part, i) => {
    const key = i === 1;
    for (const token of part.split(/(\s+)/)) {
      if (token === "") continue;
      if (/^\s+$/.test(token)) {
        space = true;
        continue;
      }
      // Sem espaço na fronteira entre partes ("relíquia" + "s."), as duas peças ficam coladas no texto.
      words.push({ text: token, key, space: words.length > 0 && space });
      space = false;
    }
  });
  return words;
}

export function phraseText(parts: InscriptionParts): string {
  return parts.join("");
}

/** Tempo até a última palavra terminar de acender. */
export function revealMs(wordCount: number, staggerMs: number, wordMs: number): number {
  if (wordCount <= 0) return 0;
  return (wordCount - 1) * staggerMs + wordMs;
}

/** Faixa de altura do tique por palavra (spec: 0,9 a 1,2). */
export const KEY_PITCH = [0.9, 1.2] as const;

/** Tique sobe ao longo da frase: a 1ª palavra em 0,9, a última em 1,2. */
export function keyPitch(index: number, count: number): number {
  const [low, high] = KEY_PITCH;
  if (count <= 1) return low;
  const t = Math.min(1, Math.max(0, index / (count - 1)));
  return low + (high - low) * t;
}

/** Frase atual e se ela já acendeu inteira. */
export type InscriptionState = { index: number; revealed: boolean };

export const FIRST_INSCRIPTION: InscriptionState = { index: 0, revealed: false };

/**
 * Avançar (clique, espaço, Enter ou o prazo): durante o acendimento, completa a frase (não pula sem ver);
 * acesa, vai para a próxima; depois da última, `"done"`.
 */
export function advanceInscription(state: InscriptionState, count: number): InscriptionState | "done" {
  if (!state.revealed) return { index: state.index, revealed: true };
  if (state.index + 1 >= count) return "done";
  return { index: state.index + 1, revealed: false };
}

/** Situação de cada frase na pilha: as anteriores esmaecem, as próximas esperam. */
export function phraseStatus(i: number, current: number): "passada" | "atual" | "futura" {
  if (i < current) return "passada";
  return i === current ? "atual" : "futura";
}
