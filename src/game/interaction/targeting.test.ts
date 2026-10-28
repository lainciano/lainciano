import { describe, expect, it } from "vitest";
import type { InteractiveObject } from "../layers/types";
import { initialSave } from "../save/schema";
import { REACH_3D, REACH_FLOOR } from "../world/reach";
import { cycleOrder, nextInCycle, pickTarget, promptFor } from "./targeting";

const save = initialSave(0);

function obj(id: string, over: Partial<InteractiveObject> = {}): InteractiveObject {
  return { id, place: "mesa", roots: [], material: "madeira", verb: () => `examinar ${id}`, enabled: () => true, act: () => {}, ...over };
}
const always = () => true;

describe("pickTarget", () => {
  it("sem acerto não há alvo", () => {
    expect(pickTarget(null, { x: 0, z: 0 })).toBeNull();
  });

  it("acerto a 1,5 m no chão: alvo existe mas fora do alcance", () => {
    const t = pickTarget({ id: "mesa", x: 1.5, z: 0, distance: 1.6 }, { x: 0, z: 0 });
    expect(t).toEqual({ id: "mesa", inReach: false });
  });

  it("acerto a 1,0 m no chão e 1,3 m em 3D: ao alcance", () => {
    expect(pickTarget({ id: "mesa", x: 0, z: -1, distance: 1.3 }, { x: 0, z: 0 })).toEqual({ id: "mesa", inReach: true });
  });

  it("limites exatos: 1,45 m no chão e 2,4 m em 3D ainda alcançam; um milímetro além, não", () => {
    const p = { x: 0, z: 0 };
    expect(pickTarget({ id: "a", x: REACH_FLOOR, z: 0, distance: 2 }, p)?.inReach).toBe(true);
    expect(pickTarget({ id: "a", x: REACH_FLOOR + 0.001, z: 0, distance: 2 }, p)?.inReach).toBe(false);
    expect(pickTarget({ id: "a", x: 1, z: 0, distance: REACH_3D }, p)?.inReach).toBe(true);
    expect(pickTarget({ id: "a", x: 1, z: 0, distance: REACH_3D + 0.001 }, p)?.inReach).toBe(false);
  });

  it("perto no chão mas longe em 3D (alto na parede) não alcança", () => {
    expect(pickTarget({ id: "a", x: 1, z: 0, distance: 2.6 }, { x: 0, z: 0 })?.inReach).toBe(false);
  });
});

describe("aviso (promptFor): só de perto", () => {
  const o = obj("mesa");

  it("fora do alcance o Prompt não recebe texto", () => {
    const far = pickTarget({ id: "mesa", x: 1.5, z: 0, distance: 1.6 }, { x: 0, z: 0 });
    expect(promptFor(far, o, save, 0, false)).toBeNull();
  });

  it("sem alvo ou sem objeto, nada", () => {
    expect(promptFor(null, o, save, 0, false)).toBeNull();
    expect(promptFor({ id: "mesa", inReach: true }, undefined, save, 0, false)).toBeNull();
  });

  it("ao alcance mostra o verbo do objeto no estado atual", () => {
    expect(promptFor({ id: "mesa", inReach: true }, o, save, 0, false)).toEqual({ text: "examinar mesa", key: "press", progress: null });
  });

  it("objeto de segurar: verbo do hold, tecla 'hold' e o anel com o progresso", () => {
    const h = obj("porta", { hold: { seconds: 1.4, verb: "forçar a porta" } });
    expect(promptFor({ id: "porta", inReach: true }, h, save, 0, false)).toEqual({ text: "forçar a porta", key: "hold", progress: 0 });
    expect(promptFor({ id: "porta", inReach: true }, h, save, 0.5, true)).toEqual({ text: "forçar a porta", key: "hold", progress: 0.5 });
  });
});

describe("cycleOrder", () => {
  const list = [
    obj("mesa"),
    obj("bilhete"),
    obj("caderno", { enabled: () => false }),
    obj("armario", { place: "armario" }),
    obj("lapis", { roots: [] }),
  ];

  it("só os do lugar atual, na ordem da camada", () => {
    expect(cycleOrder(list, "mesa", save, always)).toEqual(["mesa", "bilhete", "lapis"]);
    expect(cycleOrder(list, "armario", save, always)).toEqual(["armario"]);
  });

  it("exclui o objeto cujo enabled é falso", () => {
    expect(cycleOrder(list, "mesa", save, always)).not.toContain("caderno");
  });

  it("exclui o que não está visível", () => {
    expect(cycleOrder(list, "mesa", save, (o) => o.id !== "bilhete")).toEqual(["mesa", "lapis"]);
  });

  it("sem lugar (em viagem ou fora de qualquer parada) não há ciclo", () => {
    expect(cycleOrder(list, null, save, always)).toEqual([]);
  });

  it("exclui o objeto encoberto enquanto o que o cobre está lá (a carta sob o celular)", () => {
    const withPhone = [obj("celular"), obj("carta", { hiddenBy: "celular" }), obj("mesa")];
    expect(cycleOrder(withPhone, "mesa", save, always)).toEqual(["celular", "mesa"]);
  });

  it("o encoberto volta quando quem o cobre sai (desabilitado ou invisível)", () => {
    let phoneOn = true;
    const withPhone = [obj("celular", { enabled: () => phoneOn }), obj("carta", { hiddenBy: "celular" })];
    expect(cycleOrder(withPhone, "mesa", save, always)).toEqual(["celular"]);
    phoneOn = false;
    expect(cycleOrder(withPhone, "mesa", save, always)).toEqual(["carta"]);
    phoneOn = true;
    expect(cycleOrder(withPhone, "mesa", save, (o) => o.id !== "celular")).toEqual(["carta"]);
  });

  it("encoberto por um id que não existe na camada não some", () => {
    expect(cycleOrder([obj("carta", { hiddenBy: "fantasma" })], "mesa", save, always)).toEqual(["carta"]);
  });
});

describe("nextInCycle", () => {
  it("avança e dá a volta", () => {
    const order = ["a", "b", "c"];
    expect(nextInCycle(order, null)).toBe("a");
    expect(nextInCycle(order, "a")).toBe("b");
    expect(nextInCycle(order, "c")).toBe("a");
  });
  it("origem desconhecida começa pelo primeiro; lista vazia não tem próximo", () => {
    expect(nextInCycle(["a", "b"], "z")).toBe("a");
    expect(nextInCycle([], "a")).toBeNull();
  });
});
