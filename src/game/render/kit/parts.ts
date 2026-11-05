import type * as THREE from "three";
import type { Maker } from "./maker";

type V3 = readonly [number, number, number];

/** Os 7 materiais de uma caixa chanfrada (+x, −x, +y, −y, +z, −z, chanfro). */
export type FaceMaterials = {
  right?: THREE.Material;
  left?: THREE.Material;
  top?: THREE.Material;
  bottom?: THREE.Material;
  front?: THREE.Material;
  back?: THREE.Material;
  edge?: THREE.Material;
};

/** Os 7 materiais de uma caixa chanfrada a partir de papéis (o que faltar usa `rest`). */
export function boxFaces(rest: THREE.Material, o: FaceMaterials): THREE.Material[] {
  return [o.right ?? rest, o.left ?? rest, o.top ?? rest, o.bottom ?? rest, o.front ?? rest, o.back ?? rest, o.edge ?? rest];
}

/**
 * Puxador torneado de latão (perfil de lathe): base, pescoço e cabeça achatada. Eixo +z (sai da peça).
 * `scale` escala o perfil inteiro; `facets` são as faces da revolução (12 por padrão).
 */
export function knob(m: Maker, mat: THREE.Material, parent: THREE.Object3D, at: V3, o: { scale?: number; facets?: number } = {}) {
  const { T } = m;
  const s = o.scale ?? 1;
  const profile = [
    [0.0001, 0],
    [0.011, 0],
    [0.011, 0.002],
    [0.006, 0.006],
    [0.005, 0.011],
    [0.012, 0.016],
    [0.013, 0.021],
    [0.009, 0.025],
    [0.0001, 0.026],
  ].map(([r, y]) => new T.Vector2(r * s, y * s));
  return m.mesh(new T.LatheGeometry(profile, o.facets ?? 12), mat, parent, at[0], at[1], at[2], { rx: Math.PI / 2, cast: false });
}
