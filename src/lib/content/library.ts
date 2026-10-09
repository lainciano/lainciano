import type { PostMeta } from "@/types/content";
import { getAdjacent } from "./adjacent";

export type YearGroup = { year: number; posts: PostMeta[] };
export type Library = { featured: PostMeta | null; years: YearGroup[] };
export type PostNeighbors = { older: PostMeta | null; newer: PostMeta | null };

/** Posts por ano (desc), mantendo a ordem recebida dentro de cada ano. */
export function groupPostsByYear(posts: readonly PostMeta[]): YearGroup[] {
  const byYear = new Map<number, PostMeta[]>();
  for (const post of posts) {
    const year = Number(post.createdAt.slice(0, 4));
    const list = byYear.get(year) ?? [];
    list.push(post);
    byYear.set(year, list);
  }
  return [...byYear].sort(([a], [b]) => b - a).map(([year, list]) => ({ year, posts: list }));
}

/** Índice da Biblioteca (spec 7.6): o mais recente em destaque, o resto em livro-razão por ano. `posts` em ordem desc. */
export function splitLibrary(posts: readonly PostMeta[]): Library {
  const [featured = null, ...rest] = posts;
  return { featured, years: groupPostsByYear(rest) };
}

/** Anterior/próximo do post (mockup): "Anterior" é o mais antigo, "Próximo" o mais novo, sem wrap. `posts` em ordem desc. */
export function getPostNeighbors(posts: readonly PostMeta[], slug: string): PostNeighbors {
  const { previous, next } = getAdjacent(posts, slug, { wrap: false });
  return { older: next, newer: previous };
}
