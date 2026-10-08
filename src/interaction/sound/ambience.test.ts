import { describe, expect, it } from "vitest";
import { AMBIENCE_FADE_S, AMBIENCE_FLOOR, ambienceLevel, resolveAmbience } from "@/interaction/sound/ambience-plan";
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

describe("ambiências das demais áreas (spec 8.3)", () => {
  it("vela: senoide de 55 Hz + ruído rosa filtrado com crepitar raro", async () => {
    const { CANDLE } = await import("@/interaction/sound/ambiences/vela");
    expect(CANDLE).toMatchObject({ humHz: 55 });
    expect(CANDLE.crackleEveryMinMs).toBeGreaterThanOrEqual(4000);
  });
  it("biblioteca: ruído marrom a ganho 0,02", async () => {
    const { LIBRARY } = await import("@/interaction/sound/ambiences/biblioteca");
    expect(LIBRARY.gain).toBe(0.02);
  });
  it("terminal: rede elétrica de 60 Hz com harmônicos, estalos de fio, ventoinha, disco e modem (poste de luz)", async () => {
    const { TERMINAL } = await import("@/interaction/sound/ambiences/terminal");
    expect(TERMINAL.mainsHz).toBe(60);
    expect(TERMINAL.harmonics).toEqual([120, 180, 240]);
    expect(TERMINAL).toMatchObject({ hum: 0.08, fanCutoffHz: 380, fan: 0.05, crackleHighpassHz: 3000, modemHz: [1200, 2200] });
    expect(TERMINAL.crackleBurstMs).toEqual([5, 30]);
    expect(TERMINAL.diskGroupSize).toEqual([2, 4]);
  });
  it("nova ambiência entra no tipo AmbienceName e no plano", () => {
    expect(resolveAmbience(null, "terminal", true)).toEqual({ stop: null, start: "terminal" });
    expect(resolveAmbience("vela", "biblioteca", true)).toEqual({ stop: "vela", start: "biblioteca" });
  });
});

describe("ambienceLevel (volume sobe e desce com a área visível)", () => {
  it("área inteira visível = volume cheio; fora da tela = piso, não silêncio abrupto", () => {
    expect(ambienceLevel(1)).toBe(1);
    expect(ambienceLevel(0)).toBe(AMBIENCE_FLOOR);
    expect(AMBIENCE_FLOOR).toBeGreaterThan(0);
    expect(AMBIENCE_FLOOR).toBeLessThan(0.5);
  });
  it("cresce de forma contínua com a visibilidade e prende fora de 0–1", () => {
    expect(ambienceLevel(0.5)).toBeGreaterThan(ambienceLevel(0.25));
    expect(ambienceLevel(2)).toBe(1);
    expect(ambienceLevel(-1)).toBe(AMBIENCE_FLOOR);
  });
});
