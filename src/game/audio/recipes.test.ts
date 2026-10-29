import { describe, expect, it } from "vitest";
import type { SurfaceMaterial } from "../world/surfaces";
import { footstepParams } from "./footsteps";
import { FLASH_CLICK, GAME_SFX, HUM, objectRecipe, PAPER_RUSTLE, phoneKeyRecipe, RECIPE_PEAK_MAX, recipePeak, stepRecipe, type Recipe } from "./recipes";

const MATERIALS: SurfaceMaterial[] = ["granilite", "tapete", "madeira", "tabua-solta", "metal", "papel", "vidro", "tecido", "ceramica"];

function sane(r: Recipe, label: string) {
  expect((r.tones?.length ?? 0) + (r.bursts?.length ?? 0), `${label}: não vazia`).toBeGreaterThan(0);
  for (const t of r.tones ?? []) for (const v of [t.freq, t.dur, t.gain]) expect(v, label).toBeGreaterThan(0);
  for (const b of r.bursts ?? []) for (const v of [b.freq, b.dur, b.gain]) expect(v, label).toBeGreaterThan(0);
  expect(recipePeak(r), `${label}: pico`).toBeLessThanOrEqual(RECIPE_PEAK_MAX);
}

describe("receitas", () => {
  it("os quatro sons do puzzle existem e são sãos", () => {
    for (const name of ["knock", "key", "unlock", "force"] as const) sane(GAME_SFX[name], name);
  });
  it("passos de toda superfície e tomada são sãos; a tábua solta soma o rangido", () => {
    for (const m of MATERIALS) for (let seed = 0; seed < 4; seed++) sane(stepRecipe(footstepParams(m, seed)), `passo ${m}`);
    const creak = stepRecipe(footstepParams("tabua-solta", 0)).tones!.filter((t) => t.type === "sawtooth");
    expect(creak).toHaveLength(1);
    expect(stepRecipe(footstepParams("granilite", 0)).tones!.filter((t) => t.type === "sawtooth")).toHaveLength(0);
  });
  it("o peso do passo escala o ganho (agachado < normal < correndo)", () => {
    const p = footstepParams("granilite", 1);
    expect(recipePeak(stepRecipe(p, 0.55))).toBeLessThan(recipePeak(stepRecipe(p, 1)));
    expect(recipePeak(stepRecipe(p, 1))).toBeLessThan(recipePeak(stepRecipe(p, 1.2)));
  });
  it("objeto: pegar é mais leve que largar, em todo material; bater tem dois toques", () => {
    for (const m of MATERIALS) {
      for (const k of ["pick", "drop", "knock"] as const) sane(objectRecipe(m, k), `${k} ${m}`);
      expect(recipePeak(objectRecipe(m, "pick")), m).toBeLessThan(recipePeak(objectRecipe(m, "drop")));
      expect(objectRecipe(m, "knock").bursts, m).toHaveLength(2);
    }
  });
  it("lanterna, tecla e papel são sãos; teclas diferentes soam diferentes", () => {
    sane(FLASH_CLICK, "lanterna");
    sane(PAPER_RUSTLE, "papel");
    sane(phoneKeyRecipe("1"), "tecla");
    const freqs = new Set("0123456789#*".split("").map((k) => phoneKeyRecipe(k).bursts![0].freq));
    expect(freqs.size).toBeGreaterThan(3);
  });
  it("a ambiência calma é quase imperceptível e a tensão é maior", () => {
    expect(HUM.level.calm).toBeLessThan(0.02);
    expect(HUM.level.tension).toBeGreaterThan(HUM.level.calm);
    expect(HUM.cutoff.tension).toBeLessThan(HUM.cutoff.calm);
  });
});
