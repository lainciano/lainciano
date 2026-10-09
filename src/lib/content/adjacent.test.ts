import { describe, expect, it } from "vitest";
import { getAdjacent } from "@/lib/content/adjacent";

const items = ["a", "b", "c"].map((slug) => ({ slug }));

describe("getAdjacent com wrap (cases, spec 7.5)", () => {
  it("meio", () => {
    expect(getAdjacent(items, "b", { wrap: true })).toEqual({ previous: { slug: "a" }, next: { slug: "c" } });
  });
  it("último → primeiro e primeiro → último", () => {
    expect(getAdjacent(items, "c", { wrap: true }).next).toEqual({ slug: "a" });
    expect(getAdjacent(items, "a", { wrap: true }).previous).toEqual({ slug: "c" });
  });
});

describe("getAdjacent sem wrap (posts, Fase 5)", () => {
  it("pontas sem vizinho", () => {
    expect(getAdjacent(items, "a", { wrap: false })).toEqual({ previous: null, next: { slug: "b" } });
    expect(getAdjacent(items, "c", { wrap: false })).toEqual({ previous: { slug: "b" }, next: null });
  });
});

describe("getAdjacent — casos degenerados", () => {
  it("slug ausente ou lista de 1 item: sem vizinhos (nunca aponta para si mesmo)", () => {
    expect(getAdjacent(items, "z", { wrap: true })).toEqual({ previous: null, next: null });
    expect(getAdjacent([{ slug: "a" }], "a", { wrap: true })).toEqual({ previous: null, next: null });
  });
});
