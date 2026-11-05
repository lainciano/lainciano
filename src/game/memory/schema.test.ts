import { describe, expect, it } from "vitest";
import { initialMemory, parseMemory, validId } from "./schema";

const NOW = 1_700_000_000_000;

describe("memória: schema", () => {
  it("ausente → inicial", () => {
    expect(parseMemory(null, NOW)).toEqual(initialMemory(NOW));
  });
  it("corrompida → inicial, sem cópia", () => {
    expect(parseMemory("{não é json", NOW)).toEqual(initialMemory(NOW));
    expect(parseMemory(JSON.stringify({ ...initialMemory(NOW), version: 2 }), NOW)).toEqual(initialMemory(NOW));
    expect(parseMemory(JSON.stringify({ ...initialMemory(NOW), visits: "muitas" }), NOW)).toEqual(initialMemory(NOW));
  });
  it("válida passa intacta (ida e volta)", () => {
    const m = { ...initialMemory(NOW), visits: 3, arrivals: ["03:07"], examined: ["bilhete"], hints: { cinza: 2 } };
    expect(parseMemory(JSON.stringify(m), NOW)).toEqual(m);
  });
  it("listas acima do teto, ids com texto livre e chegada em timestamp são recusados", () => {
    const base = initialMemory(NOW);
    const bad = [
      { ...base, hesitations: Array.from({ length: 21 }, () => ({ id: "a", ms: 9000 })) },
      { ...base, examined: ["texto selecionado pelo visitante com espaços"] },
      { ...base, arrivals: ["2026-11-04T14:30:00-03:00"] },
    ];
    for (const m of bad) expect(parseMemory(JSON.stringify(m), NOW)).toEqual(initialMemory(NOW));
  });
  it("validId", () => {
    expect(validId("porta-norte")).toBe(true);
    expect(validId("lugar:mesa")).toBe(true);
    expect(validId("")).toBe(false);
    expect(validId("com espaço")).toBe(false);
    expect(validId("x".repeat(25))).toBe(false);
    expect(validId(3)).toBe(false);
  });
});
