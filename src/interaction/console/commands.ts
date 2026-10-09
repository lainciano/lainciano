import { RELICS, type RelicId } from "@/interaction/relics/catalog";
import { about, terminal as copy } from "@/lib/content/copy";
import { normalize, parseCommand } from "./parse";

export type ConsoleProject = { slug: string; title: string; year: number; kind?: string };
export type ConsolePost = { slug: string; title: string; createdAt: string };
export type ConsoleData = { projects: ConsoleProject[]; posts: ConsolePost[]; email: string; availability: string };
export type ConsoleState = { won: readonly RelicId[]; sound: boolean; reading: boolean; platinum: boolean };

export type LineKind = "cmd" | "res" | "err";
export type ConsoleLine = { kind: LineKind; text: string };

export type ConsoleEffect =
  | { type: "navigate"; href: string }
  | { type: "copy"; text: string }
  | { type: "unlock"; id: RelicId }
  | { type: "sound"; on: boolean }
  | { type: "reading"; on: boolean }
  | { type: "clear" };

export type CommandStatus = "ok" | "error" | "denied";
export type CommandResult = { status: CommandStatus; lines: ConsoleLine[]; effects: ConsoleEffect[] };

/** Salas do `ir` (spec 8.6), na ordem da ajuda. */
export const DESTINATIONS = {
  home: "/",
  projetos: "/work",
  blog: "/blog",
  sobre: "/about",
  contato: "/contact",
} as const;

export const COMMANDS = [
  "ajuda",
  "ir",
  "projetos",
  "abrir",
  "blog",
  "ler",
  "sobre",
  "contato",
  "reliquias",
  "som",
  "leitura",
  "arremessar",
  "girar",
  "revelar",
  "cripta",
  "ranking",
  "limpar",
  "sudo",
] as const;

const ALIASES: ReadonlyMap<string, string> = new Map([
  ["help", "ajuda"],
  ["clear", "limpar"],
]);
const resolveAlias = (name: string): string => ALIASES.get(name) ?? name;
const SWITCH = ["on", "off"] as const;

/** Chave de busca: só letras e dígitos ("Vermolin.ux" → "vermolinux"). */
export function searchKey(text: string): string {
  return normalize(text).replace(/[^a-z0-9]/g, "");
}

/** Igualdade de slug/título primeiro; senão, prefixo de um dos dois (D5). */
export function findByPrefix<T extends { slug: string; title: string }>(items: readonly T[], query: string): T[] {
  const key = searchKey(query);
  if (!key) return [];
  const exact = items.filter((item) => searchKey(item.slug) === key || searchKey(item.title) === key);
  if (exact.length > 0) return exact;
  return items.filter((item) => searchKey(item.slug).startsWith(key) || searchKey(item.title).startsWith(key));
}

/** Opções do primeiro argumento para o Tab. */
export function argOptions(command: string, data: ConsoleData): readonly string[] {
  switch (resolveAlias(command)) {
    case "ir":
      return Object.keys(DESTINATIONS);
    case "abrir":
    case "revelar":
      return data.projects.map((project) => project.slug);
    case "ler":
      return data.posts.map((post) => post.slug);
    case "som":
    case "leitura":
      return SWITCH;
    default:
      return [];
  }
}

const ok = (lines: readonly string[], effects: ConsoleEffect[] = []): CommandResult => ({
  status: "ok",
  lines: lines.map((text) => ({ kind: "res", text })),
  effects,
});

const fail = (text: string): CommandResult => ({ status: "error", lines: [{ kind: "err", text }], effects: [] });

/** Resolve um único item por prefixo, ou devolve o erro certo (vazio, inexistente, ambíguo). */
function pick<T extends { slug: string; title: string }>(
  items: readonly T[],
  query: string,
  usage: string,
  notFound: (query: string) => string,
): T | CommandResult {
  if (!query) return fail(usage);
  const matches = findByPrefix(items, query);
  if (matches.length === 0) return fail(notFound(query));
  if (matches.length > 1) return fail(copy.ambiguous(matches.map((item) => item.slug)));
  return matches[0]!;
}

const isResult = (value: unknown): value is CommandResult =>
  typeof value === "object" && value !== null && "status" in value;

function toggle(arg: string | undefined, current: boolean, state: (on: boolean) => string, usage: string, type: "sound" | "reading") {
  if (arg === undefined) return ok([state(current)]);
  if (arg !== "on" && arg !== "off") return fail(usage);
  const on = arg === "on";
  return ok([state(on)], [{ type, on }]);
}

/** Executa uma linha do console (spec 8.6). Puro: a ilha aplica os efeitos. */
export function runCommand(raw: string, data: ConsoleData, state: ConsoleState): CommandResult | null {
  const parsed = parseCommand(raw);
  if (!parsed) return null;
  const name = resolveAlias(parsed.name);
  const { args, rest } = parsed;

  switch (name) {
    case "ajuda":
      return ok(copy.help);

    case "ir": {
      if (!rest) return fail(copy.goUsage);
      const room = Object.keys(DESTINATIONS).find((key) => key.startsWith(rest)) as keyof typeof DESTINATIONS | undefined;
      if (!room) return fail(copy.goUnknown(rest));
      return ok([copy.going(room)], [{ type: "navigate", href: DESTINATIONS[room] }]);
    }

    case "projetos": {
      if (data.projects.length === 0) return ok([copy.noProjects]);
      const width = Math.max(...data.projects.map((project) => project.title.length));
      return ok(
        data.projects.map((project) =>
          `${project.year}  ${project.title.toUpperCase().padEnd(width)}  ${project.kind ?? ""}`.trimEnd(),
        ),
      );
    }

    case "abrir": {
      const project = pick(data.projects, rest, copy.openUsage, copy.projectNotFound);
      if (isResult(project)) return project;
      return ok([copy.opening(project.title)], [{ type: "navigate", href: `/work/${project.slug}` }]);
    }

    case "blog":
      if (data.posts.length === 0) return ok([copy.noPosts]);
      return ok(data.posts.map((post) => `${post.createdAt.slice(0, 10)}  ${post.title}`));

    case "ler": {
      const post = pick(data.posts, rest, copy.readUsage, copy.postNotFound);
      if (isResult(post)) return post;
      return ok([copy.readingPost(post.title)], [{ type: "navigate", href: `/blog/${post.slug}` }]);
    }

    case "sobre":
      return ok([about.paragraphs[0] ?? "", copy.aboutMore]);

    case "contato":
      return ok([data.email, data.availability], [{ type: "copy", text: data.email }]);

    case "reliquias":
      return ok([
        ...RELICS.map((relic) =>
          state.won.includes(relic.id) ? `${relic.sigil} ${normalize(relic.name)}` : `${copy.lockedPrefix}${copy.locked}`,
        ),
        copy.relicsSummary(state.won.length, RELICS.length),
      ]);

    case "som":
      return toggle(args[0], state.sound, copy.soundState, copy.soundUsage, "sound");

    case "leitura":
      return toggle(args[0], state.reading, copy.readingState, copy.readingUsage, "reading");

    case "arremessar":
      return ok([copy.throwDone], [{ type: "unlock", id: "arremesso" }]);

    case "girar":
      return ok([copy.spinDone], [{ type: "unlock", id: "orbita" }]);

    case "revelar": {
      const project = pick(data.projects, rest, copy.revealUsage, copy.projectNotFound);
      if (isResult(project)) return project;
      return ok([copy.revealDone(project.title)], [{ type: "unlock", id: "lente" }]);
    }

    case "cripta":
      return ok([state.platinum ? copy.cryptSoon : copy.cryptLocked(state.won.length, RELICS.length)]);

    case "ranking":
      return ok([copy.rankingSoon]);

    case "limpar":
      return ok([], [{ type: "clear" }]);

    case "sudo":
      return { status: "denied", lines: [{ kind: "err", text: copy.sudo }], effects: [{ type: "unlock", id: "sudo" }] };

    default:
      return fail(copy.notFound(parsed.name));
  }
}
