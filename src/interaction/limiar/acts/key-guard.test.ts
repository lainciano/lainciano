import { describe, expect, it } from "vitest";
import { IDLE_GUARD, guardBlur, guardKeyDown, guardKeyUp } from "@/interaction/limiar/acts/key-guard";

describe("guarda de teclado dos atos", () => {
  it("Enter novo ativa; a autorrepetição não", () => {
    const first = guardKeyDown(IDLE_GUARD, "Enter", false);
    expect(first.allow).toBe(true);
    expect(guardKeyDown(first.state, "Enter", true).allow).toBe(false);
  });

  it("Enter que vinha apertado do ato anterior (só repetições) nunca ativa", () => {
    let state = IDLE_GUARD;
    for (let i = 0; i < 5; i++) {
      const result = guardKeyDown(state, "Enter", true);
      expect(result.allow).toBe(false);
      state = result.state;
    }
    expect(guardKeyUp(state, "Enter").allow).toBe(false);
  });

  it("espaço só ativa no keyup se o keydown novo foi no botão", () => {
    expect(guardKeyUp(IDLE_GUARD, " ").allow).toBe(false);
    const down = guardKeyDown(IDLE_GUARD, " ", false);
    const up = guardKeyUp(down.state, " ");
    expect(up.allow).toBe(true);
    expect(up.state).toEqual(IDLE_GUARD);
    // Segunda soltura sem novo keydown: não ativa de novo.
    expect(guardKeyUp(up.state, " ").allow).toBe(false);
  });

  it("espaço segurado de antes: repetições e keyup bloqueados", () => {
    const repeated = guardKeyDown(IDLE_GUARD, " ", true);
    expect(repeated.allow).toBe(false);
    expect(guardKeyUp(repeated.state, " ").allow).toBe(false);
  });

  it("perder o foco desarma; outras teclas passam", () => {
    const armed = guardKeyDown(IDLE_GUARD, " ", false).state;
    expect(guardKeyUp(guardBlur(armed), " ").allow).toBe(false);
    expect(guardKeyDown(IDLE_GUARD, "Tab", true).allow).toBe(true);
    expect(guardKeyUp(IDLE_GUARD, "a").allow).toBe(true);
  });
});
