import type * as THREE from "three";
import { protoColor } from "../../render/materials";
import { buildCeiling, buildFloor, buildSkirting, buildWalls, roomLattice, type RoomSpec } from "../../render/kit";
import { buildDoor, buildLamp, buildNote, buildNotebook, buildPencil, buildRug, buildTable, buildWallDetails, buildWardrobe, type Maker } from "./models";
import { DOOR, LAMP, ROOM, TABLE_CENTER } from "./places";
import * as tx from "./textures";

/**
 * Cena da sala cinza: monta a casca (piso, paredes, teto, rodapé) com o kit de sala (`render/kit`, a partir do
 * `CINZA_ROOM`), os modelos e as luzes. Todas as superfícies grandes saem da MESMA grade de linhas do kit
 * (`LATTICE`): onde o piso encontra a parede, ou duas paredes se encontram, os vértices coincidem.
 */

/** Luzes do protótipo 7 recalibradas na T6 (luz física do 0.186; ver render/shots/psxRef.ts). */
const LEGACY = Math.PI;
export const CINZA_LIGHTS = {
  ambient: { color: 0x1e1c1a, intensity: 0.15 * LEGACY },
  hemi: { sky: 0x3a4048, ground: 0x241a10, intensity: 0.1 * LEGACY },
  lamp: { color: 0xffb062, intensity: 1.64 * LEGACY, distance: 6.5, angle: 0.88, penumbra: 0.65, decay: 0.75 },
  fill: { color: 0xffa860, intensity: 0.23 * LEGACY, distance: 4.6, decay: 1 },
} as const;

/**
 * Sombra da luz pendente (Ruling 9). Receptores: o tampo a 0,95 m da lâmpada (texel ≈ 2·0,95·tan 0,88/1024 ≈
 * 2,3 mm) e o piso a 1,71 m (≈ 4,1 mm) até ~3 m nas bordas (≈ 7 mm). `normalBias` 0,0045 ≈ 1,1 texel no piso
 * sob a lâmpada e ≈ 2 no tampo: some a acne do piso e das paredes rasantes sem descolar a sombra do bilhete
 * (7 mm) nem do caderno (1,8 cm). A varredura e o teste de acne estão no relatório da T8 e no e2e.
 */
export const LAMP_SHADOW = { mapSize: 1024, near: 0.5, far: 6, bias: -0.0005, normalBias: 0.0045 } as const;

/** Planta da sala cinza para o kit (4 × 4 × 2,6 m, porta no norte); a pintura das paredes é desta sala. */
const W = ROOM.maxX - ROOM.minX;
const D = ROOM.maxZ - ROOM.minZ;
const doorU0 = DOOR.x0 - ROOM.minX;
const doorU1 = DOOR.x1 - ROOM.minX;
export const CINZA_ROOM: RoomSpec = {
  width: W,
  depth: D,
  height: ROOM.h,
  step: 0.2,
  band: tx.WALL_BAND,
  seed: 3000,
  openings: [{ wall: "n", center: (DOOR.x0 + DOOR.x1) / 2, width: DOOR.x1 - DOOR.x0, height: DOOR.top }],
  skin: {
    walls: {
      // Norte (z −2): sujeira de mão em volta da porta, interruptor, maré de umidade.
      n: { key: "parede-n", draw: tx.drawWall(1201, W, [{ t: "door", x0: doorU0, x1: doorU1, top: DOOR.top }, { t: "switch", x: doorU1 + 0.28, y: 1.25 }, { t: "tide", x: 0.5, w: 0.8, h: 0.6 }]) },
      s: { key: "parede-s", draw: tx.drawWall(1202, W, [{ t: "tide", x: 3.1, w: 0.5, h: 0.45 }, { t: "nail", x: 1.2, y: 1.7, hole: true }]) },
      // Oeste: contorno do quadro que foi tirado, com o prego (o prego 3D está em buildWallDetails).
      o: { key: "parede-o", draw: tx.drawWall(1203, D, [{ t: "outline", x0: 1.22, x1: 1.88, y0: 1.18, y1: 1.84 }, { t: "tide", x: 0.6, w: 0.6, h: 0.75 }]) },
      l: { key: "parede-l", draw: tx.drawWall(1204, D, [{ t: "nail", x: 3.2, y: 1.55, hole: false }]) },
    },
    wear: tx.drawFloorWear,
  },
};

/** Grade comum da sala cinza (a do kit; piso, paredes e teto casam nela). */
export const LATTICE = roomLattice(CINZA_ROOM);

export type CinzaScene = {
  lamp: THREE.SpotLight;
  lampPivot: THREE.Group;
  table: THREE.Group;
  note: THREE.Mesh;
  notebook: THREE.Group;
  wardrobe: THREE.Group;
  door: THREE.Group;
  rug: THREE.Group;
};

function buildLights(m: Maker, root: THREE.Object3D, lampPivot: THREE.Group, bulbY: number): THREE.SpotLight {
  const { T, own } = m;
  const L = CINZA_LIGHTS;
  const ambient = own(new T.AmbientLight(protoColor(T, L.ambient.color), L.ambient.intensity));
  const hemi = own(new T.HemisphereLight(protoColor(T, L.hemi.sky), protoColor(T, L.hemi.ground), L.hemi.intensity));
  root.add(ambient, hemi);
  const lamp = own(new T.SpotLight(protoColor(T, L.lamp.color), L.lamp.intensity, L.lamp.distance, L.lamp.angle, L.lamp.penumbra, L.lamp.decay));
  lamp.name = "luz-principal";
  lamp.userData.mainLight = true;
  lamp.position.set(0, bulbY + 0.02, 0);
  const target = new T.Object3D();
  target.position.set(0, bulbY - 3, 0);
  lampPivot.add(lamp, target);
  lamp.target = target;
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(LAMP_SHADOW.mapSize, LAMP_SHADOW.mapSize);
  lamp.shadow.bias = LAMP_SHADOW.bias;
  lamp.shadow.normalBias = LAMP_SHADOW.normalBias;
  lamp.shadow.camera.near = LAMP_SHADOW.near;
  lamp.shadow.camera.far = LAMP_SHADOW.far;
  const fill = own(new T.PointLight(protoColor(T, L.fill.color), L.fill.intensity, L.fill.distance, L.fill.decay));
  fill.name = "luz-preenchimento";
  fill.position.set(0, bulbY + 0.12, 0);
  lampPivot.add(fill);
  return lamp;
}

/** Ponto no tampo a (dx, dz) do centro da mesa. */
const onTable = (dx: number, dz: number) => ({ x: TABLE_CENTER.x + dx, z: TABLE_CENTER.z + dz });

/** Monta a sala inteira no `root` privado da camada (Ruling 7: nada aqui toca a cena). */
export async function buildCinzaScene(m: Maker, root: THREE.Group, step: () => Promise<void>): Promise<CinzaScene> {
  buildFloor(m, root, CINZA_ROOM);
  await step();
  buildWalls(m, root, CINZA_ROOM);
  buildCeiling(m, root, CINZA_ROOM);
  buildSkirting(m, root, CINZA_ROOM);
  await step();
  const rug = buildRug(m);
  root.add(rug);
  const table = buildTable(m).root;
  root.add(table);
  await step();
  const notePos = onTable(0.2, 0.08);
  const note = buildNote(m, notePos.x, notePos.z, -0.32);
  root.add(note);
  const bookPos = onTable(-0.3, -0.04);
  const notebook = buildNotebook(m, bookPos.x, bookPos.z, 0.42);
  root.add(notebook);
  const pencilPos = onTable(0.02, 0.16);
  root.add(buildPencil(m, pencilPos.x, pencilPos.z, 0.18));
  await step();
  const wardrobe = buildWardrobe(m);
  root.add(wardrobe);
  await step();
  const door = buildDoor(m);
  root.add(door);
  buildWallDetails(m, root);
  const { pivot, bulbY } = buildLamp(m, LAMP.x, ROOM.h, LAMP.z, LAMP.bulbY);
  root.add(pivot);
  const lamp = buildLights(m, root, pivot, bulbY);
  return { lamp, lampPivot: pivot, table, note, notebook, wardrobe, door, rug };
}
