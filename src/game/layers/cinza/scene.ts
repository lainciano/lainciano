import type * as THREE from "three";
import { protoColor } from "../../render/materials";
import { mulberry } from "../../render/paint";
import { breakpoints, latticeSurface } from "../../render/shapes";
import { buildDoor, buildLamp, buildNote, buildNotebook, buildPencil, buildRug, buildTable, buildWallDetails, buildWardrobe, type Maker } from "./models";
import { DOOR, LAMP, ROOM, TABLE_CENTER } from "./places";
import * as tx from "./textures";

/**
 * Casca da sala (piso, paredes, teto, rodapé) e as luzes. Todas as superfícies grandes saem da MESMA grade de
 * linhas (x, z a cada ~20 cm, mais as bordas do vão da porta; y a cada ~20 cm mais a barra e o alto do vão):
 * onde o piso encontra a parede, ou duas paredes se encontram, os vértices coincidem e o tremor não abre fresta.
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

const STEP = 0.2;
export const LATTICE = {
  xs: breakpoints(ROOM.minX, ROOM.maxX, STEP, [DOOR.x0, DOOR.x1]),
  zs: breakpoints(ROOM.minZ, ROOM.maxZ, STEP),
  ys: breakpoints(0, ROOM.h, STEP, [tx.WALL_BAND, DOOR.top]),
};

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

/** Piso: ladrilhos de 1 m, variante e giro de 90° sorteados por semente fixa; decalque nos mesmos vértices. */
function buildFloor(m: Maker, root: THREE.Object3D) {
  const { T, kit } = m;
  const tile = (u: number, v: number) => ({ ix: Math.floor(u), iz: Math.floor(v) });
  const pick = (ix: number, iz: number) => {
    const rng = mulberry(3000 + ix * 31 + iz * 17);
    return { variant: Math.floor(rng() * 4) % 4, turn: Math.floor(rng() * 4) };
  };
  const geo = latticeSurface(T, {
    us: LATTICE.xs,
    vs: LATTICE.zs,
    at: (u, v) => [u, 0, v],
    normal: [0, 1, 0],
    group: (u0, v0, u1, v1) => {
      const { ix, iz } = tile((u0 + u1) / 2, (v0 + v1) / 2);
      return pick(ix, iz).variant;
    },
    cellUv: (u0, v0, u1, v1, u, v) => {
      const { ix, iz } = tile((u0 + u1) / 2, (v0 + v1) / 2);
      let a = u - ix;
      let b = 1 - (v - iz);
      for (let k = 0; k < pick(ix, iz).turn; k++) [a, b] = [1 - b, a];
      return [a, b];
    },
  });
  const tiles = [0, 1, 2, 3].map((v) => kit.phong({ map: m.tex(`granilite-${v}`, tx.drawGranilite(v), 256), shininess: 18, specular: 0x0a0a0a }));
  m.mesh(geo, tiles, root, 0, 0, 0, { cast: false, name: "piso" });

  // Decalque: as MESMAS posições e o mesmo índice do piso; só a UV (sala inteira) é dele.
  const wearTex = m.tex("piso-desgaste", tx.drawFloorWear, 256);
  wearTex.wrapS = T.ClampToEdgeWrapping;
  wearTex.wrapT = T.ClampToEdgeWrapping;
  const wear = kit.phong({ map: wearTex, transparent: true, depthWrite: false, specular: 0x000000, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const pos = geo.getAttribute("position");
  const wearGeo = new T.BufferGeometry();
  wearGeo.setAttribute("position", pos);
  wearGeo.setAttribute("normal", geo.getAttribute("normal"));
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) - ROOM.minX) / (ROOM.maxX - ROOM.minX);
    uv[i * 2 + 1] = 1 - (pos.getZ(i) - ROOM.minZ) / (ROOM.maxZ - ROOM.minZ);
  }
  wearGeo.setAttribute("uv", new T.BufferAttribute(uv, 2));
  wearGeo.setIndex(geo.getIndex());
  const decal = m.mesh(wearGeo, wear, root, 0, 0, 0, { cast: false, name: "piso-desgaste" });
  decal.renderOrder = 1;
}

function buildWalls(m: Maker, root: THREE.Object3D) {
  const { T, kit } = m;
  const W = ROOM.maxX - ROOM.minX;
  const D = ROOM.maxZ - ROOM.minZ;
  const wall = (key: string, seed: number, width: number, feats: tx.WallFeature[]) =>
    kit.phong({ map: m.tex(key, tx.drawWall(seed, width, feats), 256), shininess: 6, specular: 0x060606 });
  const doorU0 = DOOR.x0 - ROOM.minX;
  const doorU1 = DOOR.x1 - ROOM.minX;
  // Norte (z −2, olha +z): o vão da porta é um furo na grade.
  m.mesh(
    latticeSurface(T, {
      us: LATTICE.xs,
      vs: LATTICE.ys,
      holes: [{ u0: DOOR.x0, u1: DOOR.x1, v0: 0, v1: DOOR.top }],
      at: (u, v) => [u, v, ROOM.minZ],
      normal: [0, 0, 1],
      uv: (u, v) => [(u - ROOM.minX) / W, v / ROOM.h],
    }),
    wall("parede-n", 1201, W, [{ t: "door", x0: doorU0, x1: doorU1, top: DOOR.top }, { t: "switch", x: doorU1 + 0.28, y: 1.25 }, { t: "tide", x: 0.5, w: 0.8, h: 0.6 }]),
    root,
    0,
    0,
    0,
    { cast: false, name: "parede-norte" },
  );
  // Sul (z +2, olha −z): u corre de leste para oeste (como se vê de dentro).
  m.mesh(
    latticeSurface(T, { us: LATTICE.xs, vs: LATTICE.ys, at: (u, v) => [u, v, ROOM.maxZ], normal: [0, 0, -1], uv: (u, v) => [(ROOM.maxX - u) / W, v / ROOM.h] }),
    wall("parede-s", 1202, W, [{ t: "tide", x: 3.1, w: 0.5, h: 0.45 }, { t: "nail", x: 1.2, y: 1.7, hole: true }]),
    root,
    0,
    0,
    0,
    { cast: false, name: "parede-sul" },
  );
  // Oeste (x −2, olha +x): contorno do quadro que foi tirado, com o prego (o prego 3D está em buildWallDetails).
  m.mesh(
    latticeSurface(T, { us: LATTICE.zs, vs: LATTICE.ys, at: (u, v) => [ROOM.minX, v, u], normal: [1, 0, 0], uv: (u, v) => [(ROOM.maxZ - u) / D, v / ROOM.h] }),
    wall("parede-o", 1203, D, [{ t: "outline", x0: 1.22, x1: 1.88, y0: 1.18, y1: 1.84 }, { t: "tide", x: 0.6, w: 0.6, h: 0.75 }]),
    root,
    0,
    0,
    0,
    { cast: false, name: "parede-oeste" },
  );
  // Leste (x +2, olha −x).
  m.mesh(
    latticeSurface(T, { us: LATTICE.zs, vs: LATTICE.ys, at: (u, v) => [ROOM.maxX, v, u], normal: [-1, 0, 0], uv: (u, v) => [(u - ROOM.minZ) / D, v / ROOM.h] }),
    wall("parede-l", 1204, D, [{ t: "nail", x: 3.2, y: 1.55, hole: false }]),
    root,
    0,
    0,
    0,
    { cast: false, name: "parede-leste" },
  );
  // Teto (olha para baixo).
  const ceil = kit.phong({ map: m.tex("teto", tx.drawCeiling, 256), shininess: 4, specular: 0x000000 });
  m.mesh(
    latticeSurface(T, { us: LATTICE.xs, vs: LATTICE.zs, at: (u, v) => [u, ROOM.h, v], normal: [0, -1, 0], uv: (u, v) => [(u - ROOM.minX) / W, (v - ROOM.minZ) / D] }),
    ceil,
    root,
    0,
    0,
    0,
    { cast: false, name: "teto" },
  );

  // Rodapé de granilite escuro: 9 cm, 1,4 cm de espessura, chanfrado; para no alisar da porta e as pontas se
  // encostam nos cantos (o leste e o oeste começam onde o norte e o sul terminam).
  const skirt = kit.phong({ map: m.tex("rodape", tx.drawSkirting, 128), shininess: 20 });
  const SK = { h: 0.09, t: 0.014 };
  const uv = { mode: "world" as const, tile: [0.6, 0.6] as const };
  const trimOut = 0.1 - 0.03;
  const along = (x0: number, x1: number, z: number) => m.box(x1 - x0, SK.h, SK.t, skirt, root, (x0 + x1) / 2, SK.h / 2, z, { chamfer: 0.003, uv, cast: false });
  along(ROOM.minX, DOOR.x0 - trimOut, ROOM.minZ + SK.t / 2);
  along(DOOR.x1 + trimOut, ROOM.maxX, ROOM.minZ + SK.t / 2);
  along(ROOM.minX, ROOM.maxX, ROOM.maxZ - SK.t / 2);
  for (const x of [ROOM.minX + SK.t / 2, ROOM.maxX - SK.t / 2]) m.box(SK.t, SK.h, D - 2 * SK.t, skirt, root, x, SK.h / 2, 0, { chamfer: 0.003, uv, cast: false });
}

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
  buildFloor(m, root);
  await step();
  buildWalls(m, root);
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
