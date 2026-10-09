import { describe, expect, it } from "vitest";
import { clickFeedback } from "@/interaction/click-feedback";

describe("clickFeedback (todo clique responde)", () => {
  it("em link ou botão: clique cheio, com onda", () => {
    expect(clickFeedback({ interactive: true, ownFeedback: false, keyboard: false })).toEqual({ sound: "click", ripple: true });
  });
  it("em área vazia: toque mais grave, com onda", () => {
    expect(clickFeedback({ interactive: false, ownFeedback: false, keyboard: false })).toEqual({ sound: "tap", ripple: true });
  });
  it("em zona com feedback próprio (arena, retrato): nada global, sem duplicar som nem onda", () => {
    expect(clickFeedback({ interactive: false, ownFeedback: true, keyboard: false })).toEqual({ sound: null, ripple: false });
    expect(clickFeedback({ interactive: true, ownFeedback: true, keyboard: false })).toEqual({ sound: null, ripple: false });
  });
  it("ativação por teclado (Enter/Espaço): som de clique, sem onda no ponteiro", () => {
    expect(clickFeedback({ interactive: true, ownFeedback: false, keyboard: true })).toEqual({ sound: "click", ripple: false });
  });
});
