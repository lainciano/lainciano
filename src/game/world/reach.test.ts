import { describe, expect, it } from "vitest";
import type { PlaceGraph } from "./places";
import { inReach, placesWithinReach, REACH_3D, REACH_FLOOR } from "./reach";

describe("alcance", () => {
  it("constantes do contrato", () => {
    expect(REACH_FLOOR).toBe(1.45);
    expect(REACH_3D).toBe(2.4);
  });

  it("inReach combina distância no chão e em 3D", () => {
    const o = { x: 0, z: 0 };
    expect(inReach(o, { x: 1.4, z: 0, distance: 2.0 })).toBe(true);
    expect(inReach(o, { x: 1.5, z: 0, distance: 2.0 })).toBe(false);
    expect(inReach(o, { x: 1, z: 0, distance: 2.5 })).toBe(false);
  });

  it("limites exatos são inclusivos", () => {
    const o = { x: 0, z: 0 };
    expect(inReach(o, { x: REACH_FLOOR, z: 0, distance: REACH_3D })).toBe(true);
    expect(inReach(o, { x: REACH_FLOOR + 0.01, z: 0, distance: REACH_3D })).toBe(false);
    expect(inReach(o, { x: 1, z: 0, distance: REACH_3D + 0.01 })).toBe(false);
  });

  it("placesWithinReach mede do lugar ao ponto do objeto", () => {
    const g: PlaceGraph = {
      places: { p: { id: "p", x: 1, z: 1, face: { x: 0, z: 1 }, pitch: 0, name: "p" } },
      edges: { p: [] },
    };
    const r = placesWithinReach(g, [
      { id: "perto", place: "p", point: { x: 1, z: 2 } },
      { id: "longe", place: "p", point: { x: 1, z: 3 } },
      { id: "orfao", place: "nenhum", point: { x: 0, z: 0 } },
    ]);
    expect(r[0]).toEqual({ id: "perto", distance: 1, ok: true });
    expect(r[1]).toEqual({ id: "longe", distance: 2, ok: false });
    expect(r[2].ok).toBe(false);
  });
});
