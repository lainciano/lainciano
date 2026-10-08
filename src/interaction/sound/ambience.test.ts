import { describe, expect, it } from "vitest";
import { AMBIENCE_FADE_S, resolveAmbience } from "@/interaction/sound/ambience-plan";
import { ORGAN } from "@/interaction/sound/ambiences/gravura";
import { WIND } from "@/interaction/sound/ambiences/ruina";
import { midiToFreq, randomBetween } from "@/interaction/sound/ambiences/shared";

describe("resolveAmbience", () => {
  it("começa a ambiência pedida quando o som pode tocar", () => {
    expect(resolveAmbience(null, "ruina", true)).toEqual({ stop: null, start: "ruina" });
  });
  it("não faz nada se já toca a pedida", () => {
    expect(resolveAmbience("ruina", "ruina", true)).toEqual({ stop: null, start: null });
  });
  it("troca de sala = para uma e começa a outra (crossfade)", () => {
    expect(resolveAmbience("ruina", "gravura", true)).toEqual({ stop: "ruina", start: "gravura" });
  });
  it("som desligado ou modo leitura param o que toca e não começam nada", () => {
    expect(resolveAmbience("ruina", "ruina", false)).toEqual({ stop: "ruina", start: null });
    expect(resolveAmbience(null, "gravura", false)).toEqual({ stop: null, start: null });
  });
  it("sair da sala sem outra pedida para a atual", () => {
    expect(resolveAmbience("gravura", null, true)).toEqual({ stop: "gravura", start: null });
  });
  it("crossfade de 1,2 s (spec 8.2)", () => {
    expect(AMBIENCE_FADE_S).toBe(1.2);
  });
});

describe("receitas (spec 8.3)", () => {
  it("notas MIDI viram as frequências do Ré menor grave", () => {
    expect(midiToFreq(69)).toBe(440);
    expect(ORGAN.notes.map((n) => Number(midiToFreq(n).toFixed(2)))).toEqual([73.42, 110, 174.61]);
  });
  it("órgão: ±4 cents, passa-baixas 700 Hz, LFO 0,05 Hz, reverb de 4 s", () => {
    expect(ORGAN).toMatchObject({ detuneCents: 4, cutoffHz: 700, lfoHz: 0.05, reverbS: 4 });
  });
  it("vento: passa-banda varrido de 300 a 900 Hz por LFO de 0,07 Hz", () => {
    expect(WIND).toMatchObject({ lowHz: 300, highHz: 900, lfoHz: 0.07 });
  });
  it("randomBetween usa o gerador recebido", () => {
    expect(randomBetween(10, 20, () => 0.5)).toBe(15);
  });
});
