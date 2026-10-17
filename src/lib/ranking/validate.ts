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

// Palavras inocentes que contêm um termo bloqueado (Scunthorpe ↔ "cunt"): só anulam a ocorrência que cabe inteira dentro delas.
const ALLOWED = ["scunthorpe"];

// Termos longos: bloqueiam em qualquer posição. Curtos/ambíguos: só o apelido exato (D9: sem Scunthorpe).
const CONTAINS = [
  "caralho", "buceta", "porra", "merda", "foder", "fodase", "punheta", "piroca", "xoxota", "arrombad",
  "vagabund", "filhodaputa", "putaria", "putinha", "viadinh", "cuzao", "nazi", "hitler", "estupr", "pedofil",
  "fuck", "shit", "bitch", "cunt", "asshole", "whore", "nigger", "nigga", "faggot", "retard", "rapist", "porn",
];
const EXACT = ["puta", "puto", "viado", "bicha", "cu", "pau", "fdp", "pqp", "vsf", "tnc", "kct", "cacete", "ass", "sex", "slut"];
const RESERVED = ["admin", "administrador", "root", "lainciano", "moderador", "moderator", "sistema", "system", "cripta"];

const ALLOWED_FOLDED = ALLOWED.map(foldNickname);
const CONTAINS_FOLDED = CONTAINS.map(foldNickname);
const EXACT_FOLDED = new Set([...EXACT, ...RESERVED].map(foldNickname));
const RESERVED_SET = new Set(RESERVED);

/** Letras que a fonte do site confunde (I/l/1, 0/O, rn/m, 3/e, 4/a): comparação por "aparência" dos reservados. */
const lookalike = (nickname: string) =>
  nickname.toLowerCase().replace(/[_-]/g, "").replace(/[il1]/g, "l").replace(/0/g, "o").replace(/rn/g, "m").replace(/3/g, "e").replace(/4/g, "a");
const RESERVED_LOOK = new Set(RESERVED.map(lookalike));
// A marca do dono vale em qualquer posição ("xlaincianox", "lainciano_real", "Iainciano"): fingir ser o dono é o abuso a evitar.
const BRAND_LOOK = lookalike("lainciano");

/** "admin2", "root_1", "cripta9": sem dígitos, _ e - sobra um reservado (o fold acima só desfaz leetspeak). */
const isReservedWithDigits = (nickname: string) => RESERVED_SET.has(nickname.toLowerCase().replace(/[0-9_-]/g, ""));

export type NicknameVerdict = "ok" | "invalid" | "blocked";

/** A ocorrência [start, end) está inteira dentro de alguma palavra inocente? */
function insideAllowed(folded: string, start: number, end: number): boolean {
  return ALLOWED_FOLDED.some((word) => {
    for (let at = folded.indexOf(word); at !== -1; at = folded.indexOf(word, at + 1)) {
      if (at <= start && end <= at + word.length) return true;
    }
    return false;
  });
}

/** Algum termo bloqueado aparece fora das palavras inocentes? Sobreposição não esconde termo. */
function containsBlocked(folded: string): boolean {
  return CONTAINS_FOLDED.some((term) => {
    for (let at = folded.indexOf(term); at !== -1; at = folded.indexOf(term, at + 1)) {
      if (!insideAllowed(folded, at, at + term.length)) return true;
    }
    return false;
  });
}

/** Formato primeiro (invalid), depois a lista (blocked). O mesmo código roda no formulário e na API. */
export function validateNickname(raw: string): NicknameVerdict {
  const nickname = raw.trim();
  if (!NICKNAME.pattern.test(nickname) || !/[A-Za-z0-9]/.test(nickname)) return "invalid";
  const folded = foldNickname(nickname);
  const look = lookalike(nickname);
  if (EXACT_FOLDED.has(folded) || isReservedWithDigits(nickname) || RESERVED_LOOK.has(look) || look.includes(BRAND_LOOK) || containsBlocked(folded)) {
    return "blocked";
  }
  return "ok";
}
