import { describe, expect, it } from "vitest";
import { formatDate } from "@/lib/format";

describe("formatDate", () => {
  it("usa mês em minúsculas, como no pt-BR", () => {
    expect(formatDate("2026-02-19")).toBe("19 de fevereiro de 2026");
  });
  it("devolve a entrada quando a data é inválida", () => {
    expect(formatDate("ontem")).toBe("ontem");
  });
});
