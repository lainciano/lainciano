import { createHash } from "node:crypto";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { triangleCount } from "../../render/slab";
import type { Own } from "../types";
import { createMaker } from "./models";
import { buildCinzaScene } from "./scene";

/** Kit sem canvas: materiais reais, texturas vazias (os desenhos de textura não entram na impressão). */
const stubKit = {
  phong: (o: THREE.MeshPhongMaterialParameters) => new THREE.MeshPhongMaterial({ shininess: o.shininess }),
  basic: () => new THREE.MeshBasicMaterial(),
  texture: () => new THREE.CanvasTexture(null as unknown as HTMLCanvasElement),
  dispose() {},
};
const own = Object.assign(<T extends { dispose(): void }>(r: T) => r, { add() {} }) as Own;

/** Impressão da geometria de cada malha: nome, triângulos, grupos e hash das posições/uvs em mundo (1e-5). */
async function fingerprint() {
  const root = new THREE.Group();
  await buildCinzaScene(createMaker(THREE, stubKit, own), root, async () => {});
  root.updateMatrixWorld(true);
  const meshes: { name: string; tris: number; groups: number; hash: string }[] = [];
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const geo = o.geometry as THREE.BufferGeometry;
    const h = createHash("sha1");
    const pos = geo.getAttribute("position");
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      h.update(`${v.x.toFixed(5)},${v.y.toFixed(5)},${v.z.toFixed(5)};`);
    }
    const uv = geo.getAttribute("uv");
    for (let i = 0; uv && i < uv.count; i++) h.update(`${uv.getX(i).toFixed(5)},${uv.getY(i).toFixed(5)};`);
    meshes.push({ name: o.name, tris: triangleCount(geo), groups: geo.groups.length, hash: h.digest("hex").slice(0, 12) });
  });
  return { total: meshes.reduce((s, m) => s + m.tris, 0), meshes };
}

/**
 * Valores medidos ANTES de a casca sair para o kit de sala (B1): o refator não pode mudar nenhuma geometria da
 * cinza. Se mudar de propósito, a razão vai no commit e os valores são remedidos (e as fotos @slow, regeneradas).
 */
const BEFORE = { total: 16018, meshes: 112, hash: "a792d8d9d9feb607" };

describe("sala cinza: geometria", () => {
  it("tem os mesmos triângulos e vértices de antes do kit de sala", async () => {
    const fp = await fingerprint();
    const hash = createHash("sha1")
      .update(fp.meshes.map((m) => `${m.name}:${m.tris}:${m.groups}:${m.hash}`).join("|"))
      .digest("hex")
      .slice(0, 16);
    expect({ total: fp.total, meshes: fp.meshes.length, hash }).toEqual(BEFORE);
  });

  it("a casca vem do kit: o piso, as paredes e o rodapé estão na cena", async () => {
    const fp = await fingerprint();
    const names = fp.meshes.map((m) => m.name);
    for (const n of ["piso", "piso-desgaste", "parede-norte", "parede-sul", "parede-oeste", "parede-leste", "teto"]) expect(names).toContain(n);
  });
});
