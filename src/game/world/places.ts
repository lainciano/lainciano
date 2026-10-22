import type { SaveV1 } from "../save/schema";
import type { Vec2 } from "./collision";

export type Place = {
  id: string;
  x: number;
  z: number;
  /** Direção horizontal do olhar ao chegar. */
  face: Vec2;
  /** Inclinação do olhar (rad). */
  pitch: number;
  name: string;
  hidden?: boolean;
  locked?: (s: SaveV1) => boolean;
};

export type PlaceGraph = { places: Record<string, Place>; edges: Record<string, string[]> };

/** Caminho mais curto (BFS) por nós abertos. Exclui `from`; `[]` se from === to; `null` sem caminho. */
export function pathBetween(
  g: PlaceGraph,
  from: string,
  to: string,
  open: (id: string) => boolean,
): string[] | null {
  if (!g.places[from] || !g.places[to]) return null;
  if (from === to) return [];
  if (!open(to)) return null;
  const prev = new Map<string, string>();
  const seen = new Set<string>([from]);
  const queue: string[] = [from];
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    for (const next of g.edges[cur] ?? []) {
      if (seen.has(next) || !g.places[next] || !open(next)) continue;
      seen.add(next);
      prev.set(next, cur);
      if (next === to) {
        const path: string[] = [];
        for (let n: string | undefined = to; n !== undefined && n !== from; n = prev.get(n)) {
          path.push(n);
        }
        return path.reverse();
      }
      queue.push(next);
    }
  }
  return null;
}

/** Lugar aberto mais próximo de `p`, até `maxDist` (inclusive); `null` se nenhum. */
export function nearestPlace(
  g: PlaceGraph,
  p: Vec2,
  open: (id: string) => boolean,
  maxDist = 0.7,
): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  for (const place of Object.values(g.places)) {
    if (!open(place.id)) continue;
    const d = Math.hypot(place.x - p.x, place.z - p.z);
    if (d <= maxDist && d < bestD) {
      best = place.id;
      bestD = d;
    }
  }
  return best;
}
