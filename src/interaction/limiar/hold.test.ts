import { describe, expect, it } from "vitest";
import { HOLD_SHAKE_FROM, stepHold } from "@/interaction/limiar/hold";

describe("stepHold", () => {
  it("enche em holdFillMs segurando", () => {
    expect(stepHold(0, 1500, true)).toBe(1);
  });

  it("esvazia em holdDrainMs soltando", () => {
    expect(stepHold(1, 450, false)).toBeCloseTo(0.5, 10);
  });

  it("nunca sai de [0, 1]", () => {
    expect(stepHold(0.5, 1e9, true)).toBe(1);
    expect(stepHold(0.5, 1e9, false)).toBe(0);
    expect(stepHold(0, 100, false)).toBe(0);
  });

  it("tremor começa perto do fim", () => {
    expect(HOLD_SHAKE_FROM).toBe(0.8);
  });
});
