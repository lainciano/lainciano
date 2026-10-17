import { describe, expect, it } from "vitest";
import { EXPLORER_AREAS, isExplorerComplete, parseVisited, visitArea } from "@/interaction/relics/explorer";

describe("Explorador (spec 8.4)", () => {
  it("as 7 áreas da spec", () => {
    expect(EXPLORER_AREAS).toEqual(["home", "about", "work", "case", "blog", "post", "contact"]);
  });
  it("lê o storage com tolerância: lixo vira lista vazia, repetição some", () => {
    expect(parseVisited(null)).toEqual([]);
    expect(parseVisited("{")).toEqual([]);
    expect(parseVisited('{"a":1}')).toEqual([]);
    expect(parseVisited('["home","home","xyz","case"]')).toEqual(["home", "case"]);
  });
  it("visitar de novo não muda nada (mesma referência)", () => {
    const visited = visitArea([], "home");
    expect(visited).toEqual(["home"]);
    expect(visitArea(visited, "home")).toBe(visited);
  });
  it("completo só com as 7, em qualquer ordem", () => {
    const six = ["contact", "post", "blog", "case", "work", "about"] as const;
    expect(isExplorerComplete([...six])).toBe(false);
    expect(isExplorerComplete(visitArea([...six], "home"))).toBe(true);
  });
});
