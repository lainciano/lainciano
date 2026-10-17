import { describe, expect, it } from "vitest";
import { parseReadingPref, resolveReading } from "@/interaction/reading-mode/resolve";

describe("parseReadingPref", () => {
  it("aceita on/off", () => {
    expect(parseReadingPref("on")).toBe("on");
    expect(parseReadingPref("off")).toBe("off");
  });
  it("qualquer outra coisa vira auto", () => {
    expect(parseReadingPref(null)).toBe("auto");
    expect(parseReadingPref("sim")).toBe("auto");
  });
});

describe("resolveReading", () => {
  it("off explícito vence reduced motion", () => expect(resolveReading("off", true)).toBe(false));
  it("on explícito vale sem reduced motion", () => expect(resolveReading("on", false)).toBe(true));
  it("auto segue reduced motion", () => {
    expect(resolveReading("auto", true)).toBe(true);
    expect(resolveReading("auto", false)).toBe(false);
  });
});
