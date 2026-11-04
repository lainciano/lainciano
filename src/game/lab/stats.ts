import type * as THREE from "three";

/**
 * Números de um modelo (laboratório, só debug): triângulos, malhas, chamadas de desenho, materiais e texturas da
 * subárvore. Só conta o que o three desenharia: o que está invisível (o objeto ou um ancestral) fica de fora. Sem
 * `three` em tempo de execução (duck typing por `isMesh`), para o teste rodar em node.
 */
export type ModelStats = {
  triangles: number;
  meshes: number;
  /** Chamadas de desenho: uma por malha de material único, uma por grupo quando o material é uma lista. */
  calls: number;
  materials: number;
  /** Quantas vezes cada tipo de material aparece (por material único). */
  materialTypes: Record<string, number>;
  /** Texturas únicas (o `name` é a chave do kit) e o lado em px. */
  textures: { name: string; size: number }[];
};

const TEXTURE_SLOTS = ["map", "alphaMap", "aoMap", "bumpMap", "emissiveMap", "lightMap", "normalMap", "specularMap", "envMap"] as const;

const geometryTriangles = (g: THREE.BufferGeometry): number => (g.index ? g.index.count : (g.getAttribute("position")?.count ?? 0)) / 3;

export function measure(root: THREE.Object3D): ModelStats {
  const materials = new Set<THREE.Material>();
  const textures = new Map<THREE.Texture, { name: string; size: number }>();
  let triangles = 0;
  let meshes = 0;
  let calls = 0;

  const addMaterial = (m: THREE.Material) => {
    materials.add(m);
    const slots = m as unknown as Record<string, THREE.Texture | null | undefined>;
    for (const slot of TEXTURE_SLOTS) {
      const t = slots[slot];
      if (!t || textures.has(t)) continue;
      const image = t.image as { width?: number } | undefined;
      textures.set(t, { name: t.name, size: image?.width ?? 0 });
    }
  };

  const walk = (o: THREE.Object3D) => {
    if (!o.visible) return;
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      meshes++;
      const geo = mesh.geometry;
      if (Array.isArray(mesh.material)) {
        const list = mesh.material;
        for (const m of list) addMaterial(m);
        const groups = geo.groups.filter((g) => list[g.materialIndex ?? 0]);
        // Lista de materiais sem grupos não desenha nada no three; contar uma chamada inteira é o lado conservador.
        if (groups.length === 0) {
          calls++;
          triangles += geometryTriangles(geo);
        } else {
          for (const g of groups) {
            calls++;
            triangles += g.count / 3;
          }
        }
      } else {
        addMaterial(mesh.material);
        calls++;
        triangles += geometryTriangles(geo);
      }
    }
    for (const child of o.children) walk(child);
  };
  walk(root);

  const materialTypes: Record<string, number> = {};
  for (const m of materials) materialTypes[m.type] = (materialTypes[m.type] ?? 0) + 1;
  return { triangles, meshes, calls, materials: materials.size, materialTypes, textures: [...textures.values()] };
}
