import { describe, expect, it } from "vitest";
import { getPostNeighbors, groupPostsByYear, splitLibrary } from "@/lib/content/library";
import type { PostMeta } from "@/types/content";

const post = (slug: string, createdAt: string): PostMeta => ({
  slug,
  createdAt,
  title: slug,
  excerpt: "",
  tags: [],
  published: true,
});

// Ordem de getPosts(): data decrescente.
const POSTS = [
  post("abr-26", "2026-04-10"),
  post("mar-26", "2026-03-25"),
  post("fev-26", "2026-02-19"),
  post("dez-25", "2025-12-20"),
  post("dez-25b", "2025-12-13"),
];

describe("splitLibrary (índice da Biblioteca, spec 7.6)", () => {
  it("o mais recente vira destaque e sai dos grupos", () => {
    const { featured, years } = splitLibrary(POSTS);
    expect(featured?.slug).toBe("abr-26");
    expect(years.flatMap((group) => group.posts.map((p) => p.slug))).toEqual(["mar-26", "fev-26", "dez-25", "dez-25b"]);
  });
  it("sem posts: sem destaque e sem anos", () => {
    expect(splitLibrary([])).toEqual({ featured: null, years: [] });
  });
  it("um só post: só o destaque", () => {
    expect(splitLibrary([POSTS[0]])).toEqual({ featured: POSTS[0], years: [] });
  });
});

describe("groupPostsByYear", () => {
  it("anos em ordem decrescente, posts na ordem recebida", () => {
    expect(groupPostsByYear(POSTS.slice(1)).map(({ year, posts }) => [year, posts.map((p) => p.slug)])).toEqual([
      [2026, ["mar-26", "fev-26"]],
      [2025, ["dez-25", "dez-25b"]],
    ]);
  });
  it("entrada fora de ordem não duplica o ano", () => {
    const groups = groupPostsByYear([POSTS[3], POSTS[1], POSTS[4]]);
    expect(groups.map((group) => group.year)).toEqual([2026, 2025]);
    expect(groups[1].posts.map((p) => p.slug)).toEqual(["dez-25", "dez-25b"]);
  });
});

describe("getPostNeighbors (anterior = mais antigo, próximo = mais novo; sem wrap)", () => {
  it("no meio: os dois lados", () => {
    expect(getPostNeighbors(POSTS, "fev-26")).toEqual({ older: POSTS[3], newer: POSTS[1] });
  });
  it("o mais novo só tem anterior; o mais antigo só tem próximo", () => {
    expect(getPostNeighbors(POSTS, "abr-26")).toEqual({ older: POSTS[1], newer: null });
    expect(getPostNeighbors(POSTS, "dez-25b")).toEqual({ older: null, newer: POSTS[3] });
  });
  it("slug ausente: nenhum vizinho", () => {
    expect(getPostNeighbors(POSTS, "nao-existe")).toEqual({ older: null, newer: null });
  });
});
