import { describe, expect, it } from "vitest";
import { CHAPTERS, chapterFor, shouldShowCard } from "@/interaction/room-card/chapters";

describe("chapterFor (jornada: Ruína → Projetos → Câmara → Gravura → Biblioteca → Terminal)", () => {
  it("mapeia cada rota ao seu capítulo, na ordem da história", () => {
    expect(chapterFor("/")?.numeral).toBe("I");
    expect(chapterFor("/work")?.numeral).toBe("II");
    expect(chapterFor("/work/brazskate")?.numeral).toBe("III");
    expect(chapterFor("/about")?.numeral).toBe("IV");
    expect(chapterFor("/blog")?.numeral).toBe("V");
    expect(chapterFor("/blog/algum-post")?.numeral).toBe("V");
    expect(chapterFor("/contact")?.numeral).toBe("VI");
  });
  it("rota desconhecida (404) não tem capítulo", () => {
    expect(chapterFor("/nada-aqui")).toBeNull();
  });
  it("seis capítulos, numerais romanos únicos e sequenciais", () => {
    expect(CHAPTERS.map((c) => c.numeral)).toEqual(["I", "II", "III", "IV", "V", "VI"]);
    expect(new Set(CHAPTERS.map((c) => c.id)).size).toBe(6);
  });
  it("todo capítulo tem título, epígrafe e total", () => {
    for (const chapter of CHAPTERS) {
      expect(chapter.title.length).toBeGreaterThan(0);
      expect(chapter.epigraph.length).toBeGreaterThan(0);
    }
  });
});

describe("shouldShowCard (só ao entrar numa área diferente)", () => {
  it("mudou de capítulo: mostra", () => {
    expect(shouldShowCard("/", "/work")).toBe(true);
    expect(shouldShowCard("/contact", "/")).toBe(true);
  });
  it("mesma área (lista → post, case → outro case): não repete o cartão", () => {
    expect(shouldShowCard("/blog", "/blog/x")).toBe(false);
    expect(shouldShowCard("/work/a", "/work/b")).toBe(false);
  });
  it("sem rota anterior (primeira carga) ou destino sem capítulo: não mostra", () => {
    expect(shouldShowCard(null, "/about")).toBe(false);
    expect(shouldShowCard("/", "/nada")).toBe(false);
  });
});
