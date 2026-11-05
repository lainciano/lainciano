import type * as THREE from "three";
import type { BakeOptions } from "../../render/bake";
import { bakeAtRest, compactMaterialGroups, createStaticBatch } from "../../render/batch";
import { buildCeiling, buildFloor, buildLamp, buildSkirting, buildWalls, roomLattice, type Maker, type RoomSpec } from "../../render/kit";
import { protoColor } from "../../render/materials";
import {
  BASEMENT_DOOR,
  COAT_RACK,
  COUNTER,
  COUNTER_RETURN,
  FLOOR_ORIGIN,
  FLUORESCENTS,
  HEATER,
  HEATER_GLOW,
  LAMP,
  NORTH_DOOR,
  ROOM,
  RUG,
  SIDE_TABLE,
  SOFA,
  SOUTH_DOOR,
  VITRINE,
  WALL_BAND,
  WINDOW,
  type WindowLight,
} from "./places";
import { buildCounter, buildCounterDrawer, PADLOCK_AT } from "./models/counter";
import { buildPadlock, wheelCenter } from "./models/padlock";
import { buildBasementOpening, buildCeilingFixtures, buildNorthDoor, buildPlaceholders, buildSouthDoor, buildWindow, shellMaterials } from "./shell";
import * as tx from "./textures";

/**
 * Cena da Antessala (B8, a casca vazia): piso, paredes, teto e rodapé pelo kit (`render/kit`, a partir do
 * `ANTESSALA_ROOM`), as portas, a janela, o vão do Porão, as fluorescentes e a lâmpada âmbar. O que é estático vai
 * para o lote (B3: uma malha por material, luz fixa e oclusão assadas no vértice); ficam soltos só a luminária (balança)
 * e os tubos da fluorescente da estranheza 1 (a B19 os acende), estes com a mesma luz fixa assada na pose de repouso
 * (`bakeAtRest`). As folhas da porta norte ficam no lote até a B17 (que as abre).
 */

/** Luzes (as da sala cinza, recalibradas na T6 para a luz física do 0.186; a lâmpada âmbar é a mesma peça). */
const LEGACY = Math.PI;
export const ANTESSALA_LIGHTS = {
  ambient: { color: 0x1e1c1a, intensity: 0.09 * LEGACY },
  hemi: { sky: 0x3a4452, ground: 0x22170e, intensity: 0.065 * LEGACY },
  lamp: { color: 0xffb062, intensity: 1.4 * LEGACY, distance: 7, angle: 0.88, penumbra: 0.45, decay: 1 },
  fill: { color: 0xffa860, intensity: 0.1 * LEGACY, distance: 5, decay: 1.2 },
} as const;

/**
 * Sombra da lâmpada âmbar (Ruling 9, receita da T6). Receptores: o tampo do balcão a 0,86 m da lâmpada (texel ≈
 * 2·0,86·tan 0,88/1024 ≈ 2,0 mm) e o piso a 1,86 m (≈ 4,4 mm), até ~3 m nas paredes (≈ 7 mm). `normalBias` 0,0045 ≈
 * 1 texel no piso sob a lâmpada e ≈ 2,2 no tampo: o mesmo da cinza (provado sem acne e com a sombra do objeto baixo
 * encostada); conferido aqui pelo e2e com o placeholder fino no balcão.
 */
export const LAMP_SHADOW = { mapSize: 1024, near: 0.5, far: 6, bias: -0.0005, normalBias: 0.0045 } as const;

/** Luz da janela por estado (o céu que entra): cor e força da luz de área assada. */
export const WINDOW_FILL: Record<WindowLight, { color: number; intensity: number; patio: number }> = {
  dia: { color: 0xa7b6c4, intensity: 1.15, patio: 0.5 },
  entardecer: { color: 0x7d8ca8, intensity: 0.55, patio: 0.25 },
  noite: { color: 0x5878a6, intensity: 0.42, patio: 0.18 },
};

const W = ROOM.maxX - ROOM.minX;
const D = ROOM.maxZ - ROOM.minZ;
const span = (a: number, b: number) => ({ center: (a + b) / 2, width: b - a });

/** Planta da Antessala para o kit: 4,5 × 5,0 × 2,6 m, os quatro vãos, a pintura de cada parede e o desgaste. */
export const ANTESSALA_ROOM: RoomSpec = {
  width: W,
  depth: D,
  height: ROOM.h,
  step: 0.2,
  band: WALL_BAND,
  seed: 4100,
  floorOrigin: FLOOR_ORIGIN,
  openings: [
    { wall: "n", ...span(NORTH_DOOR.x0, NORTH_DOOR.x1), height: NORTH_DOOR.top },
    { wall: "s", ...span(SOUTH_DOOR.x0, SOUTH_DOOR.x1), height: SOUTH_DOOR.top },
    { wall: "o", ...span(WINDOW.z0, WINDOW.z1), height: WINDOW.top - WINDOW.sill, sill: WINDOW.sill },
    { wall: "l", ...span(BASEMENT_DOOR.z0, BASEMENT_DOOR.z1), height: BASEMENT_DOOR.top },
  ],
  skin: {
    walls: {
      n: { key: "parede-n", draw: tx.drawWall(4201, W, tx.WALL_FEATURES.n) },
      s: { key: "parede-s", draw: tx.drawWall(4202, W, tx.WALL_FEATURES.s, 10) },
      o: { key: "parede-o", draw: tx.drawWall(4203, D, tx.WALL_FEATURES.o, 16) },
      l: { key: "parede-l", draw: tx.drawWall(4204, D, tx.WALL_FEATURES.l, 9) },
    },
    wear: tx.drawFloorWear,
    ceiling: tx.drawCeiling(FLUORESCENTS),
  },
};

/** Grade comum da Antessala (piso, paredes e teto casam nela, com as juntas do granilite). */
export const LATTICE = roomLattice(ANTESSALA_ROOM);

/**
 * Luz fixa assada (B3): o ambiente e o hemisfério de `ANTESSALA_LIGHTS`, a oclusão dos cantos e do pé das paredes, o
 * calor do aquecedor (laranja, perto do sofá), o frio do pátio que entra pela porta de vidro e a JANELA como luz de
 * área (o céu do lago, na cor e força do estado da hora). A lâmpada âmbar (com sombra) e o preenchimento dela
 * balançam: ficam dinâmicos. Os móveis (B9–B13) somam as caixas de oclusão deles quando chegarem.
 */
export function antessalaBake(light: WindowLight): BakeOptions {
  const L = ANTESSALA_LIGHTS;
  const win = WINDOW_FILL[light];
  const x = WINDOW.wallX;
  return {
    ambient: { color: L.ambient.color, intensity: L.ambient.intensity },
    hemi: { sky: L.hemi.sky, ground: L.hemi.ground, intensity: L.hemi.intensity },
    ao: {
      floorY: 0,
      ceilingY: ROOM.h,
      walls: { minX: ROOM.minX, maxX: ROOM.maxX, minZ: ROOM.minZ, maxZ: ROOM.maxZ },
      strength: 0.6,
      min: 0.35,
      // o balcão (B9): as duas caixas do corpo inteiro (tampo até o chão), para o piso em volta escurecer junto dele
      boxes: [
        { min: { x: COUNTER.x0, y: 0, z: COUNTER.z0 }, max: { x: COUNTER.x1, y: COUNTER.top, z: COUNTER.z1 } },
        { min: { x: COUNTER_RETURN.x0, y: 0, z: COUNTER_RETURN.z0 }, max: { x: COUNTER_RETURN.x1, y: COUNTER.top, z: COUNTER_RETURN.z1 } },
      ],
    },
    fills: [
      { pos: [HEATER_GLOW.x, HEATER_GLOW.y, HEATER_GLOW.z], color: 0xff6a24, intensity: 1.1 * LEGACY, range: 3, decay: 1.5 },
      { pos: [0, 2.3, ROOM.maxZ + 0.9], color: 0x50627a, intensity: win.patio * LEGACY, range: 5, decay: 1.5 },
    ],
    areas: [
      {
        corners: [
          [x, WINDOW.sill, WINDOW.z0],
          [x, WINDOW.sill, WINDOW.z1],
          [x, WINDOW.top, WINDOW.z1],
          [x, WINDOW.top, WINDOW.z0],
        ],
        normal: [1, 0, 0],
        color: win.color,
        intensity: win.intensity,
      },
    ],
  };
}

/** Onde virão os objetos (B10–B13), para os placeholders de debug; y em metros. O balcão (B9) já é modelo. */
export const PLACEHOLDERS = [
  { id: "sofa", ...SOFA, y0: 0, y1: 0.85 },
  { id: "mesinha", ...SIDE_TABLE, y0: 0, y1: 0.47 },
  { id: "tapete", ...RUG, y0: 0, y1: 0.007 },
  { id: "aquecedor", ...HEATER, x0: HEATER.x0 + 0.03, x1: HEATER.x1 - 0.03, z0: HEATER.z0 + 0.18, y0: 0, y1: 0.55 },
  { id: "cabideiro", ...COAT_RACK, x0: 0.92, x1: 0.98, z0: 2.12, z1: 2.18, y0: 0, y1: 1.8 },
  { id: "vitrine", ...VITRINE, y0: 0, y1: 1.82 },
  { id: "porao-folha", x0: ROOM.maxX + 0.02, x1: ROOM.maxX + 0.06, z0: BASEMENT_DOOR.z0 + 0.044, z1: BASEMENT_DOOR.z1 - 0.044, y0: 0.02, y1: BASEMENT_DOOR.top - 0.044 },
  { id: "relogio", x0: -1.18, x1: -0.82, z0: ROOM.minZ + 0.002, z1: ROOM.minZ + 0.13, y0: 1.3, y1: 2.15 },
  { id: "quadro", x0: -2.18, x1: -1.38, z0: ROOM.minZ + 0.002, z1: ROOM.minZ + 0.03, y0: 1.2, y1: 1.8 },
  { id: "leitor", x0: 0.82, x1: 0.9, z0: ROOM.minZ + 0.002, z1: ROOM.minZ + 0.032, y0: 1.18, y1: 1.32 },
  { id: "placa", x0: 1.12, x1: 1.52, z0: ROOM.maxZ - 0.022, z1: ROOM.maxZ - 0.002, y0: 1.52, y1: 1.645 },
  { id: "shape", x0: ROOM.minX + 0.04, x1: ROOM.minX + 0.07, z0: 0.72, z1: 1.52, y0: 1.42, y1: 1.62 },
  { id: "maquina", x0: 0.88, x1: 1.2, z0: -0.66, z1: -0.38, y0: COUNTER.top, y1: COUNTER.top + 0.16 },
  // o objeto baixo de teste de sombra: um livro de 1,8 cm deitado no tampo, a ~0,45 m da lâmpada, dentro do cone cheio
  { id: "teste-sombra", x0: 0.86, x1: 1.12, z0: -1.08, z1: -0.9, y0: COUNTER.top, y1: COUNTER.top + 0.018 },
] as const;

export type AntessalaScene = {
  lamp: THREE.SpotLight;
  lampPivot: THREE.Group;
  /** Névoa da janela: a camada desliza o `offset` (nunca redesenha). */
  mist: THREE.Texture;
  northLeaves: THREE.Group[];
  /** Gancho da estranheza 1 (B19): a calha marcada e o material dos tubos dela (emissivo 0 = apagada). */
  oddity: { fixture: THREE.Group; tube: THREE.MeshPhongMaterial };
  light: WindowLight;
};

/**
 * As rodas do cadeado são um `InstancedMesh` (o `bakeAtRest` pula instâncias) e giram: a luz fixa vai na geometria
 * compartilhada como se TODA face olhasse para a frente (a que está à vista é a da frente), calculada num clone com as
 * normais em +z posto no meio das rodas, e o material passa a ser o gêmeo assado.
 */
function bakeWheels(m: Maker, padlock: ReturnType<typeof buildPadlock>, opts: Parameters<typeof bakeAtRest>[3]): void {
  const { T } = m;
  const geo = padlock.wheels.geometry.clone();
  const nor = geo.getAttribute("normal");
  for (let i = 0; i < nor.count; i++) nor.setXYZ(i, 0, 0, 1);
  const proxy = new T.Mesh(geo, padlock.wheels.material);
  const [cx, cy, cz] = wheelCenter(1.5);
  proxy.position.set(cx, cy, cz);
  padlock.root.add(proxy);
  bakeAtRest(T, [proxy], padlock.root.parent ?? padlock.root, opts);
  const baked = geo.getAttribute("color");
  if (baked) {
    padlock.wheels.geometry.setAttribute("color", baked.clone());
    padlock.wheels.material = proxy.material;
  }
  proxy.removeFromParent();
  geo.dispose();
}

function buildLights(m: Maker, root: THREE.Object3D, lampPivot: THREE.Group, bulbY: number): THREE.SpotLight {
  const { T, own } = m;
  const L = ANTESSALA_LIGHTS;
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

/**
 * Monta a casca no `root` privado da camada (Ruling 7: nada aqui toca a cena), cedendo o quadro entre as partes.
 * `light`: o estado da janela (hora local, ou o de debug); `placeholders`: as caixas cinza de debug.
 */
export async function buildAntessalaScene(m: Maker, root: THREE.Group, step: () => Promise<void>, o: { light: WindowLight; placeholders: boolean }): Promise<AntessalaScene> {
  const bake = antessalaBake(o.light);
  const batch = createStaticBatch(m.T, m.own, { material: (mat) => m.kit.baked(mat), bake, name: "antessala-lote" });
  const floor = buildFloor(m, root, ANTESSALA_ROOM);
  batch.add(floor.mesh);
  if (floor.wear) batch.add(floor.wear);
  await step();
  for (const wall of buildWalls(m, root, ANTESSALA_ROOM)) batch.add(wall);
  batch.add(buildCeiling(m, root, ANTESSALA_ROOM));
  for (const piece of buildSkirting(m, root, ANTESSALA_ROOM)) batch.add(piece);
  await step();
  const mats = shellMaterials(m);
  const north = buildNorthDoor(m, mats);
  root.add(north.root);
  // as folhas ainda não se mexem (abrem na B17): vão para o lote como o resto (a B17 as marca `dynamic` e soltas,
  // com a luz assada na pose de repouso, como os tubos da estranheza abaixo)
  batch.add(north.root);
  const south = buildSouthDoor(m, mats, o.light);
  root.add(south);
  batch.add(south);
  await step();
  const win = buildWindow(m, mats, o.light);
  root.add(win.root);
  batch.add(win.root);
  const basement = buildBasementOpening(m, mats);
  root.add(basement);
  batch.add(basement);
  const ceiling = buildCeilingFixtures(m, mats);
  root.add(ceiling.root);
  batch.add(ceiling.root);
  await step();
  // fio um pouco mais grosso que o da cinza: na sala maior ele fica longe e sumiria entre as linhas do PSX
  const { pivot, bulbY } = buildLamp(m, LAMP.x, ROOM.h, LAMP.z, LAMP.bulbY, { cord: 0.006 });
  pivot.userData.dynamic = true;
  root.add(pivot);
  const lamp = buildLights(m, root, pivot, bulbY);
  // balcão em L: o corpo e o tampo vão para o lote; a gaveta e o cadeado (as rodas giram) ficam soltos, `dynamic`
  const counter = buildCounter(m);
  root.add(counter.root);
  batch.add(counter.root);
  const drawer = buildCounterDrawer(m);
  root.add(drawer);
  const padlock = buildPadlock(m);
  padlock.root.position.set(PADLOCK_AT.x, PADLOCK_AT.y, PADLOCK_AT.z);
  padlock.root.rotation.y = PADLOCK_AT.ry;
  root.add(padlock.root);
  await step();
  if (o.placeholders) buildPlaceholders(m, root, PLACEHOLDERS);
  batch.build(root);
  // o que ficou solto e um dia se mexe recebe a mesma luz fixa, assada onde está (sem luz real nova)
  const bakeOpts = { material: (mat: THREE.Material) => m.kit.baked(mat), bake };
  bakeAtRest(m.T, [ceiling.oddity.tubes, drawer, padlock.root], root, bakeOpts);
  bakeWheels(m, padlock, bakeOpts);
  compactMaterialGroups(m.T, root);
  // o material que está de fato nos tubos (o gêmeo assado): é ele que a estranheza acende
  const tubeMesh = ceiling.oddity.tubes.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh | undefined;
  const tube = (tubeMesh?.material ?? ceiling.oddity.tube) as THREE.MeshPhongMaterial;
  return { lamp, lampPivot: pivot, mist: win.mist, northLeaves: north.leaves, oddity: { fixture: ceiling.oddity.fixture, tube }, light: o.light };
}
