import { describe, expect, it } from "vitest";
import { coverAltFor, sortProjects } from "@/lib/content/projects";
import type { ProjectMeta } from "@/types/content";

const p = (title: string, year: number): ProjectMeta => ({
  title, slug: title.toLowerCase(), year, tags: ["x"], coverImage: "/x.png", published: true, summary: "s",
});

describe("sortProjects", () => {
  it("ano desc, empate por título", () => {
    const out = sortProjects([p("NetAtlas", 2026), p("Vermolin.ux", 2025), p("Braz Skate", 2026), p("Coletiva", 2026)]);
    expect(out.map((x) => x.title)).toEqual(["Braz Skate", "Coletiva", "NetAtlas", "Vermolin.ux"]);
  });
  it("não muta a entrada", () => {
    const input = [p("B", 2025), p("A", 2026)];
    sortProjects(input);
    expect(input[0].title).toBe("B");
  });
});

describe("coverAltFor", () => {
  it("usa coverAlt quando existe", () => expect(coverAltFor({ title: "X", coverAlt: "Tela do X" })).toBe("Tela do X"));
  it("fallback descritivo", () => expect(coverAltFor({ title: "X" })).toBe("Captura da interface do projeto X"));
});
