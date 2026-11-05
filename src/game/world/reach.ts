import type { Vec2 } from "./collision";
import type { PlaceGraph } from "./places";

/** Alcance no chão (m, plano XZ). */
export const REACH_FLOOR = 1.45;
/** Alcance em 3D (m, do olho ao ponto mirado). */
export const REACH_3D = 2.4;

/** O ponto mirado está perto o bastante no chão e em 3D para interagir. */
export function inReach(
  player: Vec2,
  hit: { x: number; z: number; distance: number },
): boolean {
  return (
    hit.distance <= REACH_3D && Math.hypot(hit.x - player.x, hit.z - player.z) <= REACH_FLOOR
  );
}

/** Distância do lugar ao ponto de cada objeto e se cabe no alcance do chão. */
export function placesWithinReach(
  g: PlaceGraph,
  objects: { id: string; place: string; point: Vec2 }[],
): { id: string; distance: number; ok: boolean }[] {
  return objects.map((o) => {
    const place = g.places[o.place];
    const distance = place ? Math.hypot(o.point.x - place.x, o.point.z - place.z) : Infinity;
    return { id: o.id, distance, ok: distance <= REACH_FLOOR };
  });
}
