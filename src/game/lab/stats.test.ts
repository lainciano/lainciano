import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { measure } from "./stats";

describe("estatísticas do laboratório", () => {
  it("um grupo com 2 malhas de 12 triângulos e o mesmo material", () => {
    const mat = new THREE.MeshBasicMaterial();
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat), new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1), mat));
    expect(measure(g)).toMatchObject({ triangles: 24, meshes: 2, materials: 1, calls: 2 });
  });

  it("ignora o que está invisível (não desenha) e conta subárvores aninhadas", () => {
    const g = new THREE.Group();
    const inner = new THREE.Group();
    g.add(inner);
    inner.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    const hidden = new THREE.Group();
    hidden.visible = false;
    hidden.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    g.add(hidden);
    const off = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    off.visible = false;
    g.add(off);
    expect(measure(g)).toMatchObject({ triangles: 12, meshes: 1, materials: 1, calls: 1 });
  });

  it("material em lista conta uma chamada por grupo e os triângulos do grupo", () => {
    const geo = new THREE.BoxGeometry(); // 6 grupos de 2 triângulos
    const mats = [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()];
    geo.clearGroups();
    geo.addGroup(0, 12, 0);
    geo.addGroup(12, 12, 1);
    geo.addGroup(24, 12, 2);
    const mesh = new THREE.Mesh(geo, mats);
    expect(measure(mesh)).toMatchObject({ triangles: 12, meshes: 1, materials: 3, calls: 3 });
  });

  it("junta as texturas pelo mapa e lista o tipo dos materiais", () => {
    const map = new THREE.Texture({ width: 64, height: 64 } as unknown as HTMLImageElement);
    const a = new THREE.MeshPhongMaterial({ map });
    const b = new THREE.MeshPhongMaterial({ map });
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(), a), new THREE.Mesh(new THREE.BoxGeometry(), b));
    const s = measure(g);
    expect(s.materials).toBe(2);
    expect(s.textures).toEqual([{ name: "", size: 64 }]);
    expect(s.materialTypes).toEqual({ MeshPhongMaterial: 2 });
  });
});
