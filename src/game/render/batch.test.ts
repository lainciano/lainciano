import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { Own } from "../layers/types";
import { batchKey, compactMaterialGroups, compactRanges, createStaticBatch, materialRanges } from "./batch";
import { triangleCount } from "./slab";

function tracker() {
  const owned: { dispose(): void }[] = [];
  const own = Object.assign(<T extends { dispose(): void }>(r: T) => {
    owned.push(r);
    return r;
  }, { add() {} }) as Own;
  return { own, owned };
}

const box = (mat: THREE.Material | THREE.Material[], x: number, o: Partial<{ cast: boolean; recv: boolean }> = {}) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), mat);
  m.position.set(x, 0.25, x * 0.5);
  m.rotation.y = x * 0.3;
  m.castShadow = o.cast ?? true;
  m.receiveShadow = o.recv ?? true;
  return m;
};

const meshesOf = (root: THREE.Object3D) => {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
  });
  return out;
};

const worldBox = (root: THREE.Object3D) => {
  root.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(root, true);
};

describe("materialRanges / compactRanges (puras)", () => {
  it("sem grupos: tudo num material só", () => {
    expect(materialRanges([], 36)).toEqual([{ material: 0, start: 0, count: 36 }]);
  });

  it("grupos viram faixas; count infinito vai até o fim; vazios saem", () => {
    expect(materialRanges([{ start: 0, count: 6, materialIndex: 1 }, { start: 6, count: 0, materialIndex: 0 }, { start: 6, count: Infinity, materialIndex: 2 }], 18)).toEqual([
      { material: 1, start: 0, count: 6 },
      { material: 2, start: 6, count: 12 },
    ]);
  });

  it("junta as faixas que usam a mesma chave, na ordem da 1ª aparição", () => {
    const groups = [0, 1, 2, 3, 4, 5, 6].map((g) => ({ start: g * 6, count: 6, materialIndex: g }));
    const keys = ["v", "v", "top", "v", "v", "v", "edge"];
    expect(compactRanges(groups, keys, 42)).toEqual([
      { key: "v", ranges: [{ start: 0, count: 12 }, { start: 18, count: 18 }] },
      { key: "top", ranges: [{ start: 12, count: 6 }] },
      { key: "edge", ranges: [{ start: 36, count: 6 }] },
    ]);
  });

  it("a chave do lote separa material, sombra e ordem", () => {
    expect(batchKey(3, true, false, 0)).not.toBe(batchKey(3, true, true, 0));
    expect(batchKey(3, true, true, 0)).not.toBe(batchKey(4, true, true, 0));
    expect(batchKey(3, true, true, 1)).not.toBe(batchKey(3, true, true, 0));
  });
});

describe("createStaticBatch", () => {
  it("10 malhas com 2 materiais viram 2; triângulos e caixa preservados; origem descartada", () => {
    const { own, owned } = tracker();
    const a = new THREE.MeshPhongMaterial();
    const b = new THREE.MeshPhongMaterial();
    const root = new THREE.Group();
    const parts = Array.from({ length: 10 }, (_, i) => box(i % 2 ? a : b, i));
    root.add(...parts);
    const tris = parts.reduce((s, m) => s + triangleCount(m.geometry), 0);
    const before = worldBox(root);
    let disposed = 0;
    for (const m of parts) m.geometry.addEventListener("dispose", () => (disposed += 1));

    const batch = createStaticBatch(THREE, own);
    for (const m of parts) batch.add(m);
    const res = batch.build(root);

    const meshes = meshesOf(root);
    expect(res).toEqual({ meshes: 2, triangles: tris });
    expect(meshes).toHaveLength(2);
    expect(meshes.reduce((s, m) => s + triangleCount(m.geometry), 0)).toBe(tris);
    const after = worldBox(root);
    expect(after.min.distanceTo(before.min)).toBeLessThan(1e-6);
    expect(after.max.distanceTo(before.max)).toBeLessThan(1e-6);
    expect(disposed).toBe(10);
    for (const m of meshes) expect(owned).toContain(m.geometry);
  });

  it("separa por sombra (cast/recv) e copia as flags", () => {
    const { own } = tracker();
    const mat = new THREE.MeshPhongMaterial();
    const root = new THREE.Group();
    root.add(box(mat, 0, { cast: true }), box(mat, 1, { cast: false }), box(mat, 2, { cast: false }));
    const batch = createStaticBatch(THREE, own);
    for (const m of [...root.children]) batch.add(m);
    expect(batch.build(root).meshes).toBe(2);
    const casts = meshesOf(root).map((m) => m.castShadow).sort();
    expect(casts).toEqual([false, true]);
  });

  it("malha com userData.dynamic (ou dentro de um grupo dinâmico/interativo) fica de fora, solta", () => {
    const { own } = tracker();
    const mat = new THREE.MeshPhongMaterial();
    const root = new THREE.Group();
    const loose = box(mat, 3);
    loose.userData.dynamic = true;
    const holder = new THREE.Group();
    holder.userData.interactive = true;
    const inside = box(mat, 4);
    holder.add(inside);
    const stat = new THREE.Group();
    stat.add(box(mat, 0), box(mat, 1), loose, holder);
    root.add(stat);
    const batch = createStaticBatch(THREE, own);
    batch.add(stat);
    expect(batch.build(root).meshes).toBe(1);
    expect(loose.parent).toBe(stat);
    expect(inside.parent).toBe(holder);
  });

  it("geometria com 3 grupos é separada por material (e junta com as outras do mesmo material)", () => {
    const { own } = tracker();
    const mats = [new THREE.MeshPhongMaterial(), new THREE.MeshPhongMaterial(), new THREE.MeshPhongMaterial()];
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.clearGroups();
    geo.addGroup(0, 12, 0);
    geo.addGroup(12, 12, 1);
    geo.addGroup(24, 12, 2);
    const root = new THREE.Group();
    const multi = new THREE.Mesh(geo, mats);
    multi.castShadow = true;
    multi.receiveShadow = true;
    root.add(multi, box(mats[1], 2));
    const batch = createStaticBatch(THREE, own);
    batch.add(multi);
    batch.add(root.children[1]);
    const res = batch.build(root);
    expect(res).toEqual({ meshes: 3, triangles: 12 + 12 });
    const byMat = new Map(meshesOf(root).map((m) => [m.material as THREE.Material, triangleCount(m.geometry)]));
    expect(byMat.get(mats[0])).toBe(4);
    expect(byMat.get(mats[1])).toBe(4 + 12);
    expect(byMat.get(mats[2])).toBe(4);
  });

  it("material assado (userData.bakedLight) ganha o atributo color; sem ele, não", () => {
    const { own } = tracker();
    const lit = new THREE.MeshPhongMaterial();
    const unlit = new THREE.MeshBasicMaterial();
    const twin = new THREE.MeshPhongMaterial();
    twin.userData.bakedLight = true;
    const root = new THREE.Group();
    root.add(box(lit, 0), box(unlit, 1));
    const batch = createStaticBatch(THREE, own, {
      material: (m) => (m === lit ? twin : m),
      bake: { ambient: { color: 0xffffff, intensity: 0.4 } },
    });
    for (const m of [...root.children]) batch.add(m);
    batch.build(root);
    const meshes = meshesOf(root);
    const baked = meshes.find((m) => m.material === twin)!;
    const plain = meshes.find((m) => m.material === unlit)!;
    expect(baked.geometry.getAttribute("color").getX(0)).toBeCloseTo(0.4, 6);
    expect(plain.geometry.getAttribute("color")).toBeUndefined();
  });
});

describe("compactMaterialGroups", () => {
  it("caixa de 7 grupos com 2 materiais distintos vira 2 grupos (mesmos triângulos)", () => {
    const veneer = new THREE.MeshPhongMaterial();
    const edge = new THREE.MeshPhongMaterial();
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.addGroup(0, 0, 6);
    const mesh = new THREE.Mesh(geo, [veneer, veneer, veneer, veneer, veneer, veneer, edge]);
    const root = new THREE.Group();
    root.add(mesh);
    const tris = triangleCount(geo);
    const res = compactMaterialGroups(THREE, root);
    expect(res).toEqual({ before: 6, after: 1 });
    expect(mesh.material).toEqual([veneer]);
    expect(triangleCount(mesh.geometry)).toBe(tris);
    expect(mesh.geometry.groups).toEqual([{ start: 0, count: 36, materialIndex: 0 }]);
  });
});
