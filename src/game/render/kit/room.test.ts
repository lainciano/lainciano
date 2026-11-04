import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { Own } from "../../layers/types";
import { createMaker } from "./maker";
import { boxFaces, knob } from "./parts";
import { buildCeiling, buildFloor, buildSkirting, buildWalls, roomBounds, roomLattice, wallSegments, type RoomSpec } from "./room";

const none = () => undefined;
const skin = (key: string) => ({ key, draw: none });
/** Sala de 4,5 × 5,0 × 2,6 m com porta de 1,2 m no norte e janela no leste (peitoril 1,0 m). */
const SPEC: RoomSpec = {
  width: 4.5,
  depth: 5,
  height: 2.6,
  step: 0.2,
  band: 1.1,
  seed: 7,
  openings: [
    { wall: "n", center: 0.5, width: 1.2, height: 2.1 },
    { wall: "l", center: -0.3, width: 1.0, height: 0.9, sill: 1.0 },
  ],
  skin: { walls: { n: skin("n"), s: skin("s"), o: skin("o"), l: skin("l") } },
};

const stubKit = {
  phong: (o: THREE.MeshPhongMaterialParameters) => new THREE.MeshPhongMaterial({ shininess: o.shininess }),
  basic: () => new THREE.MeshBasicMaterial(),
  texture: () => new THREE.CanvasTexture(null as unknown as HTMLCanvasElement),
  dispose() {},
};
const own = Object.assign(<T extends { dispose(): void }>(r: T) => r, { add() {} }) as Own;
const maker = () => createMaker(THREE, stubKit, own, "teste");

const has = (list: number[], v: number) => list.some((x) => Math.abs(x - v) < 1e-9);

describe("RoomSpec: vãos e grade", () => {
  it("a parede de 4,5 m com porta de 1,2 m dá dois trechos que somam 3,3 m e param nas bordas do vão", () => {
    const north = wallSegments(SPEC).filter((s) => s.wall === "n");
    expect(north).toHaveLength(2);
    expect(north[0].u0).toBeCloseTo(-2.25);
    expect(north[0].u1).toBeCloseTo(0.5 - 0.6);
    expect(north[1].u0).toBeCloseTo(0.5 + 0.6);
    expect(north[1].u1).toBeCloseTo(2.25);
    expect(north.reduce((s, t) => s + t.u1 - t.u0, 0)).toBeCloseTo(3.3);
  });

  it("janela (com peitoril) não interrompe o pé da parede", () => {
    expect(wallSegments(SPEC).filter((s) => s.wall === "l")).toHaveLength(1);
  });

  it("a grade tem as bordas dos vãos, o alto dos vãos, o peitoril e a barra", () => {
    const lat = roomLattice(SPEC);
    expect(has(lat.xs, -0.1) && has(lat.xs, 1.1)).toBe(true);
    expect(has(lat.zs, -0.8) && has(lat.zs, 0.2)).toBe(true);
    for (const y of [1.1, 2.1, 1.0, 1.9]) expect(has(lat.ys, y)).toBe(true);
    expect(lat.xs[0]).toBeCloseTo(-2.25);
    expect(lat.xs.at(-1)).toBeCloseTo(2.25);
    expect(lat.zs[0]).toBeCloseTo(-2.5);
    expect(lat.ys.at(-1)).toBeCloseTo(2.6);
  });

  it("o recorte do vão cai exatamente na grade: nenhuma célula da parede cruza a borda da porta", () => {
    const [north] = buildWalls(maker(), new THREE.Group(), SPEC);
    const pos = north.geometry.getAttribute("position");
    const door = { x0: -0.1, x1: 1.1, top: 2.1 };
    for (let i = 0; i < pos.count; i++) {
      const [x, y] = [pos.getX(i), pos.getY(i)];
      const inside = x > door.x0 + 1e-6 && x < door.x1 - 1e-6 && y < door.top - 1e-6;
      expect(inside).toBe(false);
    }
  });
});

describe("RoomSpec: peças", () => {
  it("monta piso, quatro paredes, teto e rodapé com a grade comum (sem decalque se a pele não tem)", () => {
    const m = maker();
    const root = new THREE.Group();
    const floor = buildFloor(m, root, SPEC);
    expect(floor.wear).toBeUndefined();
    expect(buildWalls(m, root, SPEC).map((w) => w.name)).toEqual(["parede-norte", "parede-sul", "parede-oeste", "parede-leste"]);
    expect(buildCeiling(m, root, SPEC).name).toBe("teto");
    const b = roomBounds(SPEC);
    const pos = floor.mesh.geometry.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      expect(pos.getX(i)).toBeGreaterThanOrEqual(b.minX - 1e-6);
      expect(pos.getX(i)).toBeLessThanOrEqual(b.maxX + 1e-6);
    }
  });

  it("com a pele de desgaste, o decalque reusa os vértices e o índice do piso", () => {
    const withWear: RoomSpec = { ...SPEC, skin: { ...SPEC.skin, wear: none } };
    const { mesh, wear } = buildFloor(maker(), new THREE.Group(), withWear);
    expect(wear).toBeDefined();
    expect(wear!.geometry.getAttribute("position")).toBe(mesh.geometry.getAttribute("position"));
    expect(wear!.geometry.getIndex()).toBe(mesh.geometry.getIndex());
  });

  it("o rodapé não cruza o vão da porta (para a 7 cm de cada borda)", () => {
    const root = new THREE.Group();
    const skirts = buildSkirting(maker(), root, SPEC);
    // norte: 2 trechos; sul, oeste e leste: 1 cada
    expect(skirts).toHaveLength(5);
    for (const s of skirts) {
      s.geometry.computeBoundingBox();
      const box = s.geometry.boundingBox!.clone().translate(s.position);
      const onNorth = Math.abs(box.min.z - -2.5) < 0.02 && box.max.z < -2.4;
      if (onNorth) expect(box.max.x <= -0.1 - 0.07 + 1e-6 || box.min.x >= 1.1 + 0.07 - 1e-6).toBe(true);
    }
  });
});

describe("parts", () => {
  it("boxFaces preenche os 7 papéis e usa `rest` no que faltar", () => {
    const a = new THREE.MeshBasicMaterial();
    const b = new THREE.MeshBasicMaterial();
    const out = boxFaces(a, { top: b });
    expect(out).toHaveLength(7);
    expect(out[2]).toBe(b);
    expect(out.filter((x) => x === a)).toHaveLength(6);
  });

  it("knob: escala e facetas mudam o perfil e a revolução", () => {
    const m = maker();
    const mat = new THREE.MeshBasicMaterial();
    const parent = new THREE.Group();
    const base = knob(m, mat, parent, [0, 0, 0]);
    const big = knob(m, mat, parent, [1, 2, 3], { scale: 2, facets: 6 });
    base.geometry.computeBoundingBox();
    big.geometry.computeBoundingBox();
    expect(big.geometry.boundingBox!.max.y).toBeCloseTo(base.geometry.boundingBox!.max.y * 2);
    expect(big.geometry.getAttribute("position").count).toBeLessThan(base.geometry.getAttribute("position").count);
    expect(big.position.toArray()).toEqual([1, 2, 3]);
    expect(base.castShadow).toBe(false);
  });
});
