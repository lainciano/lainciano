import { describe, expect, it } from "vitest";
import { formatDate, formatShortDate } from "@/lib/format";

describe("formatDate", () => {
  it("usa mês em minúsculas, como no pt-BR", () => {
    expect(formatDate("2026-02-19")).toBe("19 de fevereiro de 2026");
  });
  it("devolve a entrada quando a data é inválida", () => {
    expect(formatDate("ontem")).toBe("ontem");
  });
});

describe("formatShortDate (livro-razão do Blog, mockup)", () => {
  it("dia sem zero à esquerda e mês de 3 letras minúsculo", () => {
    expect(formatShortDate("2026-03-25")).toBe("25 mar");
    expect(formatShortDate("2026-03-08")).toBe("8 mar");
    expect(formatShortDate("2025-12-20")).toBe("20 dez");
  });
  it("maio fica 'mai' (abreviação de 3 letras, como os outros)", () => {
    expect(formatShortDate("2025-05-01")).toBe("1 mai");
  });
  it("devolve a entrada quando a data é inválida", () => {
    expect(formatShortDate("ontem")).toBe("ontem");
    expect(formatShortDate("2026-13-01")).toBe("2026-13-01");
  });
});
