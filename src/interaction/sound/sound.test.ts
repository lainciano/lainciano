import { describe, expect, it } from "vitest";
import { parseSoundPref, shouldPlay } from "@/interaction/sound/policy";
import { SFX } from "@/interaction/sound/sfx";

describe("shouldPlay", () => {
  it("só toca com som on e fora do modo leitura", () => {
    expect(shouldPlay("on", false)).toBe(true);
    expect(shouldPlay("on", true)).toBe(false);
    expect(shouldPlay("off", false)).toBe(false);
    expect(shouldPlay(null, false)).toBe(false);
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
