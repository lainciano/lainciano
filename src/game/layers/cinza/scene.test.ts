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
  baked: (m: THREE.Material) => m,
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
 * Triângulos medidos ANTES do kit de sala (B1) e do lote (B3): nenhum dos dois pode mudar a geometria da cinza (o
 * total fica). O lote (B3) junta a casca, o rodapé, o tapete, o lápis e os detalhes de parede em uma malha por
 * material e os objetos soltos ficam com os grupos do mesmo material juntados: a impressão por malha mudou de
 * propósito (112 → AFTER.meshes malhas). Se mudar de novo, a razão vai no commit e os valores são remedidos.
 */
const TRIANGLES = 16018;
const AFTER = { meshes: 106, hash: "193d475bc37f11ac" };

describe("sala cinza: geometria", () => {
  it("tem os mesmos triângulos de antes do kit de sala e do lote", async () => {
    const fp = await fingerprint();
    const hash = createHash("sha1")
      .update(fp.meshes.map((m) => `${m.name}:${m.tris}:${m.groups}:${m.hash}`).join("|"))
      .digest("hex")
      .slice(0, 16);
    expect({ total: fp.total, meshes: fp.meshes.length, hash }).toEqual({ total: TRIANGLES, ...AFTER });
  });

  it("a casca vai para o lote; os interativos e a luminária ficam soltos", async () => {
    const fp = await fingerprint();
    const names = fp.meshes.map((m) => m.name);
    for (const n of ["piso", "piso-desgaste", "parede-norte", "parede-sul", "parede-oeste", "parede-leste", "teto", "tapete-topo"]) {
      expect(names).not.toContain(n);
      expect(names.some((x) => x.startsWith(`cinza-lote:${n}`))).toBe(true);
    }
    for (const n of ["mesa-tampo", "bilhete", "armario-porta", "porta-fresta"]) expect(names).toContain(n);
  });
});
