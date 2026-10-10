/** Apelido do livro (spec 8.5): 3–16 letras, números, _ ou -, sem espaços. */
export const NICKNAME = { min: 3, max: 16, pattern: /^[A-Za-z0-9_-]{3,16}$/ } as const;

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b" };

/** Forma de comparação: minúsculas, leetspeak desfeito e sem _ e - ("C4r4_lh0" → "caralho"). */
export function foldNickname(nickname: string): string {
  return nickname
    .toLowerCase()
    .replace(/[0-9]/g, (digit) => LEET[digit] ?? digit)
    .replace(/[_-]/g, "");
}

// Termos longos: bloqueiam em qualquer posição. Curtos/ambíguos: só o apelido exato (D9: sem Scunthorpe).
const CONTAINS = [
  "caralho", "buceta", "porra", "merda", "foder", "fodase", "punheta", "piroca", "xoxota", "arrombad",
  "vagabund", "filhodaputa", "putaria", "cuzao", "nazi", "hitler", "estupr", "pedofil",
  "fuck", "shit", "bitch", "whore", "nigger", "nigga", "faggot", "retard", "rapist", "porn",
];
const EXACT = ["puta", "puto", "viado", "bicha", "cu", "cunt", "pau", "fdp", "pqp", "vsf", "tnc", "kct", "cacete", "ass", "sex", "slut"];
const RESERVED = ["admin", "administrador", "root", "lainciano", "moderador", "moderator", "sistema", "system", "cripta"];

const CONTAINS_FOLDED = CONTAINS.map(foldNickname);
const EXACT_FOLDED = new Set([...EXACT, ...RESERVED].map(foldNickname));

export type NicknameVerdict = "ok" | "invalid" | "blocked";

/** Formato primeiro (invalid), depois a lista (blocked). O mesmo código roda no formulário e na API. */
export function validateNickname(raw: string): NicknameVerdict {
  const nickname = raw.trim();
  if (!NICKNAME.pattern.test(nickname)) return "invalid";
  const folded = foldNickname(nickname);
  if (EXACT_FOLDED.has(folded) || CONTAINS_FOLDED.some((term) => folded.includes(term))) return "blocked";
  return "ok";
}
