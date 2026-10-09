import { describe, expect, it } from "vitest";
import { coverAltFor, displayUrl, getAdjacentProjects, getProjects, indexStack, linkKind, sortProjects } from "@/lib/content/projects";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

describe("kind", () => {
  it("todo projeto publicado declara o tipo (aparece nas lajes da Ruína)", () => {
    const kinds = Object.fromEntries(getProjects().map((project) => [project.slug, project.kind]));
    expect(kinds).toEqual({
      brazskate: "evento",
      coletiva: "escrita",
      crinaapp: "marketplace",
      netatlas: "rede",
      vermolinux: "gestão",
    });
  });
});

describe("indexStack", () => {
  it("as 2 primeiras tags, separadas por vírgula (spec 7.4, D11)", () => {
    expect(indexStack(["Next.js", "React", "TypeScript"])).toBe("Next.js, React");
    expect(indexStack(["Java"])).toBe("Java");
  });
});

describe("linkKind / displayUrl", () => {
  it("GitHub é repositório; o resto é site", () => {
    expect(linkKind("https://github.com/44lain/vermolin.ux")).toBe("repo");
    expect(linkKind("https://brazskate.vercel.app")).toBe("site");
  });
  it("host legível, sem protocolo, www e barra final", () => {
    expect(displayUrl("https://brazskate.vercel.app")).toBe("brazskate.vercel.app");
    expect(displayUrl("https://www.github.com/44lain/vermolin.ux/")).toBe("github.com/44lain/vermolin.ux");
  });
});

/** Capturas menores que 1600 px já conhecidas (pendência de conteúdo, spec 12/14 — D20). */
const KNOWN_SMALL_CAPTURES = ["vermolinux"];

/** Largura de um PNG lida do cabeçalho IHDR (bytes 16–19). */
function pngWidth(publicPath: string): number {
  return readFileSync(join(process.cwd(), "public", publicPath)).readUInt32BE(16);
}

describe("capturas da Câmara", () => {
  it("toda captura tem ≥ 1600 px de largura, exceto as pendências conhecidas", () => {
    const small = getProjects()
      .filter((project) => project.coverImage.endsWith(".png") && pngWidth(project.coverImage) < 1600)
      .map((project) => project.slug);
    expect(small).toEqual(KNOWN_SMALL_CAPTURES);
  });
});

describe("getAdjacentProjects", () => {
  it("o próximo do último projeto é o primeiro (wrap)", () => {
    const projects = getProjects();
    const last = projects[projects.length - 1];
    expect(getAdjacentProjects(last.slug).next?.slug).toBe(projects[0].slug);
  });
});

describe("papel (role) dos projetos — conferido nos MDX com o dono", () => {
  it("todo projeto publicado declara o papel, para a ficha da Câmara", () => {
    const missing = getProjects().filter((project) => !project.role).map((project) => project.slug);
    expect(missing).toEqual([]);
  });
});
