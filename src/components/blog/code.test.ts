import { describe, expect, it } from "vitest";
import { cleanCode } from "@/components/blog/code";

describe("cleanCode (o que o 'copiar' do bloco leva)", () => {
  it("tira as quebras de linha do fim (o MDX deixa uma)", () => {
    expect(cleanCode(":root {\n  --a: 1;\n}\n")).toBe(":root {\n  --a: 1;\n}");
    expect(cleanCode("x\n\n\n")).toBe("x");
  });
  it("preserva indentação e linhas em branco do meio", () => {
    expect(cleanCode("a\n\n  b")).toBe("a\n\n  b");
  });
  it("vazio continua vazio", () => {
    expect(cleanCode("")).toBe("");
  });
});
