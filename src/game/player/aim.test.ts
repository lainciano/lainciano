import { describe, expect, it } from "vitest";
import { AIM_READS, createAim, stepAim } from "./aim";

describe("mira com histerese", () => {
  it("só troca de alvo depois de N leituras seguidas iguais", () => {
    let s = createAim();
    for (let i = 0; i < AIM_READS - 1; i++) {
      s = stepAim(s, "mesa");
      expect(s.current).toBeNull();
    }
    s = stepAim(s, "mesa");
    expect(s.current).toBe("mesa");
  });
  it("uma leitura solta (borda do objeto) não derruba nem troca o alvo", () => {
    let s = createAim();
    for (let i = 0; i < AIM_READS; i++) s = stepAim(s, "mesa");
    s = stepAim(s, null);
    expect(s.current).toBe("mesa");
    s = stepAim(s, "caderno");
    s = stepAim(s, "mesa");
    expect(s.current).toBe("mesa");
    for (let i = 0; i < AIM_READS; i++) s = stepAim(s, null);
    expect(s.current).toBeNull();
  });
  it("leituras alternadas (oscilação) nunca trocam", () => {
    let s = createAim();
    for (let i = 0; i < 20; i++) s = stepAim(s, i % 2 ? "mesa" : "caderno");
    expect(s.current).toBeNull();
  });
});
