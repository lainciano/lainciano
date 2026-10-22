import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, SAVE_VERSION, initialSave, migrate, parseSave } from "./schema";

const NOW = 1_700_000_000_000;

describe("save schema", () => {
  it("usa a versão 1 e os ajustes padrão do contrato", () => {
    expect(SAVE_VERSION).toBe(1);
    expect(DEFAULT_SETTINGS).toEqual({
      fov: 62,
      bob: true,
      scares: true,
      subtitles: true,
      quality: "auto",
      sensitivity: 1,
    });
  });

  it("estado inicial: camada cinza, sem progresso", () => {
    expect(initialSave(NOW)).toEqual({
      version: 1,
      layer: "cinza",
      place: null,
      items: [],
      flags: {},
      puzzles: {},
      relics: [],
      settings: DEFAULT_SETTINGS,
      startedAt: NOW,
      playMs: 0,
    });
  });

  it("ausente vira o estado inicial, sem quebrado", () => {
    expect(parseSave(null, NOW)).toEqual({ save: initialSave(NOW), broken: null });
  });

  it("JSON inválido vira inicial e devolve o texto original em broken", () => {
    const raw = "{nao eh json";
    expect(parseSave(raw, NOW)).toEqual({ save: initialSave(NOW), broken: raw });
  });

  it("versão desconhecida vira inicial e broken", () => {
    const raw = JSON.stringify({ version: 99 });
    expect(parseSave(raw, NOW)).toEqual({ save: initialSave(NOW), broken: raw });
  });

  it("FOV fora de 55-80 é rejeitado e cai no inicial", () => {
    const bad = { ...initialSave(NOW), settings: { ...DEFAULT_SETTINGS, fov: 120 } };
    const raw = JSON.stringify(bad);
    expect(parseSave(raw, NOW)).toEqual({ save: initialSave(NOW), broken: raw });
  });

  it("qualidade fora de auto/480/360/240 é rejeitada", () => {
    const bad = { ...initialSave(NOW), settings: { ...DEFAULT_SETTINGS, quality: 720 } };
    const raw = JSON.stringify(bad);
    expect(parseSave(raw, NOW).broken).toBe(raw);
  });

  it("camada desconhecida é rejeitada", () => {
    const raw = JSON.stringify({ ...initialSave(NOW), layer: "porao" });
    expect(parseSave(raw, NOW).broken).toBe(raw);
  });

  it("save válido volta igual", () => {
    const save = {
      ...initialSave(NOW),
      layer: "antessala" as const,
      place: "mesa",
      items: ["chave"],
      flags: { porta: true },
      puzzles: { gaveta: { digits: [1, 2, 3] } },
      relics: [{ id: "limiar", clean: true }],
      settings: { ...DEFAULT_SETTINGS, quality: 360 as const, fov: 70 },
      playMs: 1234,
    };
    expect(parseSave(JSON.stringify(save), NOW)).toEqual({ save, broken: null });
  });

  it("campos extras são ignorados (versões futuras da mesma major)", () => {
    const raw = JSON.stringify({ ...initialSave(NOW), futuro: 1 });
    const { save, broken } = parseSave(raw, NOW);
    expect(broken).toBeNull();
    expect(save).toEqual(initialSave(NOW));
  });

  it("migrate devolve o mesmo objeto na versão 1", () => {
    const data = { ...initialSave(NOW) };
    expect(migrate(data)).toBe(data);
  });

  it("migrate deixa passar o que não conhece", () => {
    expect(migrate(null)).toBeNull();
    const futuro = { version: 99 };
    expect(migrate(futuro)).toBe(futuro);
  });
});
