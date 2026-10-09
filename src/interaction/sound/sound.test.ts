import { describe, expect, it } from "vitest";
import { parseSoundPref, shouldPlay } from "@/interaction/sound/policy";
import { BELL, NOISE, SFX } from "@/interaction/sound/sfx";

describe("shouldPlay", () => {
  it("só toca com som on, fora do modo leitura e depois de um gesto", () => {
    expect(shouldPlay("on", false, true)).toBe(true);
    expect(shouldPlay("on", true, true)).toBe(false);
    expect(shouldPlay("off", false, true)).toBe(false);
    expect(shouldPlay(null, false, true)).toBe(false);
  });
  it("nunca toca antes do primeiro gesto, mesmo com preferência on", () => {
    expect(shouldPlay("on", false, false)).toBe(false);
  });
});

describe("parseSoundPref", () => {
  it("aceita on/off e rejeita o resto", () => {
    expect(parseSoundPref("on")).toBe("on");
    expect(parseSoundPref("off")).toBe("off");
    expect(parseSoundPref(null)).toBeNull();
    expect(parseSoundPref("yes")).toBeNull();
  });
});

describe("SFX", () => {
  it("toda nota é audível, curta e baixa", () => {
    for (const tones of Object.values(SFX)) {
      expect(tones.length).toBeGreaterThan(0);
      for (const t of tones) {
        expect(t.freq).toBeGreaterThanOrEqual(20);
        expect(t.freq).toBeLessThanOrEqual(20_000);
        expect(t.dur).toBeGreaterThan(0);
        expect(t.dur).toBeLessThanOrEqual(1);
        expect(t.gain).toBeLessThanOrEqual(0.08);
      }
    }
  });
});

describe("NOISE", () => {
  it("toda rajada é curta, baixa e numa faixa audível", () => {
    for (const bursts of Object.values(NOISE)) {
      expect(bursts.length).toBeGreaterThan(0);
      for (const b of bursts) {
        expect(b.freq).toBeGreaterThanOrEqual(20);
        expect(b.freq).toBeLessThanOrEqual(20_000);
        expect(b.dur).toBeGreaterThan(0);
        expect(b.dur).toBeLessThanOrEqual(1);
        expect(b.gain).toBeLessThanOrEqual(0.08);
      }
    }
  });
  it("risco de troca de linha do Relicário: curto e agudo (spec 7.4)", () => {
    expect(NOISE.scratch).toEqual([{ dur: 0.04, gain: 0.03, filter: "highpass", freq: 3200 }]);
  });
});

describe("SFX das salas (Fase 2)", () => {
  it("existem as receitas da Ruína e da Gravura", () => {
    for (const name of ["collapse", "restore", "impact", "case", "hold", "drip"] as const) {
      expect(SFX[name].length).toBeGreaterThan(0);
    }
  });
  it("estrondo do desabar: senoide de 45 Hz com queda de pitch (spec 8.3)", () => {
    expect(SFX.collapse[0]).toMatchObject({ freq: 45, type: "sine" });
    expect(SFX.collapse[0].glideTo).toBeLessThan(45);
  });
  it("efeitos portados do protótipo", () => {
    expect(SFX.restore[0]).toMatchObject({ freq: 330, type: "triangle" });
    expect(SFX.case[0]).toMatchObject({ freq: 600, type: "triangle" });
    expect(SFX.hold[0]).toMatchObject({ freq: 110, type: "sawtooth", dur: 0.25 });
  });
});

describe("BELL (sino do Portal)", () => {
  it("a cauda audível dura pelo menos 3 s (queda de 40 dB), sem cortar quando a sala entra", () => {
    expect(BELL.tau * Math.log(100)).toBeGreaterThanOrEqual(3);
    expect(BELL.stopS).toBeGreaterThan(BELL.tau * Math.log(1000));
  });
  it("razão FM 1:3.5 (spec 8.3)", () => {
    expect(BELL.modRatio).toBe(3.5);
  });
});
