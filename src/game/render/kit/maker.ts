import type * as THREE from "three";
import type { Own } from "../../layers/types";
import type { MaterialKit } from "../materials";
import type { Draw } from "../paint";
import { chamferBox, type UvMode } from "../shapes";

/**
 * Fábrica de peças de uma camada (contratos 4b, bíblia 12b.4): cada geometria passa por `own` (Ruling 7); os
 * materiais e as texturas são do kit (compartilhados). Movida de `layers/cinza/models.ts`; o prefixo das
 * chaves de textura é da camada (a cinza usa `cinza`).
 */
export type Maker = {
  T: typeof THREE;
  kit: MaterialKit;
  own: Own;
  /** Textura do kit com a chave prefixada pela camada. */
  tex(key: string, draw: Draw, size: 64 | 128 | 256): THREE.CanvasTexture;
  mesh(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], parent: THREE.Object3D, x: number, y: number, z: number, o?: MeshOpts): THREE.Mesh;
  /** Caixa chanfrada (ver render/shapes.ts); `mat` único ou os 7 grupos (+x, −x, +y, −y, +z, −z, chanfro). */
  box(w: number, h: number, d: number, mat: THREE.Material | THREE.Material[], parent: THREE.Object3D, x: number, y: number, z: number, o?: BoxOpts): THREE.Mesh;
  /** Geometria com normais planas (peças facetadas: pernas, lápis); descarta a original. */
  flat(geo: THREE.BufferGeometry): THREE.BufferGeometry;
};

export type MeshOpts = { cast?: boolean; recv?: boolean; rx?: number; ry?: number; rz?: number; name?: string };
export type BoxOpts = MeshOpts & { chamfer?: number; uv?: UvMode; seg?: number };

export function createMaker(T: typeof THREE, kit: MaterialKit, own: Own, prefix: string): Maker {
  const mesh: Maker["mesh"] = (geo, mat, parent, x, y, z, o = {}) => {
    const m = new T.Mesh(own(geo), mat);
    m.position.set(x, y, z);
    m.rotation.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0);
    m.castShadow = o.cast ?? true;
    m.receiveShadow = o.recv ?? true;
    if (o.name) m.name = o.name;
    parent.add(m);
    return m;
  };
  return {
    T,
    kit,
    own,
    tex: (key, draw, size) => kit.texture(`${prefix}:${key}`, draw, size),
    mesh,
    box: (w, h, d, mat, parent, x, y, z, o = {}) => mesh(chamferBox(T, w, h, d, { chamfer: o.chamfer, uv: o.uv, seg: o.seg }), mat, parent, x, y, z, o),
    flat(geo) {
      const out = geo.toNonIndexed();
      geo.dispose();
      out.computeVertexNormals();
      return out;
    },
  };
}
