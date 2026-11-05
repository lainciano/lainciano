import type * as THREE from "three";
import { createStaticBatch } from "../../../render/batch";
import type { Maker } from "../../../render/kit";
import { breakpoints, latticeSurface, type LatticeOptions } from "../../../render/shapes";
import { COUNTER, COUNTER_RETURN } from "../places";
import * as tx from "../textures";
import { PADLOCK } from "./padlock";

/**
 * Balcão de recepção em L (B9), em código: fórmica bege sobre um corpo de painéis, aro de alumínio escovado em volta do
 * tampo (a cantoneira), cantoneiras nos cantos do corpo, rodapé recuado escuro, e uma gaveta na face leste (o canto
 * escondido, de onde se vê a gaveta trancada com o cadeado de 4 rodas).
 *
 * Construção (nada de caixa única, nada coplanar):
 * - o tampo é uma folha de 4 cm: o topo de fórmica numa grade (3 × 10 colunas/linhas no corpo principal) com o aro de
 *   alumínio por fora (parede, borda de 1,4 cm 2 mm mais alta e degrau), o fundo fechado (a sombra da lâmpada precisa de
 *   um sólido fechado) e uma textura só para o L inteiro (`drawCounterTop`);
 * - o corpo é feito só das peles visíveis (faces planas numa grade `latticeSurface`, normais para fora), recuado 3 cm do
 *   tampo; a face leste tem um vão para a gaveta, com o bolso escuro atrás dele;
 * - o que é estático sai em 4 malhas (uma por material: tampo, lateral, alumínio, escuro) via lote interno; a gaveta é
 *   um grupo à parte (`dynamic`, corrediça em +x, abre 28 cm na B18) e o cadeado é de `padlock.ts`.
 *
 * Coordenadas de MUNDO (a sala é centrada na origem): o grupo fica na origem. A gaveta nasce fechada, no vão.
 */

const C = COUNTER;
const R = COUNTER_RETURN;
const TOP = C.top;
const SLAB_T = 0.04;
const SLAB_Y0 = TOP - SLAB_T;
const INSET = 0.03;
const RIM = 0.014;
const RIM_UP = 0.002;
/** Corpo: recuado do tampo e com o pé recuado mais 5 cm (o rodapé escuro). */
const BODY = { x0: C.x0 + INSET, x1: C.x1 - INSET, z0: C.z0 + INSET, z1: C.z1 - INSET, rx1: R.x1 - INSET, rz0: R.z0 + INSET, y0: 0.1, y1: SLAB_Y0 } as const;
const KICK = 0.05;

/** Gaveta: frente de 40 × 15 cm na face leste do corpo principal; o vão tem 3 mm de folga. Centro em mundo. */
export const COUNTER_DRAWER = { x: BODY.x1, y: 0.82, z: -0.95, w: 0.4, h: 0.15, gap: 0.003, travel: 0.28, pocketDepth: 0.46 } as const;
const HOLE = {
  z0: COUNTER_DRAWER.z - COUNTER_DRAWER.w / 2 - COUNTER_DRAWER.gap,
  z1: COUNTER_DRAWER.z + COUNTER_DRAWER.w / 2 + COUNTER_DRAWER.gap,
  y0: COUNTER_DRAWER.y - COUNTER_DRAWER.h / 2 - COUNTER_DRAWER.gap,
  y1: COUNTER_DRAWER.y + COUNTER_DRAWER.h / 2 + COUNTER_DRAWER.gap,
};

/** O gancho do cadeado: dois olhais de arame (um no painel, outro na frente da gaveta) que a argola atravessa. */
export const HASP = { ringX: BODY.x1 + 0.026, ringY: 0.875, ringR: 0.014, ringTube: 0.002, zA: -0.735, zB: -0.761 } as const;
/** Onde o cadeado pendura (origem no centro do corpo, frente para o visitante a leste). */
export const PADLOCK_AT = { x: HASP.ringX, y: HASP.ringY - PADLOCK.ringDy, z: (HASP.zA + HASP.zB) / 2, ry: Math.PI / 2 } as const;

const join = (...parts: number[][]) => parts.flatMap((p, i) => (i === 0 ? p : p.slice(1)));
const seg = (a: number, b: number, step: number) => breakpoints(a, b, step);

export type CounterMaterials = { top: THREE.Material; side: THREE.Material; alu: THREE.Material; dark: THREE.Material };

export function counterMaterials(m: Maker): CounterMaterials {
  const { kit } = m;
  return {
    top: kit.phong({ map: m.tex("balcao-tampo", tx.drawCounterTop, 256), shininess: 24, specular: 0x14120e }),
    side: kit.phong({ map: m.tex("balcao-lateral", tx.drawCounterSide, 256), shininess: 16, specular: 0x14120e }),
    alu: kit.phong({ map: m.tex("balcao-aluminio", tx.drawAluminium, 64), shininess: 70, specular: 0x585858 }),
    dark: kit.phong({ color: 0x141211, shininess: 4, specular: 0x050505 }),
  };
}

type Axis = "x" | "y" | "z";

/** Pele plana numa grade: o plano `axis = at`, com a normal para `sign`; `us`/`vs` são as linhas nos outros dois eixos. */
function skin(m: Maker, mat: THREE.Material, parent: THREE.Object3D, name: string, axis: Axis, at: number, sign: 1 | -1, us: number[], vs: number[], o: Partial<LatticeOptions> = {}) {
  const pos = (u: number, v: number): [number, number, number] => (axis === "x" ? [at, v, u] : axis === "y" ? [u, at, v] : [u, v, at]);
  const normal: [number, number, number] = axis === "x" ? [sign, 0, 0] : axis === "y" ? [0, sign, 0] : [0, 0, sign];
  const geo = latticeSurface(m.T, { us, vs, at: pos, normal, ...o });
  return m.mesh(geo, mat, parent, 0, 0, 0, { name });
}

/** UV das laterais: u em metros ao longo do comprimento do balcão (1,9 m por textura), v = altura (1 m por textura). */
const sU = (a: number) => a / (C.z1 - C.z0);

type P2 = [number, number];

/**
 * Aro de alumínio do tampo: parede externa (do fundo da folha até 2 mm acima do tampo), borda de cima de 1,4 cm e o
 * degrau de 2 mm para dentro. Os vértices ao longo de cada aresta são os das linhas da grade do tampo (`xs`/`zs`), então
 * o degrau fecha com o topo de fórmica sem frestas; nos cantos a borda é cortada em meia-esquadria (sem sobrepor).
 */
function rimGeometry(T: typeof THREE, xs: number[], zs: number[]): THREE.BufferGeometry {
  const P: P2[] = [
    [C.x0, C.z0],
    [C.x1, C.z0],
    [C.x1, R.z0],
    [R.x1, R.z0],
    [R.x1, R.z1],
    [C.x0, R.z1],
  ];
  const n = P.length;
  const unit = (a: P2, b: P2): P2 => {
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  };
  // para dentro: à esquerda de (dx, dz) neste sentido (o contorno corre no sentido horário visto de cima)
  const inward = (e: number): P2 => {
    const [dx, dz] = unit(P[e], P[(e + 1) % n]);
    return [-dz, dx];
  };
  const Q: P2[] = P.map((p, i) => {
    const a = inward((i + n - 1) % n);
    const b = inward(i);
    const k = RIM / (1 + a[0] * b[0] + a[1] * b[1]);
    return [p[0] + (a[0] + b[0]) * k, p[1] + (a[1] + b[1]) * k];
  });
  const pos: number[] = [];
  const nor: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  const quad = (pts: [number, number, number][], normal: [number, number, number], uv: P2[]) => {
    const [a, b, c] = pts;
    const cr = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])];
    const flip = cr[0] * normal[0] + cr[1] * normal[1] + cr[2] * normal[2] < 0;
    const first = pos.length / 3;
    pts.forEach((p, k) => {
      pos.push(p[0], p[1], p[2]);
      nor.push(normal[0], normal[1], normal[2]);
      uvs.push(uv[k][0], uv[k][1]);
    });
    idx.push(...(flip ? [first, first + 3, first + 2, first, first + 2, first + 1] : [first, first + 1, first + 2, first, first + 2, first + 3]));
  };
  const yWall0 = SLAB_Y0;
  const yTop = TOP + RIM_UP;
  for (let e = 0; e < n; e++) {
    const A = P[e];
    const B = P[(e + 1) % n];
    const qa = Q[e];
    const qb = Q[(e + 1) % n];
    const alongX = Math.abs(B[0] - A[0]) > 1e-9;
    const ax = alongX ? 0 : 1;
    const lines = alongX ? xs : zs;
    const lo = Math.min(qa[ax], qb[ax]);
    const hi = Math.max(qa[ax], qb[ax]);
    const inner = lines.filter((v) => v > lo + 1e-6 && v < hi - 1e-6);
    // lado P (borda de fora) e lado Q (borda de dentro): mesmo número de pontos, as linhas do meio iguais
    const sign = B[ax] >= A[ax] ? 1 : -1;
    const ordered = sign > 0 ? inner : [...inner].reverse();
    const pAlong = [A[ax], ...ordered, B[ax]];
    const qAlong = [qa[ax], ...ordered, qb[ax]];
    const perpP = A[1 - ax];
    const perpQ = qa[1 - ax];
    const at = (al: number, pp: number, y: number): [number, number, number] => (alongX ? [al, y, pp] : [pp, y, al]);
    const [ox, oz] = inward(e);
    const out: [number, number, number] = [-ox, 0, -oz];
    const inn: [number, number, number] = [ox, 0, oz];
    let s = 0;
    for (let k = 0; k < pAlong.length - 1; k++) {
      const len = Math.abs(pAlong[k + 1] - pAlong[k]);
      const s1 = s + len;
      // parede de fora
      quad([at(pAlong[k], perpP, yWall0), at(pAlong[k + 1], perpP, yWall0), at(pAlong[k + 1], perpP, yTop), at(pAlong[k], perpP, yTop)], out, [[s * 3, 0], [s1 * 3, 0], [s1 * 3, (yTop - yWall0) * 3], [s * 3, (yTop - yWall0) * 3]]);
      // borda de cima (P → Q)
      quad([at(pAlong[k], perpP, yTop), at(pAlong[k + 1], perpP, yTop), at(qAlong[k + 1], perpQ, yTop), at(qAlong[k], perpQ, yTop)], [0, 1, 0], [[s * 3, 0], [s1 * 3, 0], [s1 * 3, RIM * 3], [s * 3, RIM * 3]]);
      // degrau para dentro, de TOP até a borda
      quad([at(qAlong[k], perpQ, TOP), at(qAlong[k + 1], perpQ, TOP), at(qAlong[k + 1], perpQ, yTop), at(qAlong[k], perpQ, yTop)], inn, [[s * 3, 0], [s1 * 3, 0], [s1 * 3, RIM_UP * 3], [s * 3, RIM_UP * 3]]);
      s = s1;
    }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new T.Float32BufferAttribute(nor, 3));
  geo.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/** Junta as peças de um grupo numa malha por material, no espaço do próprio grupo (o grupo pode ser movido depois). */
function mergeGroup(m: Maker, group: THREE.Group): void {
  const batch = createStaticBatch(m.T, m.own, { name: group.name });
  batch.add(group);
  batch.build(group);
}

export type CounterParts = {
  /** Tudo o que é fixo: 4 malhas (tampo, lateral, alumínio, escuro), o lote da cena as junta de novo. */
  root: THREE.Group;
  /** Caixas de oclusão do corpo (para a luz assada do piso em volta). */
  occluders: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }[];
};

export function buildCounter(m: Maker, mats: CounterMaterials = counterMaterials(m)): CounterParts {
  const { T } = m;
  const root = new T.Group();
  root.name = "balcao";
  const stat = new T.Group();
  stat.name = "balcao-estatico";
  root.add(stat);
  const { top, side, alu, dark } = mats;

  /* ---------------------------------------------------------------- tampo */
  const topXs = join(seg(C.x0 + RIM, C.x1 - RIM, 0.21), seg(C.x1 - RIM, R.x1 - RIM, 0.18));
  const topZs = breakpoints(C.z0 + RIM, C.z1 - RIM, 0.19, [R.z0 + RIM]);
  const bx = R.x1 - C.x0;
  const bz = C.z1 - C.z0;
  skin(m, top, stat, "tampo", "y", TOP, 1, topXs, topZs, {
    holes: [{ u0: C.x1 - RIM, u1: R.x1 - RIM, v0: C.z0 + RIM, v1: R.z0 + RIM }],
    uv: (x, z) => [(x - C.x0) / bx, 1 - (z - C.z0) / bz],
  });
  // o fundo da folha: fecha o sólido (a sombra da lâmpada só enxerga faces de trás)
  skin(m, side, stat, "tampo-fundo", "y", SLAB_Y0, -1, [C.x0, C.x1, R.x1], [C.z0, R.z0, C.z1], { holes: [{ u0: C.x1, u1: R.x1, v0: C.z0, v1: R.z0 }] });
  m.mesh(rimGeometry(T, topXs, topZs), alu, stat, 0, 0, 0, { name: "aro" });

  /* ---------------------------------------------------------------- corpo (peles) */
  const ys = seg(BODY.y0, BODY.y1, 0.215);
  // oeste (o lado do visitante)
  skin(m, side, stat, "pele-oeste", "x", BODY.x0, -1, seg(BODY.z0, BODY.z1, 0.23), ys, { uv: (z, y) => [sU(z), y] });
  // norte
  skin(m, side, stat, "pele-norte", "z", BODY.z0, -1, seg(BODY.x0, BODY.x1, 0.2), ys, { uv: (x, y) => [sU(x), y] });
  // leste do corpo principal (com o vão da gaveta)
  skin(
    m,
    side,
    stat,
    "pele-leste",
    "x",
    BODY.x1,
    1,
    join(seg(BODY.z0, HOLE.z0, 0.23), [HOLE.z0, HOLE.z1], seg(HOLE.z1, BODY.rz0, 0.2)),
    join(seg(BODY.y0, HOLE.y0, 0.22), [HOLE.y0, HOLE.y1], seg(HOLE.y1, BODY.y1, 0.06)),
    { holes: [{ u0: HOLE.z0, u1: HOLE.z1, v0: HOLE.y0, v1: HOLE.y1 }], uv: (z, y) => [sU(z), y] },
  );
  // retorno: norte e leste, e o sul de ponta a ponta
  skin(m, side, stat, "pele-retorno-norte", "z", BODY.rz0, -1, seg(BODY.x1, BODY.rx1, 0.18), ys, { uv: (x, y) => [sU(x), y] });
  skin(m, side, stat, "pele-retorno-leste", "x", BODY.rx1, 1, seg(BODY.rz0, BODY.z1, 0.2), ys, { uv: (z, y) => [sU(z), y] });
  skin(m, side, stat, "pele-sul", "z", BODY.z1, 1, join(seg(BODY.x0, BODY.x1, 0.24), seg(BODY.x1, BODY.rx1, 0.18)), ys, { uv: (x, y) => [sU(x), y] });

  /* ---------------------------------------------------------------- bolso da gaveta (escuro) */
  const px0 = BODY.x1 - COUNTER_DRAWER.pocketDepth;
  const xz = [px0, BODY.x1];
  skin(m, dark, stat, "bolso-fundo", "x", px0, 1, [HOLE.z0, HOLE.z1], [HOLE.y0, HOLE.y1]);
  skin(m, dark, stat, "bolso-teto", "y", HOLE.y1, -1, xz, [HOLE.z0, HOLE.z1]);
  skin(m, dark, stat, "bolso-piso", "y", HOLE.y0, 1, xz, [HOLE.z0, HOLE.z1]);
  skin(m, dark, stat, "bolso-norte", "z", HOLE.z0, 1, xz, [HOLE.y0, HOLE.y1]);
  skin(m, dark, stat, "bolso-sul", "z", HOLE.z1, -1, xz, [HOLE.y0, HOLE.y1]);

  /* ---------------------------------------------------------------- rodapé recuado (escuro) */
  const k0 = { x0: BODY.x0 + KICK, x1: BODY.x1 - KICK, z0: BODY.z0 + KICK, z1: BODY.z1 - KICK, rx1: BODY.rx1 - KICK, rz0: BODY.rz0 + KICK };
  const ky = [0, BODY.y0];
  skin(m, dark, stat, "rodape-oeste", "x", k0.x0, -1, [k0.z0, k0.z1], ky);
  skin(m, dark, stat, "rodape-norte", "z", k0.z0, -1, [k0.x0, k0.x1], ky);
  skin(m, dark, stat, "rodape-leste", "x", k0.x1, 1, [k0.z0, k0.rz0], ky);
  skin(m, dark, stat, "rodape-retorno-norte", "z", k0.rz0, -1, [k0.x1, k0.rx1], ky);
  skin(m, dark, stat, "rodape-retorno-leste", "x", k0.rx1, 1, [k0.rz0, k0.z1], ky);
  skin(m, dark, stat, "rodape-sul", "z", k0.z1, 1, [k0.x0, k0.rx1], ky);

  /* ---------------------------------------------------------------- cantoneiras e filetes de alumínio */
  const gh = BODY.y1 - BODY.y0;
  const gy = (BODY.y0 + BODY.y1) / 2;
  for (const [x, z] of [
    [BODY.x0, BODY.z0],
    [BODY.x1, BODY.z0],
    [BODY.x1, BODY.rz0],
    [BODY.rx1, BODY.rz0],
    [BODY.rx1, BODY.z1],
    [BODY.x0, BODY.z1],
  ] as const)
    m.box(0.024, gh, 0.024, alu, stat, x, gy, z, { chamfer: 0.0035, seg: 2, uv: { mode: "face" }, name: "cantoneira" });
  // filetes verticais na face do visitante: dividem o painel em três
  for (const z of [-0.98, BODY.rz0]) m.box(0.004, gh, 0.014, alu, stat, BODY.x0 - 0.002, gy, z, { chamfer: 0.0008, seg: 2, uv: { mode: "face" }, name: "filete" });

  /* ---------------------------------------------------------------- olhal do painel (o outro é da gaveta) */
  hasp(m, alu, stat, BODY.x1, HASP.zA, HASP.ringY);

  mergeGroup(m, stat);

  const occ = (x0: number, x1: number, z0: number, z1: number) => ({ min: { x: x0, y: 0, z: z0 }, max: { x: x1, y: TOP, z: z1 } });
  return { root, occluders: [occ(C.x0, C.x1, C.z0, C.z1), occ(C.x1, R.x1, R.z0, R.z1)] };
}

/**
 * Olhal de arame: uma chapa aparafusada na face `wallX`, um talo e a argola de 2,8 cm com o eixo ao longo do painel
 * (a argola do cadeado a atravessa). A argola fica `HASP.ringX - BODY.x1` (2,6 cm) à frente da face.
 */
function hasp(m: Maker, mat: THREE.Material, parent: THREE.Object3D, wallX: number, z: number, y: number) {
  const { T } = m;
  const { ringX, ringR, ringTube } = HASP;
  const out = ringX - BODY.x1;
  m.box(0.003, 0.034, 0.016, mat, parent, wallX + 0.0015, y, z, { chamfer: 0.0008, seg: 1, uv: { mode: "face" }, name: "olhal-chapa" });
  const stem = out - ringR - 0.003;
  m.box(stem, 0.006, 0.006, mat, parent, wallX + 0.003 + stem / 2, y, z, { chamfer: 0, seg: 1, uv: { mode: "face" }, name: "olhal-talo" });
  m.mesh(new T.TorusGeometry(ringR, ringTube, 4, 10), mat, parent, wallX + out, y, z, { name: "olhal-argola" });
}

/**
 * Gaveta: frente de fórmica com puxador de barra (alumínio), a caixa por dentro (fundo, laterais e traseira de melamine
 * bege) e o olhal do cadeado na frente. A origem é o centro da face de fora da frente, com +x para fora (a corrediça
 * move o grupo em +x até `COUNTER_DRAWER.travel`); a posição de mundo é a do vão, fechada. Grupo `dynamic`, junto em
 * duas malhas (fórmica e alumínio).
 */
export function buildCounterDrawer(m: Maker, mats: CounterMaterials = counterMaterials(m)): THREE.Group {
  const { T } = m;
  const { side, alu } = mats;
  const drawer = new T.Group();
  drawer.name = "gaveta";
  const { w, h } = COUNTER_DRAWER;
  const T_FRONT = 0.018;
  const uv = { mode: "world", tile: [C.z1 - C.z0, 1] as const, offset: [0, COUNTER_DRAWER.y, 0.7] as const } as const;
  m.box(T_FRONT, h, w, side, drawer, -T_FRONT / 2, 0, 0, { chamfer: 0.003, seg: 4, uv, name: "gaveta-frente" });
  // puxador de barra: dois pés e a barra, no meio da frente
  for (const z of [-0.055, 0.055]) m.box(0.026, 0.012, 0.012, alu, drawer, 0.013, 0, z, { chamfer: 0.0015, seg: 1, uv: { mode: "face" }, name: "puxador-pe" });
  m.box(0.012, 0.014, 0.145, alu, drawer, 0.032, 0, 0, { chamfer: 0.0025, seg: 2, uv: { mode: "face" }, name: "puxador" });
  // olhal do cadeado na frente da gaveta, perto da borda sul (z do mundo de HASP.zB)
  hasp(m, alu, drawer, 0, HASP.zB - COUNTER_DRAWER.z, HASP.ringY - COUNTER_DRAWER.y);
  // a caixa: 38 cm de profundidade, 11 cm de altura de lateral, aberta em cima
  const depth = 0.38;
  const bw = 0.372;
  const boxX = -T_FRONT - depth / 2;
  const sideY = -h / 2 + 0.015 + 0.055;
  m.box(depth, 0.006, bw, side, drawer, boxX, -h / 2 + 0.015 + 0.003, 0, { chamfer: 0.0015, seg: 3, uv: { mode: "face" }, name: "gaveta-fundo" });
  for (const z of [-1, 1] as const) m.box(depth, 0.11, 0.012, side, drawer, boxX, sideY, z * (bw / 2 - 0.006), { chamfer: 0.0015, seg: 3, uv: { mode: "face" }, name: "gaveta-lateral" });
  m.box(0.012, 0.11, bw - 0.024, side, drawer, -T_FRONT - depth + 0.006, sideY, 0, { chamfer: 0.0015, seg: 3, uv: { mode: "face" }, name: "gaveta-traseira" });
  mergeGroup(m, drawer);
  drawer.userData.dynamic = true;
  drawer.position.set(COUNTER_DRAWER.x, COUNTER_DRAWER.y, COUNTER_DRAWER.z);
  return drawer;
}
