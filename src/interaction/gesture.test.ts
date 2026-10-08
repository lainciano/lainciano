import { describe, expect, it } from "vitest";
import { LONG_PRESS_MS, exceedsSlop } from "@/interaction/gesture";

describe("toque longo (spec 6.5)", () => {
  it("segurar no toque = 400 ms", () => {
    expect(LONG_PRESS_MS).toBe(400);
  });
  it("até 10 px de deslocamento ainda é segurar; mais que isso é rolagem", () => {
    expect(exceedsSlop(6, 8)).toBe(false);
    expect(exceedsSlop(8, 7)).toBe(true);
  });
});
