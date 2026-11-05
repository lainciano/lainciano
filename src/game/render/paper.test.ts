import { describe, expect, it } from "vitest";
import { planPaper, wrapText } from "./paper";

// Medida falsa e estável: 10 px por caractere.
const measure = (s: string) => s.length * 10;

describe("wrapText", () => {
  it("quebra por palavras sem passar da largura", () => {
    const lines = wrapText("a lâmpada balança sobre a mesa", 150, measure);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(measure(l)).toBeLessThanOrEqual(150);
    expect(lines.join(" ")).toBe("a lâmpada balança sobre a mesa");
  });

  it("guarda as quebras do autor e o respiro entre parágrafos (linha vazia)", () => {
    expect(wrapText("um\n\ndois", 400, measure)).toEqual(["um", "", "dois"]);
  });

  it("uma palavra maior que a linha fica sozinha (não se perde)", () => {
    expect(wrapText("aaaaaaaaaaaaaaaaaaaa b", 100, measure)).toEqual(["aaaaaaaaaaaaaaaaaaaa", "b"]);
  });

  it("texto vazio não gera linhas", () => {
    expect(wrapText("", 400, measure)).toEqual([]);
  });

  it("espaços nas pontas e repetidos não viram palavras vazias", () => {
    expect(wrapText("  oi   você  ", 400, measure)).toEqual(["oi você"]);
  });
});

describe("planPaper", () => {
  it("a folha cresce com o número de linhas, entre um piso e um teto", () => {
    const short = planPaper(3, false);
    const long = planPaper(14, false);
    expect(long.h).toBeGreaterThan(short.h);
    expect(short.h).toBeGreaterThanOrEqual(520);
    expect(planPaper(200, false).h).toBeLessThanOrEqual(1100);
  });

  it("a assinatura ganha espaço próprio", () => {
    expect(planPaper(6, true).h).toBeGreaterThan(planPaper(6, false).h);
  });

  it("a letra encolhe quando o texto não cabe, mas não abaixo de um mínimo legível", () => {
    const fit = planPaper(8, false);
    const tight = planPaper(40, false);
    expect(tight.size).toBeLessThan(fit.size);
    expect(planPaper(400, false).size).toBeGreaterThanOrEqual(24);
  });

  it("largura fixa e margens simétricas", () => {
    const p = planPaper(5, false);
    expect(p.w).toBe(760);
    expect(p.textW).toBe(p.w - 2 * p.marginX);
  });
});
