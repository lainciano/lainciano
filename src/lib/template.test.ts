import { describe, expect, it } from "vitest";
import { fillTemplate } from "@/lib/template";

describe("fillTemplate (rótulo do servidor com valor do cliente)", () => {
  it("troca cada {marcador} pelo valor", () => {
    expect(fillTemplate("10 de 10 em {tempo}.", { tempo: "04:12" })).toBe("10 de 10 em 04:12.");
    expect(fillTemplate("nº {posicao} de {total}", { posicao: 3, total: 20 })).toBe("nº 3 de 20");
  });
  it("marcador sem valor fica como está (erro visível, nunca 'undefined')", () => {
    expect(fillTemplate("olá {nome}", {})).toBe("olá {nome}");
  });
});
