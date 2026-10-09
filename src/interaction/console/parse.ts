/** Minúsculas, sem acento, espaços colapsados: "Relíquias" → "reliquias" (spec 8.6, D5). */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export type ParsedCommand = { name: string; args: string[]; rest: string };

export function parseCommand(raw: string): ParsedCommand | null {
  const clean = normalize(raw);
  if (!clean) return null;
  const [name = "", ...args] = clean.split(" ");
  return { name, args, rest: args.join(" ") };
}

export function commonPrefix(words: readonly string[]): string {
  if (words.length === 0) return "";
  let prefix = words[0] ?? "";
  for (const word of words) {
    while (!word.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  return prefix;
}

export type Completion = { value: string; options: string[] };

/**
 * Tab: completa o nome do comando ou o primeiro argumento. Uma opção → completa e põe espaço;
 * várias → avança até o prefixo comum e devolve a lista; nada a completar → devolve a entrada intacta
 * (aí a ilha deixa o Tab sair do campo).
 */
export function complete(
  input: string,
  commands: readonly string[],
  argOptions: (command: string) => readonly string[],
): Completion {
  const untouched = { value: input, options: [] };
  const parts = normalize(input).split(" ").filter(Boolean);
  if (parts.length === 0) return untouched;
  const endsWithSpace = /\s$/.test(input);
  const completingCommand = parts.length === 1 && !endsWithSpace;
  const head = completingCommand ? [] : endsWithSpace ? parts : parts.slice(0, -1);
  if (head.length > 1) return untouched;
  const word = completingCommand ? parts[0]! : endsWithSpace ? "" : parts[parts.length - 1]!;
  const pool = completingCommand ? commands : argOptions(parts[0]!);
  const matches = pool.filter((option) => option.startsWith(word));
  if (matches.length === 0) return untouched;
  if (matches.length === 1) return { value: `${[...head, matches[0]].join(" ")} `, options: [] };
  const prefix = commonPrefix(matches);
  return { value: head.length ? `${head.join(" ")} ${prefix}` : prefix, options: matches };
}

export const HISTORY_MAX = 50;

/** `cursor` = índice da entrada mostrada; `entries.length` = linha nova (vazia). */
export type History = { entries: string[]; cursor: number };

export const EMPTY_HISTORY: History = { entries: [], cursor: 0 };

export function pushHistory(history: History, entry: string, max = HISTORY_MAX): History {
  const text = entry.trim();
  if (!text) return history;
  const last = history.entries[history.entries.length - 1];
  const entries = (last === text ? history.entries : [...history.entries, text]).slice(-max);
  return { entries, cursor: entries.length };
}

export function historyUp(history: History): { history: History; value: string | null } {
  if (history.entries.length === 0) return { history, value: null };
  const cursor = Math.max(0, history.cursor - 1);
  return { history: { ...history, cursor }, value: history.entries[cursor] ?? null };
}

export function historyDown(history: History): { history: History; value: string } {
  const cursor = Math.min(history.entries.length, history.cursor + 1);
  return { history: { ...history, cursor }, value: history.entries[cursor] ?? "" };
}
