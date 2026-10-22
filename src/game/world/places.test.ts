import { describe, expect, it } from "vitest";
import { initialSave } from "../save/schema";
import { nearestPlace, pathBetween, type Place, type PlaceGraph } from "./places";

function place(id: string, x: number, z: number, extra: Partial<Place> = {}): Place {
  return { id, x, z, face: { x: 0, z: 1 }, pitch: 0, name: id, ...extra };
}

//  a - b - c - d
//      \_ e _/   (b-e-d é um desvio mais longo)
const g: PlaceGraph = {
  places: {
    a: place("a", 0, 0),
    b: place("b", 1, 0),
    c: place("c", 2, 0),
    d: place("d", 3, 0),
    e: place("e", 2, 2),
  },
  edges: {
    a: ["b"],
    b: ["a", "c", "e"],
    c: ["b", "d"],
    d: ["c", "e"],
    e: ["b", "d"],
  },
};
const allOpen = () => true;

describe("pathBetween", () => {
  it("acha o caminho mais curto e exclui a origem", () => {
    expect(pathBetween(g, "a", "d", allOpen)).toEqual(["b", "c", "d"]);
  });
  it("origem igual ao destino devolve caminho vazio", () => {
    expect(pathBetween(g, "a", "a", allOpen)).toEqual([]);
  });
  it("contorna um nó fechado quando há desvio", () => {
    expect(pathBetween(g, "a", "d", (id) => id !== "c")).toEqual(["b", "e", "d"]);
  });
  it("devolve null se um nó trancado corta o único caminho", () => {
    expect(pathBetween(g, "a", "d", (id) => id !== "b")).toBeNull();
  });
  it("devolve null se o destino está fechado ou não existe", () => {
    expect(pathBetween(g, "a", "d", (id) => id !== "d")).toBeNull();
    expect(pathBetween(g, "a", "zz", allOpen)).toBeNull();
  });
});

describe("nearestPlace", () => {
  it("escolhe o lugar aberto mais próximo", () => {
    expect(nearestPlace(g, { x: 1.4, z: 0.1 }, allOpen)).toBe("b");
  });
  it("ignora nós fechados", () => {
    expect(nearestPlace(g, { x: 1.4, z: 0.1 }, (id) => id !== "b")).toBe("c");
  });
  it("ignora os mais longes que 0,7", () => {
    expect(nearestPlace(g, { x: 1, z: 1 }, allOpen)).toBeNull();
    expect(nearestPlace(g, { x: 1, z: 0.69 }, allOpen)).toBe("b");
  });
  it("aceita maxDist customizado", () => {
    expect(nearestPlace(g, { x: 1, z: 1 }, allOpen, 1.1)).toBe("b");
  });
});

describe("Place.locked", () => {
  it("recebe o save e pode trancar o lugar", () => {
    const s = initialSave(0);
    const locked = place("x", 0, 0, { locked: (save) => !save.flags["chave"] });
    expect(locked.locked?.(s)).toBe(true);
    expect(locked.locked?.({ ...s, flags: { chave: true } })).toBe(false);
  });
});
