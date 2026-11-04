import type * as THREE from "three";
import type { Own } from "../layers/types";
import { bakeVertexLight, type BakeOptions } from "./bake";
import { mergeGeometries, triangleCount, type MergePart } from "./slab";

/**
 * Lote estático (B3, risco R1 do plano 1B): menos chamadas de desenho por quadro sem mudar o que se vê.
 *
 * - `createStaticBatch`: junta a geometria ESTÁTICA e NÃO interativa por chave `material + castShadow +
 *   receiveShadow + renderOrder` num mesh por chave (já com a matriz de mundo; geometria multimaterial separada por
 *   grupo). Com `material`, cada material de origem vira o do lote (o assado do kit, `kit.baked`); se o do lote
 *   tem `userData.bakedLight`, a luz fixa é assada no atributo `color` do vértice (`bake`, ver `bake.ts`). As geometrias de origem são
 *   descartadas e as malhas saem da cena; as novas passam pelo `own`.
 * - Nunca entra no lote: malha com `userData.dynamic` ou `userData.interactive` nela ou num ancestral até o objeto
 *   adicionado (o que se mexe e o que é `root` de `InteractiveObject` ficam soltos), malha invisível, instanciada,
 *   com ossos ou morph, e material-lista sem grupos (o three não desenharia nada).
 * - `compactMaterialGroups`: para as malhas que ficam SOLTAS (interativas), junta os grupos que usam o MESMO
 *   material (a caixa chanfrada de 7 faces com 2 materiais desenha 2 vezes, não 7). Não mescla malhas: cada uma
 *   continua sendo ela, com os mesmos materiais (só a lista sem repetição) e a mesma posição na cena.
 * Lógica pura (`materialRanges`, `compactRanges`, `batchKey`) separada da que toca three, para testar sem WebGL.
 */

export type GroupLike = { start: number; count: number; materialIndex?: number };
export type Range = { start: number; count: number };

/** Faixas do índice por material (sem grupos: tudo no material 0). Grupos vazios saem; `count` infinito vai ao fim. */
export function materialRanges(groups: readonly GroupLike[], indexCount: number): { material: number; start: number; count: number }[] {
  if (groups.length === 0) return indexCount > 0 ? [{ material: 0, start: 0, count: indexCount }] : [];
  const out: { material: number; start: number; count: number }[] = [];
  for (const g of groups) {
    const start = Math.max(0, g.start);
    const count = Math.min(g.count, indexCount - start);
    if (count > 0) out.push({ material: g.materialIndex ?? 0, start, count });
  }
  return out;
}

/** Agrupa as faixas pela chave do material (a identidade dele), na ordem da 1ª aparição; faixas vizinhas se juntam. */
export function compactRanges<K>(groups: readonly GroupLike[], keys: readonly K[], indexCount: number): { key: K; ranges: Range[] }[] {
  const slots: { key: K; ranges: Range[] }[] = [];
  for (const r of materialRanges(groups, indexCount)) {
    const key = keys[r.material];
    if (key === undefined) continue;
    let slot = slots.find((s) => s.key === key);
    if (!slot) slots.push((slot = { key, ranges: [] }));
    const last = slot.ranges[slot.ranges.length - 1];
    if (last && last.start + last.count === r.start) last.count += r.count;
    else slot.ranges.push({ start: r.start, count: r.count });
  }
  return slots;
}

/** Chave do lote: material, sombra (lança/recebe) e ordem de desenho. */
export const batchKey = (materialId: number, cast: boolean, recv: boolean, order: number): string => `${materialId}|${cast ? 1 : 0}|${recv ? 1 : 0}|${order}`;

export type StaticBatchOptions = {
  /** Material do lote para cada material de origem (padrão: o mesmo). O assado do kit é `kit.baked`. */
  material?(source: THREE.Material): THREE.Material;
  /** Luz e AO assadas no vértice (só nos materiais do lote com `userData.bakedLight`), no espaço do `root`. */
  bake?: BakeOptions;
  /** Prefixo do nome das malhas do lote (debug). */
  name?: string;
};

export type StaticBatch = {
  /** Registra um objeto (e o que há dentro dele) para o lote; o que não pode entrar fica solto. */
  add(obj: THREE.Object3D): void;
  /** Monta as malhas do lote no `root`, tira as de origem da cena e descarta as geometrias delas. */
  build(root: THREE.Object3D): { meshes: number; triangles: number };
};

const flagged = (o: THREE.Object3D) => o.userData.dynamic === true || o.userData.interactive === true;

/** A malha pode entrar no lote? (ver o topo do arquivo) */
function batchable(mesh: THREE.Mesh, top: THREE.Object3D): boolean {
  if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh) return false;
  const geo = mesh.geometry as THREE.BufferGeometry;
  if (!geo.getAttribute("position") || Object.keys(geo.morphAttributes).length > 0) return false;
  if (Array.isArray(mesh.material) && geo.groups.length === 0) return false;
  for (let o: THREE.Object3D | null = mesh; o; o = o.parent) {
    if (!o.visible || flagged(o)) return false;
    if (o === top) break;
  }
  return true;
}

export function createStaticBatch(three: typeof THREE, own: Own, opts: StaticBatchOptions = {}): StaticBatch {
  const tops: THREE.Object3D[] = [];
  const meshes = new Set<THREE.Mesh>();
  let built = false;
  return {
    add(obj) {
      if (built) throw new Error("lote: add depois do build");
      tops.push(obj);
      obj.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh && batchable(mesh, obj)) meshes.add(mesh);
      });
    },
    build(root) {
      if (built) throw new Error("lote: build duas vezes");
      built = true;
      root.updateWorldMatrix(true, false);
      const toRoot = root.matrixWorld.clone().invert();
      const ids = new Map<THREE.Material, number>();
      const buckets = new Map<string, { material: THREE.Material; cast: boolean; recv: boolean; order: number; label: string; parts: MergePart[] }>();
      const sources = new Set<THREE.BufferGeometry>();
      for (const mesh of meshes) {
        mesh.updateWorldMatrix(true, false);
        const matrix = toRoot.clone().multiply(mesh.matrixWorld);
        const geo = mesh.geometry as THREE.BufferGeometry;
        const indexCount = geo.index ? geo.index.count : geo.getAttribute("position").count;
        const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const groups = Array.isArray(mesh.material) ? geo.groups : [];
        for (const r of materialRanges(groups, indexCount)) {
          const source = list[r.material];
          if (!source) continue;
          if (!ids.has(source)) ids.set(source, ids.size);
          const key = batchKey(ids.get(source)!, mesh.castShadow, mesh.receiveShadow, mesh.renderOrder);
          let bucket = buckets.get(key);
          if (!bucket) {
            bucket = { material: source, cast: mesh.castShadow, recv: mesh.receiveShadow, order: mesh.renderOrder, label: labelOf(mesh), parts: [] };
            buckets.set(key, bucket);
          }
          const whole = r.start === 0 && r.count === indexCount;
          bucket.parts.push({ geo, matrix, range: whole ? undefined : { start: r.start, count: r.count } });
        }
        sources.add(geo);
      }
      let triangles = 0;
      let count = 0;
      for (const bucket of buckets.values()) {
        const merged = own(mergeGeometries(three, bucket.parts));
        const material = opts.material ? opts.material(bucket.material) : bucket.material;
        if (material.userData.bakedLight === true && opts.bake) bakeVertexLight(three, merged, opts.bake);
        const mesh = new three.Mesh(merged, material);
        mesh.name = `${opts.name ?? "lote"}:${bucket.label || count}`;
        mesh.castShadow = bucket.cast;
        mesh.receiveShadow = bucket.recv;
        mesh.renderOrder = bucket.order;
        mesh.matrixAutoUpdate = false;
        root.add(mesh);
        mesh.updateMatrixWorld(true);
        triangles += triangleCount(merged);
        count += 1;
      }
      for (const mesh of meshes) mesh.removeFromParent();
      for (const geo of sources) geo.dispose();
      // Grupos que ficaram vazios (o tapete, o lápis…) saem também.
      for (const top of tops) if (!(top as THREE.Mesh).isMesh && !hasMesh(top)) top.removeFromParent();
      return { meshes: count, triangles };
    },
  };
}

/** Nome para debug: o da malha ou o do ancestral nomeado mais próximo (a 1ª que abriu a chave). */
function labelOf(mesh: THREE.Object3D): string {
  for (let o: THREE.Object3D | null = mesh; o; o = o.parent) if (o.name) return o.name;
  return "";
}

function hasMesh(o: THREE.Object3D): boolean {
  let found = false;
  o.traverse((n) => {
    if ((n as THREE.Mesh).isMesh) found = true;
  });
  return found;
}

/**
 * Junta os grupos que usam o mesmo material nas malhas multimaterial (indexadas) sob `root`. Devolve as chamadas de
 * desenho dessas malhas antes e depois. Não mexe em malha de um material só nem em geometria sem índice.
 */
export function compactMaterialGroups(three: typeof THREE, root: THREE.Object3D): { before: number; after: number } {
  let before = 0;
  let after = 0;
  // Geometria usada por mais de uma malha fica como está (os grupos são da geometria; as listas, de cada malha).
  const users = new Map<THREE.BufferGeometry, number>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) users.set(mesh.geometry, (users.get(mesh.geometry) ?? 0) + 1);
  });
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !Array.isArray(mesh.material)) return;
    const geo = mesh.geometry as THREE.BufferGeometry;
    const index = geo.getIndex();
    if (!index || geo.groups.length === 0 || users.get(geo) !== 1) return;
    const materials = mesh.material;
    const slots = compactRanges(geo.groups, materials, index.count);
    before += materialRanges(geo.groups, index.count).length;
    after += slots.length;
    const src = index.array;
    const total = slots.reduce((s, slot) => s + slot.ranges.reduce((t, r) => t + r.count, 0), 0);
    const next = new (src.constructor as Uint32ArrayConstructor)(total);
    geo.clearGroups();
    let at = 0;
    slots.forEach((slot, k) => {
      const start = at;
      for (const r of slot.ranges) {
        next.set(src.subarray(r.start, r.start + r.count), at);
        at += r.count;
      }
      geo.addGroup(start, at - start, k);
    });
    geo.setIndex(new three.BufferAttribute(next, 1));
    mesh.material = slots.map((s) => s.key);
  });
  return { before, after };
}
