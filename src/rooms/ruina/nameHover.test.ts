import { describe, expect, it } from "vitest";
import { NAME_HOVER, nameReaction } from "@/rooms/ruina/nameHover";

describe("nameReaction (abertura do protótipo, salas.html 373–386)", () => {
  it("mantém os números aprovados: raio 260 px, sobe até 40 px, avermelha acima de 55%", () => {
    expect(NAME_HOVER).toMatchObject({ radius: 260, lift: 40, hotAbove: 0.55 });
  });
  it("colada no ponteiro: sobe 40 px e fica vermelha", () => {
    expect(nameReaction(0)).toEqual({ lift: -40, hot: true });
  });
  it("a 260 px ou mais: parada e osso", () => {
    expect(nameReaction(260)).toEqual({ lift: -0, hot: false });
    expect(nameReaction(900)).toEqual({ lift: -0, hot: false });
  });
  it("só avermelha quando mais de 55% perto (distância < 117 px)", () => {
    expect(nameReaction(116).hot).toBe(true);
    expect(nameReaction(118).hot).toBe(false);
  });
  it("sobe proporcional à proximidade", () => {
    expect(nameReaction(130).lift).toBeCloseTo(-20);
  });
});
