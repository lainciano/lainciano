import { describe, expect, it } from "vitest";
import { surfaceAt, type SurfaceZone } from "./surfaces";

const zones: SurfaceZone[] = [
  { box: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 }, surface: "tapete" },
  { box: { minX: 0, maxX: 0.5, minZ: 0, maxZ: 0.5 }, surface: "tabua-solta" },
];

describe("surfaceAt", () => {
  it("devolve o fallback fora de qualquer zona", () => {
    expect(surfaceAt({ x: 3, z: 3 }, zones, "granilite")).toBe("granilite");
  });
  it("tapete dentro do granilite devolve tapete", () => {
    expect(surfaceAt({ x: -0.5, z: -0.5 }, zones, "granilite")).toBe("tapete");
  });
  it("a última zona que contém o ponto vence", () => {
    expect(surfaceAt({ x: 0.25, z: 0.25 }, zones, "granilite")).toBe("tabua-solta");
  });
  it("sem zonas devolve o fallback", () => {
    expect(surfaceAt({ x: 0, z: 0 }, [], "madeira")).toBe("madeira");
  });
});
