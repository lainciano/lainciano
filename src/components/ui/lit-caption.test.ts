import { describe, expect, it } from "vitest";
import { isCaptionComplete, litCount, splitCaption } from "@/components/ui/lit-caption";
import { about, gravura } from "@/lib/content/copy";

describe("splitCaption", () => {
  it("quebra por espaço e marca palavra-chave por igualdade exata (com pontuação)", () => {
    expect(splitCaption(["Foo bar.", "  baz   qux "], ["bar."])).toEqual([
      [
        { text: "Foo", key: false },
        { text: "bar.", key: true },
      ],
      [
        { text: "baz", key: false },
        { text: "qux", key: false },
      ],
    ]);
  });
  it("o texto do Sobre contém as duas palavras-chave da spec 7.3", () => {
    const keys = splitCaption(about.paragraphs, gravura.captionKeywords)
      .flat()
      .filter((w) => w.key);
    expect(keys.map((w) => w.text)).toEqual(["cibersegurança.", "segurança"]);
  });
});

describe("litCount", () => {
  it("acende proporcional ao progresso, preso em 0–total", () => {
    expect(litCount(0, 10)).toBe(0);
    expect(litCount(0.5, 10)).toBe(5);
    expect(litCount(1, 10)).toBe(10);
    expect(litCount(1.2, 10)).toBe(10);
    expect(litCount(-1, 10)).toBe(0);
  });
});

describe("isCaptionComplete", () => {
  it("relíquia Leitura só acima de 99% (spec 7.3)", () => {
    expect(isCaptionComplete(0.99)).toBe(false);
    expect(isCaptionComplete(0.991)).toBe(true);
    expect(isCaptionComplete(1)).toBe(true);
  });
});
