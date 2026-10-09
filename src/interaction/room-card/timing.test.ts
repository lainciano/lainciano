import { describe, expect, it } from "vitest";
import { CARD, FAILSAFE_S, cardDurationS } from "@/interaction/room-card/timing";

describe("tempo do cartão de entrada de sala (alongado a pedido do dono)", () => {
  it("dura pelo menos 4 s para dar para ler o capítulo, o título e a epígrafe", () => {
    expect(cardDurationS()).toBeGreaterThanOrEqual(4);
  });
  it("mas não passa de 6 s (pode ser pulado a qualquer momento)", () => {
    expect(cardDurationS()).toBeLessThanOrEqual(6);
  });
  it("o temporizador de segurança do CSS sempre vem depois do fim natural", () => {
    expect(FAILSAFE_S).toBeGreaterThan(cardDurationS() + 1);
  });
  it("a parada com tudo visível (hold) é generosa", () => {
    expect(CARD.hold).toBeGreaterThanOrEqual(1.5);
  });
});
