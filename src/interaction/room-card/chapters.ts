import { chapters as copy } from "@/lib/content/copy";

export type ChapterId = "ruina" | "projetos" | "camara" | "gravura" | "biblioteca" | "terminal";

export type Chapter = { id: ChapterId; numeral: string; title: string; epigraph: string };

/** A jornada recomendada pelas portas de fim de página (spec 6.3): da Ruína ao Terminal. */
export const CHAPTERS: readonly Chapter[] = (
  [
    ["ruina", "I"],
    ["projetos", "II"],
    ["camara", "III"],
    ["gravura", "IV"],
    ["biblioteca", "V"],
    ["terminal", "VI"],
  ] as const
).map(([id, numeral]) => ({ id, numeral, title: copy[id].title, epigraph: copy[id].epigraph }));

function chapterId(pathname: string): ChapterId | null {
  if (pathname === "/") return "ruina";
  if (pathname === "/work") return "projetos";
  if (pathname.startsWith("/work/")) return "camara";
  if (pathname === "/about") return "gravura";
  if (pathname === "/blog" || pathname.startsWith("/blog/")) return "biblioteca";
  if (pathname === "/contact") return "terminal";
  return null;
}

export function chapterFor(pathname: string): Chapter | null {
  const id = chapterId(pathname);
  return CHAPTERS.find((chapter) => chapter.id === id) ?? null;
}

/** O cartão aparece ao entrar numa área diferente — não na primeira carga nem dentro da mesma área. */
export function shouldShowCard(previous: string | null, next: string): boolean {
  if (previous === null) return false;
  const to = chapterId(next);
  return to !== null && to !== chapterId(previous);
}
