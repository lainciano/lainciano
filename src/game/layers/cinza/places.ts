import type { Box2 } from "../../world/collision";
import type { Place, PlaceGraph } from "../../world/places";

/**
 * Planta da sala cinza (Fase 1A, prova do motor). Lógica pura: o `scene.ts` monta os modelos nestas medidas, o
 * `places.test.ts` e o e2e leem as mesmas. Metros; x para leste, z para o sul (o norte é −z), y para cima.
 *
 *            norte (z −2) · porta trancada
 *   ┌──────────────────[porta]────────┐
 *   │ [  mesa  ]                       │
 *   │  ░tapete░  ·mesa       ·porta   │
 *   │  ░░░░░░░░                [arm.] │  leste
 *   │                ·armario  [arm.] │
 *   │          ·entrada               │
 *   └──────────────────────────────────┘
 */

export const ROOM = { minX: -2, maxX: 2, minZ: -2, maxZ: 2, h: 2.6 } as const;
export const PLAYER_RADIUS = 0.22;
/** Flag do save que abre a porta norte (trancada na 1A). */
export const DOOR_FLAG = "cinza:porta-norte";

/** Vão da porta na parede norte (x) e altura do vão. */
export const DOOR = { x0: 0.38, x1: 1.2, top: 2.08, wallZ: ROOM.minZ } as const;
/** Folha da porta: o vão menos os batentes (3 cm) e as folgas (3 mm de cada lado). */
export const DOOR_LEAF = { w: DOOR.x1 - DOOR.x0 - 0.066, h: 2.03 } as const;
/** Mesa de escrever: tampo de 1,2 × 0,68 m, a 0,76 m do chão, encostada perto da parede norte. */
export const TABLE = { x0: -1.75, x1: -0.55, z0: -1.7, z1: -1.02, top: 0.76 } as const;
/** Guarda-roupa de duas portas encostado na parede leste, frente para oeste. */
export const WARDROBE = { x0: 1.42, x1: 1.98, z0: -0.35, z1: 0.61, h: 1.92 } as const;
/** Tapete diante da mesa (zona de passo `tapete`). */
export const RUG = { x0: -1.85, x1: -0.25, z0: -0.85, z1: 0.25 } as const;

const center = (a: number, b: number) => (a + b) / 2;
export const TABLE_CENTER = { x: center(TABLE.x0, TABLE.x1), z: center(TABLE.z0, TABLE.z1) } as const;
/** Luz pendente sobre o meio da mesa; a lâmpada fica a ~0,95 m do tampo. */
export const LAMP = { x: TABLE_CENTER.x, z: TABLE_CENTER.z, bulbY: 1.71 } as const;

const dir = (x: number, z: number) => {
  const len = Math.hypot(x, z);
  return { x: x / len, z: z / len };
};

export const CINZA_PLACES: Record<string, Place> = {
  entrada: { id: "entrada", x: 0.25, z: 1.35, face: dir(0.16, -1), pitch: -0.04, name: "a entrada" },
  mesa: { id: "mesa", x: TABLE_CENTER.x, z: -0.45, face: dir(0.08, -1), pitch: -0.42, name: "a mesa" },
  armario: { id: "armario", x: 0.74, z: center(WARDROBE.z0, WARDROBE.z1), face: dir(1, 0), pitch: -0.08, name: "o armário" },
  porta: { id: "porta", x: center(DOOR.x0, DOOR.x1), z: -1.1, face: dir(0, -1), pitch: 0, name: "a porta" },
};

/** Grafo completo: a sala é aberta, toda aresta é andável (o teste prova com o raio do jogador). Simétrico. */
export const CINZA_GRAPH: PlaceGraph = {
  places: CINZA_PLACES,
  edges: {
    entrada: ["mesa", "armario", "porta"],
    mesa: ["entrada", "armario", "porta"],
    armario: ["entrada", "mesa", "porta"],
    porta: ["entrada", "mesa", "armario"],
  },
};

/** Paredes como caixas de 0,3 m por fora da sala (o jogador nunca sai, nem espiando). */
const WALL_T = 0.3;
export const WALL_COLLIDERS: Box2[] = [
  { minX: ROOM.minX - WALL_T, maxX: ROOM.maxX + WALL_T, minZ: ROOM.minZ - WALL_T, maxZ: ROOM.minZ },
  { minX: ROOM.minX - WALL_T, maxX: ROOM.maxX + WALL_T, minZ: ROOM.maxZ, maxZ: ROOM.maxZ + WALL_T },
  { minX: ROOM.minX - WALL_T, maxX: ROOM.minX, minZ: ROOM.minZ, maxZ: ROOM.maxZ },
  { minX: ROOM.maxX, maxX: ROOM.maxX + WALL_T, minZ: ROOM.minZ, maxZ: ROOM.maxZ },
];

/** Móveis: a projeção no chão de cada um (a mesa inteira, não só as pernas: não se anda por baixo dela). */
export const FURNITURE_COLLIDERS: Box2[] = [
  { minX: TABLE.x0, maxX: TABLE.x1, minZ: TABLE.z0, maxZ: TABLE.z1 },
  { minX: WARDROBE.x0 - 0.03, maxX: WARDROBE.x1, minZ: WARDROBE.z0 - 0.02, maxZ: WARDROBE.z1 + 0.02 },
];
