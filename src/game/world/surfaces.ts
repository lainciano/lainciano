import type { Box2, Vec2 } from "./collision";

export type SurfaceMaterial =
  | "granilite"
  | "tapete"
  | "madeira"
  | "tabua-solta"
  | "metal"
  | "papel"
  | "vidro"
  | "tecido"
  | "ceramica";

export type SurfaceZone = { box: Box2; surface: SurfaceMaterial };

/** Material sob `p`: a última zona que o contém vence; senão `fallback`. */
export function surfaceAt(
  p: Vec2,
  zones: readonly SurfaceZone[],
  fallback: SurfaceMaterial,
): SurfaceMaterial {
  for (let i = zones.length - 1; i >= 0; i--) {
    const b = zones[i].box;
    if (p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ) return zones[i].surface;
  }
  return fallback;
}
