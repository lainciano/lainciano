import { describe, expect, it } from "vitest";
import { cssTimeMs } from "@/lib/css-time";

describe("cssTimeMs", () => {
  it("lê milissegundos e segundos", () => {
    expect(cssTimeMs("150ms", 0)).toBe(150);
    expect(cssTimeMs(" 0.5s", 0)).toBe(500);
    expect(cssTimeMs(".25s ", 0)).toBe(250);
  });

  it("vazio ou inválido cai no padrão", () => {
    expect(cssTimeMs("", 120)).toBe(120);
    expect(cssTimeMs("fast", 120)).toBe(120);
    expect(cssTimeMs("150", 120)).toBe(120);
  });
});
