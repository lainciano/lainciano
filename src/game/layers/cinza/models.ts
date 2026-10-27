import type * as THREE from "three";
import type { MaterialKit } from "../../render/materials";
import type { Draw } from "../../render/paint";
import { chamferBox, latticeSurface, breakpoints, type UvMode } from "../../render/shapes";
import type { Own } from "../types";
import { DOOR, DOOR_LEAF, RUG, TABLE, WARDROBE } from "./places";
import * as tx from "./textures";

/**
 * Modelos da sala cinza, todos em código (contratos 4b, bíblia 12b.4): espessura real, chanfros, peças que se
 * encostam pela borda (nada coplanar sobreposto), faces grandes subdivididas e o desgaste onde o uso pede.
 * Cada geometria passa por `own` (Ruling 7); os materiais e texturas são do kit (compartilhados).
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

type MeshOpts = { cast?: boolean; recv?: boolean; rx?: number; ry?: number; rz?: number; name?: string };
type BoxOpts = MeshOpts & { chamfer?: number; uv?: UvMode; seg?: number };

export function createMaker(T: typeof THREE, kit: MaterialKit, own: Own): Maker {
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
    tex: (key, draw, size) => kit.texture(`cinza:${key}`, draw, size),
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

/** Os 7 materiais de uma caixa chanfrada a partir de papéis (o que faltar usa `rest`). */
function faces(rest: THREE.Material, o: { right?: THREE.Material; left?: THREE.Material; top?: THREE.Material; bottom?: THREE.Material; front?: THREE.Material; back?: THREE.Material; edge?: THREE.Material }): THREE.Material[] {
  return [o.right ?? rest, o.left ?? rest, o.top ?? rest, o.bottom ?? rest, o.front ?? rest, o.back ?? rest, o.edge ?? rest];
}

/** Puxador torneado de latão (perfil de lathe): base, pescoço e cabeça achatada. Eixo +z (sai da peça). */
function knob(m: Maker, mat: THREE.Material, parent: THREE.Object3D, x: number, y: number, z: number, scale = 1) {
  const { T } = m;
  const s = scale;
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
  return m.mesh(new T.LatheGeometry(profile, 12), mat, parent, x, y, z, { rx: Math.PI / 2, cast: false });
}

/* ================================================================== mesa */

export type TableParts = { root: THREE.Group };

/**
 * Mesa de escrever de canela (1,2 × 0,68 × 0,76 m): tampo de três tábuas com chanfro gasto, saia recuada, gaveta
 * com dois puxadores torneados e espelho de fechadura, pernas troncopiramidais facetadas. Uma perna é mais curta:
 * alguém calçou com um papelão dobrado.
 */
export function buildTable(m: Maker): TableParts {
  const { T, kit } = m;
  const W = TABLE.x1 - TABLE.x0;
  const D = TABLE.z1 - TABLE.z0;
  const root = new T.Group();
  root.name = "mesa";
  root.position.set((TABLE.x0 + TABLE.x1) / 2, 0, (TABLE.z0 + TABLE.z1) / 2);

  const topTex = kit.phong({ map: m.tex("mesa-tampo", tx.drawTableTop, 256), shininess: 22, specular: 0x0c0a08 });
  const woodH = kit.phong({ map: m.tex("mesa-madeira-h", tx.drawWood(711, "#563420", false), 128), shininess: 16 });
  const woodV = kit.phong({ map: m.tex("mesa-madeira-v", tx.drawWood(712, "#563420", true), 128), shininess: 16 });
  const worn = kit.phong({ map: m.tex("mesa-quina", tx.drawWornEdge(713, "#7a5236"), 64), shininess: 8 });
  const brass = kit.phong({ color: 0x8c6c34, specular: 0x403018, shininess: 50 });
  const escut = kit.phong({ map: m.tex("espelho-fechadura", tx.drawEscutcheon, 64), specular: 0x403018, shininess: 40 });
  const card = kit.phong({ color: 0x8a6c48, shininess: 2 });

  const TOP_T = 0.032;
  const topY = TABLE.top - TOP_T / 2;
  // Tampo: a face de cima cobre o desenho inteiro (UV de 0 a 1 em metros da mesa).
  m.box(W, TOP_T, D, faces(woodH, { top: topTex, edge: worn }), root, 0, topY, 0, {
    chamfer: 0.007,
    uv: { mode: "world", tile: [W, D], offset: [W / 2, 0, -D / 2] },
    name: "mesa-tampo",
  });

  // Saia: recuada 3,5 cm das bordas do tampo, encostando por baixo dele (sem cruzar).
  const APRON_H = 0.085;
  const APRON_T = 0.02;
  const inset = 0.035;
  const apronY = TABLE.top - TOP_T - APRON_H / 2;
  const ax = W / 2 - inset;
  const az = D / 2 - inset;
  m.box(APRON_T, APRON_H, D - 2 * inset, woodH, root, -ax + APRON_T / 2, apronY, 0, { chamfer: 0.002, cast: true });
  m.box(APRON_T, APRON_H, D - 2 * inset, woodH, root, ax - APRON_T / 2, apronY, 0, { chamfer: 0.002 });
  m.box(W - 2 * inset - 2 * APRON_T, APRON_H, APRON_T, woodH, root, 0, apronY, -az + APRON_T / 2, { chamfer: 0.002 });
  m.box(W - 2 * inset - 2 * APRON_T, APRON_H, APRON_T, woodH, root, 0, apronY, az - APRON_T / 2, { chamfer: 0.002 });

  // Gaveta: frente 6 mm à frente da saia (a folga dela fica no escuro do chanfro), dois puxadores e a fechadura.
  const drawer = new T.Group();
  drawer.position.set(0.06, apronY, az + 0.008);
  root.add(drawer);
  m.box(0.46, APRON_H - 0.016, 0.016, faces(woodH, { edge: worn }), drawer, 0, 0, 0, { chamfer: 0.004, name: "mesa-gaveta" });
  knob(m, brass, drawer, -0.15, 0, 0.008, 0.8);
  knob(m, brass, drawer, 0.15, 0, 0.008, 0.8);
  m.box(0.022, 0.034, 0.003, faces(brass, { front: escut }), drawer, 0, 0.004, 0.0095, { chamfer: 0.001, uv: { mode: "face" }, cast: false });

  // Pernas: troncos de pirâmide (5 → 3,2 cm de lado), facetados, com o topo escondido sob a saia.
  const legH = TABLE.top - TOP_T;
  const leg = (x: number, z: number, h: number, y0: number) => {
    const geo = m.flat(new T.CylinderGeometry(0.05 / Math.SQRT2, 0.032 / Math.SQRT2, h, 4, 4));
    m.mesh(geo, woodV, root, x, y0 + h / 2, z, { ry: Math.PI / 4 });
  };
  const lx = ax - 0.026;
  const lz = az - 0.026;
  // a perna da frente à esquerda é 6 mm mais curta e fica sobre o calço de papelão dobrado
  const SHIM = 0.006;
  leg(-lx, lz, legH - SHIM, SHIM);
  m.box(0.07, SHIM, 0.045, card, root, -lx + 0.008, SHIM / 2, lz + 0.004, { chamfer: 0.0015, ry: 0.25, name: "mesa-calco" });
  leg(lx, lz, legH, 0);
  leg(-lx, -lz, legH, 0);
  leg(lx, -lz, legH, 0);
  return { root };
}

/* ================================================================== objetos do tampo */

/**
 * Bilhete dobrado ao meio, deitado e entreaberto (a dobra levanta 7 mm): objeto baixo de teste de sombra.
 * Papel dos dois lados (DoubleSide), grade 6 × 10 para dobrar sem facetar demais.
 */
export function buildNote(m: Maker, x: number, z: number, ry: number): THREE.Mesh {
  const { T, kit } = m;
  const W = 0.148;
  const L = 0.21;
  const geo = new T.PlaneGeometry(W, L, 6, 10);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const vz = pos.getZ(i);
    const vx = pos.getX(i);
    const t = 1 - Math.abs(vz) / (L / 2);
    // tenda da dobra + uma ponta que se ergue um pouco (papel que já foi amassado)
    const corner = Math.max(0, (vx / (W / 2)) * (vz / (L / 2)));
    pos.setY(i, 0.0012 + 0.007 * Math.pow(t, 1.6) + 0.004 * corner * corner);
  }
  geo.computeVertexNormals();
  const mat = kit.phong({ map: m.tex("bilhete", tx.drawNote, 128), side: m.T.DoubleSide, shininess: 3 });
  const note = m.mesh(geo, mat, new T.Group(), 0, 0, 0, { name: "bilhete" });
  note.removeFromParent();
  note.position.set(x, TABLE.top, z);
  note.rotation.y = ry;
  return note;
}

/** Caderno de capa preta fechado (1,8 cm), com marcador de fita e elástico. Outro objeto baixo. */
export function buildNotebook(m: Maker, x: number, z: number, ry: number): THREE.Group {
  const { T, kit } = m;
  const root = new T.Group();
  root.name = "caderno";
  root.position.set(x, TABLE.top, z);
  root.rotation.y = ry;
  const B = { w: 0.148, d: 0.21, t: 0.018, board: 0.0026 } as const;
  const cover = kit.phong({ map: m.tex("caderno-capa", tx.drawNotebookCover, 128), shininess: 10 });
  const coverEdge = kit.phong({ color: 0x2a2826, shininess: 6 });
  const pages = kit.phong({ map: m.tex("caderno-miolo", tx.drawPages, 64), shininess: 2 });
  const elastic = kit.phong({ color: 0x141414, shininess: 4 });
  const ribbon = kit.phong({ color: 0x6e1a12, shininess: 4 });
  const uv: UvMode = { mode: "face" };
  m.box(B.w, B.board, B.d, faces(coverEdge, { top: cover, bottom: cover }), root, 0, B.board / 2, 0, { chamfer: 0.0008, uv });
  m.box(B.w, B.board, B.d, faces(coverEdge, { top: cover, bottom: cover }), root, 0, B.t - B.board / 2, 0, { chamfer: 0.0008, uv });
  m.box(B.w - 0.006, B.t - B.board * 2, B.d - 0.006, pages, root, 0.002, B.t / 2, 0, { uv });
  m.mesh(new T.CylinderGeometry(B.t / 2, B.t / 2, B.d, 8, 1, false, Math.PI, Math.PI), coverEdge, root, -B.w / 2, B.t / 2, 0, { rx: Math.PI / 2 });
  // elástico: por cima, pela frente e por baixo da capa, a 3 cm da borda (1 mm afastado, nunca coplanar)
  const ex = B.w / 2 - 0.03;
  m.box(0.006, 0.0012, B.d + 0.0024, elastic, root, ex, B.t + 0.0006, 0, { cast: false });
  for (const s of [1, -1]) m.box(0.006, B.t + 0.0024, 0.0012, elastic, root, ex, B.t / 2, s * (B.d / 2 + 0.0006), { cast: false });
  // fita marcadora escapando pelo pé
  m.box(0.006, 0.0008, 0.05, ribbon, root, 0.03, 0.0004 + B.board, B.d / 2 + 0.022, { cast: false, ry: 0.15 });
  return root;
}

/** Lápis sextavado amarelo, apontado, com virola e borracha gasta; deitado sobre uma das faces. */
export function buildPencil(m: Maker, x: number, z: number, ry: number): THREE.Group {
  const { T, kit } = m;
  const root = new T.Group();
  root.name = "lapis";
  const R = 0.0037;
  const L = 0.15;
  const y = R * Math.cos(Math.PI / 6);
  root.position.set(x, TABLE.top + y, z);
  root.rotation.y = ry;
  const paint = kit.phong({ map: m.tex("lapis", tx.drawPencil, 64), shininess: 30 });
  const wood = kit.phong({ color: 0xb08a5c, shininess: 4 });
  const lead = kit.phong({ color: 0x2a2a2c, shininess: 40 });
  const ferrule = kit.phong({ color: 0x9a9a92, specular: 0x404040, shininess: 60 });
  const eraser = kit.phong({ color: 0xa8665a, shininess: 2 });
  // eixo do lápis ao longo de x (o +y do cilindro vira −x); os vértices do sextavado a 240° e 300° ficam
  // embaixo, então ele deita numa face e o centro fica a R·cos 30° do tampo
  const along = { rz: Math.PI / 2 };
  m.mesh(m.flat(new T.CylinderGeometry(R, R, L, 6, 3)), paint, root, 0, 0, 0, along);
  m.mesh(m.flat(new T.CylinderGeometry(R * 0.3, R, 0.018, 6, 1)), wood, root, -L / 2 - 0.009, 0, 0, { ...along, cast: false });
  m.mesh(new T.ConeGeometry(R * 0.3, 0.004, 6), lead, root, -L / 2 - 0.02, 0, 0, { ...along, cast: false });
  m.mesh(new T.CylinderGeometry(R * 1.05, R * 1.05, 0.011, 10, 1), ferrule, root, L / 2 + 0.0055, 0, 0, { ...along, cast: false });
  m.mesh(new T.CylinderGeometry(R * 0.98, R * 0.95, 0.006, 10, 1), eraser, root, L / 2 + 0.014, 0, 0, { ...along, cast: false });
  return root;
}

/* ================================================================== guarda-roupa */

/**
 * Guarda-roupa de imbuia, duas portas almofadadas (molduras aplicadas e chanfradas), cornija em dois degraus,
 * rodapé recuado, dobradiças, puxadores torneados e espelho de fechadura com a chave esquecida nela (argola e
 * borla de lã desbotada). A porta direita não fecha direito: fica 2,5° aberta e mostra o escuro de dentro.
 * Montado de frente para +z e girado para olhar o oeste.
 */
export function buildWardrobe(m: Maker): THREE.Group {
  const { T, kit } = m;
  const Wd = WARDROBE.z1 - WARDROBE.z0;
  const Dp = WARDROBE.x1 - WARDROBE.x0;
  const H = WARDROBE.h;
  const root = new T.Group();
  root.name = "armario";
  root.position.set((WARDROBE.x0 + WARDROBE.x1) / 2, 0, (WARDROBE.z0 + WARDROBE.z1) / 2);
  root.rotation.y = -Math.PI / 2;

  const veneer = kit.phong({ map: m.tex("imbuia", tx.drawVeneer, 256), shininess: 20, specular: 0x0c0a08 });
  const dark = kit.phong({ map: m.tex("imbuia-escura", tx.drawWood(722, "#24160c", true), 128), shininess: 10 });
  const worn = kit.phong({ map: m.tex("imbuia-quina", tx.drawWornEdge(723, "#6a4428"), 64), shininess: 8 });
  const brass = kit.phong({ color: 0x8a6a30, specular: 0x403018, shininess: 50 });
  const escut = kit.phong({ map: m.tex("espelho-fechadura", tx.drawEscutcheon, 64), specular: 0x403018, shininess: 40 });
  const inside = kit.basic({ color: 0x050403 });
  const tassel = kit.phong({ color: 0x7a2c22, shininess: 2 });
  const sideUv: UvMode = { mode: "world", tile: [0.6, 1.9] };

  const BASE = 0.085;
  const SIDE_T = 0.022;
  const CORNICE = 0.075;
  const carcH = H - BASE - CORNICE;
  const front = Dp / 2 - 0.02;
  // rodapé recuado 2 cm na frente e nos lados
  m.box(Wd - 0.04, BASE, Dp - 0.04, faces(dark, { edge: worn }), root, 0, BASE / 2, -0.01, { chamfer: 0.004 });
  // laterais, fundo e tampo da caixa
  for (const s of [1, -1]) m.box(SIDE_T, carcH, Dp - 0.02, faces(veneer, { edge: worn }), root, s * (Wd / 2 - SIDE_T / 2), BASE + carcH / 2, -0.01, { chamfer: 0.004, uv: sideUv });
  m.box(Wd - 2 * SIDE_T, carcH, 0.012, dark, root, 0, BASE + carcH / 2, -Dp / 2 + 0.006, { cast: false });
  m.box(Wd - 2 * SIDE_T, 0.02, Dp - 0.04, dark, root, 0, BASE + 0.01, -0.01, { cast: false });
  // o escuro de dentro (visto pela fresta da porta entreaberta)
  m.mesh(new T.PlaneGeometry(Wd - 2 * SIDE_T, carcH - 0.04), inside, root, 0, BASE + carcH / 2, front - 0.03, { cast: false, recv: false });
  // cornija em dois degraus
  m.box(Wd + 0.05, CORNICE * 0.62, Dp + 0.03, faces(veneer, { edge: worn }), root, 0, H - (CORNICE * 0.62) / 2, 0.005, { chamfer: 0.014 });
  m.box(Wd + 0.018, CORNICE * 0.38, Dp + 0.006, faces(dark, { edge: worn }), root, 0, H - CORNICE * 0.62 - (CORNICE * 0.38) / 2, -0.004, { chamfer: 0.006 });

  // portas: 4 mm de folga no meio, 2 mm das laterais
  const doorW = (Wd - 0.004) / 2 - 0.002;
  const doorH = carcH - 0.012;
  const doorT = 0.022;
  const doorY = BASE + 0.006 + doorH / 2;
  const doorTex = [m.tex("armario-porta-e", tx.drawWardrobeDoor(724, false), 256), m.tex("armario-porta-d", tx.drawWardrobeDoor(725, true), 256)];
  const door = (side: -1 | 1, ajar: number) => {
    // pivô na dobradiça (borda de fora da porta)
    const hinge = new T.Group();
    hinge.position.set(side * (Wd / 2 - 0.002), 0, front + 0.001);
    hinge.rotation.y = side * ajar;
    root.add(hinge);
    const leaf = new T.Group();
    leaf.position.set(-side * (doorW / 2), doorY, doorT / 2);
    hinge.add(leaf);
    const face = kit.phong({ map: doorTex[side > 0 ? 1 : 0], shininess: 20, specular: 0x0c0a08 });
    m.box(doorW, doorH, doorT, faces(veneer, { front: face, edge: worn }), leaf, 0, 0, 0, { chamfer: 0.004, uv: { mode: "face" }, name: "armario-porta" });
    // molduras aplicadas: um quadro de 4 peças chanfradas formando a almofada (encostam pela borda)
    const mw = 0.022;
    const mt = 0.009;
    const insetX = 0.055;
    const insetY = 0.075;
    const fw = doorW - 2 * insetX;
    const fh = doorH - 2 * insetY;
    const z = doorT / 2 + mt / 2;
    m.box(fw, mw, mt, faces(dark, { edge: worn }), leaf, 0, fh / 2 - mw / 2, z, { chamfer: 0.0035, cast: false });
    m.box(fw, mw, mt, faces(dark, { edge: worn }), leaf, 0, -fh / 2 + mw / 2, z, { chamfer: 0.0035, cast: false });
    for (const s of [1, -1]) m.box(mw, fh - 2 * mw, mt, faces(dark, { edge: worn }), leaf, s * (fw / 2 - mw / 2), 0, z, { chamfer: 0.0035, cast: false });
    // dobradiças (dois nós de latão escurecido na borda de fora)
    for (const y of [doorH / 2 - 0.12, -doorH / 2 + 0.12]) m.mesh(new T.CylinderGeometry(0.0055, 0.0055, 0.07, 8), brass, leaf, side * (doorW / 2 + 0.002), y, -doorT / 2 + 0.002, { cast: false });
    // puxador na borda de dentro
    knob(m, brass, leaf, -side * (doorW / 2 - 0.035), -0.04, doorT / 2);
    return leaf;
  };
  door(-1, 0);
  const right = door(1, 0.044);
  // fechadura e chave na porta da direita
  const keyX = -(doorW / 2 - 0.035);
  m.box(0.026, 0.05, 0.003, faces(brass, { front: escut }), right, keyX, 0.05, doorT / 2 + 0.0015, { chamfer: 0.001, uv: { mode: "face" }, cast: false });
  const key = new T.Group();
  key.position.set(keyX, 0.046, doorT / 2 + 0.003);
  right.add(key);
  m.mesh(new T.CylinderGeometry(0.0022, 0.0022, 0.03, 6), brass, key, 0, 0, 0.015, { rx: Math.PI / 2, cast: false });
  m.mesh(new T.TorusGeometry(0.011, 0.0025, 6, 14), brass, key, 0, -0.002, 0.034, { ry: Math.PI / 2, cast: false });
  // borla pendurada na argola: cordão e o tufo em cone
  m.mesh(new T.CylinderGeometry(0.0012, 0.0012, 0.05, 4), tassel, key, 0, -0.04, 0.034, { cast: false });
  m.mesh(new T.ConeGeometry(0.008, 0.035, 8, 1, true), tassel, key, 0, -0.08, 0.034, { cast: false });
  return root;
}

/* ================================================================== porta norte */

/**
 * Porta de almofada pintada de esmalte verde velho, no vão da parede norte: batentes com a espessura da
 * parede, alisares chanfrados por cima da junta com o reboco, folha de quadro (montantes e travessas) com duas
 * almofadas rebaixadas e chanfradas, espelho comprido com a maçaneta de alavanca caída (mola gasta) e o buraco
 * da chave, três dobradiças, soleira de pedra e, por baixo da folha, um fio de luz fria do outro lado.
 */
export function buildDoor(m: Maker): THREE.Group {
  const { T, kit } = m;
  const root = new T.Group();
  root.name = "porta";
  const cx = (DOOR.x0 + DOOR.x1) / 2;
  root.position.set(cx, 0, DOOR.wallZ);
  const paintTex = m.tex("porta-pintura", tx.drawDoorPaint, 256);
  const frame = kit.phong({ map: m.tex("porta-batente", tx.drawFramePaint, 128), shininess: 30 });
  const brass = kit.phong({ color: 0x8a6a32, specular: 0x403018, shininess: 50 });
  const steel = kit.phong({ color: 0x6a6660, specular: 0x303030, shininess: 40 });
  const escut = kit.phong({ map: m.tex("espelho-fechadura", tx.drawEscutcheon, 64), specular: 0x403018, shininess: 40 });
  const stone = kit.phong({ map: m.tex("soleira", tx.drawThreshold, 128), shininess: 24 });
  const leak = kit.basic({ color: 0x5a7486 });

  const half = (DOOR.x1 - DOOR.x0) / 2;
  const DEPTH = 0.15;
  const JAMB = 0.03;
  const SILL = 0.012;
  // soleira: entra 1,5 cm na sala e vai até o fim do batente
  m.box(DOOR.x1 - DOOR.x0, SILL, DEPTH + 0.015, stone, root, 0, SILL / 2, -DEPTH / 2 + 0.0075, { chamfer: 0.003, uv: { mode: "world", tile: [0.82, 0.82] } });
  // batentes dentro do vão (a espessura da parede); a face de fora encosta na borda do furo do reboco
  const jambUv: UvMode = { mode: "world", tile: [0.4, 1.2] };
  for (const s of [1, -1]) m.box(JAMB, DOOR.top - SILL, DEPTH, frame, root, s * (half - JAMB / 2), SILL + (DOOR.top - SILL) / 2, -DEPTH / 2, { uv: jambUv });
  m.box(2 * half - 2 * JAMB, JAMB, DEPTH, frame, root, 0, DOOR.top - JAMB / 2, -DEPTH / 2, { uv: jambUv });
  // alisares: 7 cm sobre a parede + 3 cm sobre o batente, 1,6 cm de espessura; o de cima passa por cima dos dois
  const TRIM = 0.1;
  const TRIM_T = 0.016;
  const trimX = half - JAMB + TRIM / 2;
  for (const s of [1, -1]) m.box(TRIM, DOOR.top - JAMB, TRIM_T, faces(frame, {}), root, s * trimX, (DOOR.top - JAMB) / 2, TRIM_T / 2, { chamfer: 0.005, uv: jambUv });
  m.box(2 * (half - JAMB + TRIM), TRIM, TRIM_T, frame, root, 0, DOOR.top - JAMB + TRIM / 2, TRIM_T / 2, { chamfer: 0.005, uv: jambUv });
  // batente de encosto (onde a folha bate), atrás da folha
  const leafBack = -0.04 - 0.035;
  for (const s of [1, -1]) m.box(0.012, DOOR.top - SILL - JAMB, 0.02, frame, root, s * (half - JAMB - 0.006), SILL + (DOOR.top - SILL - JAMB) / 2, leafBack - 0.01, { cast: false });

  // folha: 3 mm de folga dos batentes e em cima, 8 mm embaixo (o fio de luz)
  const LW = DOOR_LEAF.w;
  const LH = DOOR_LEAF.h;
  const LT = 0.035;
  const leaf = new T.Group();
  leaf.name = "porta-folha";
  const leafY0 = SILL + 0.008;
  leaf.position.set(0, leafY0, -0.04 - LT / 2);
  root.add(leaf);
  /** Peça da folha com a pintura em metros da folha (a textura continua de uma peça para a outra). */
  const paint = kit.phong({ map: paintTex, shininess: 34, specular: 0x101412 });
  const piece = (w: number, h: number, d: number, x: number, y: number, z: number, chamfer: number) =>
    m.box(w, h, d, paint, leaf, x, y, z, { chamfer, uv: { mode: "world", tile: [LW, LH], offset: [x + LW / 2, y, z] } });
  const STILE = 0.11;
  const RAIL_TOP = 0.11;
  const LOCK = 0.16;
  const LOCK_Y = 1.0;
  const BOTTOM = 0.2;
  for (const s of [1, -1]) piece(STILE, LH, LT, s * (LW / 2 - STILE / 2), LH / 2, 0, 0.006);
  const inner = LW - 2 * STILE;
  piece(inner, RAIL_TOP, LT, 0, LH - RAIL_TOP / 2, 0, 0.006);
  piece(inner, LOCK, LT, 0, LOCK_Y, 0, 0.006);
  piece(inner, BOTTOM, LT, 0, BOTTOM / 2, 0, 0.006);
  // almofadas: mais finas (2 cm) e centradas na espessura, com chanfro largo (o "rebaixo" lê pela luz)
  const upperY0 = LOCK_Y + LOCK / 2;
  const upperY1 = LH - RAIL_TOP;
  const lowerY0 = BOTTOM;
  const lowerY1 = LOCK_Y - LOCK / 2;
  piece(inner, upperY1 - upperY0, 0.02, 0, (upperY0 + upperY1) / 2, 0, 0.009);
  piece(inner, lowerY1 - lowerY0, 0.02, 0, (lowerY0 + lowerY1) / 2, 0, 0.009);

  // ferragens no lado direito (x +), na frente da folha
  const fz = LT / 2;
  const hx = LW / 2 - 0.055;
  m.box(0.042, 0.2, 0.004, faces(brass, { front: escut }), leaf, hx, LOCK_Y - 0.02, fz + 0.002, { chamfer: 0.0012, uv: { mode: "face" }, cast: false });
  const lever = new T.Group();
  lever.position.set(hx, LOCK_Y + 0.035, fz + 0.004);
  // mola gasta: a alavanca não volta à horizontal
  lever.rotation.z = -0.1;
  leaf.add(lever);
  m.mesh(new T.CylinderGeometry(0.009, 0.011, 0.022, 10), brass, lever, 0, 0, 0.011, { rx: Math.PI / 2, cast: false });
  m.mesh(new T.CylinderGeometry(0.0065, 0.0065, 0.11, 8), brass, lever, -0.055, 0, 0.022, { rz: Math.PI / 2, cast: false });
  m.mesh(new T.SphereGeometry(0.0085, 8, 6), brass, lever, -0.11, 0, 0.022, { cast: false });
  // dobradiças do lado esquerdo (três nós de aço)
  for (const y of [0.22, 1.05, LH - 0.22]) m.mesh(new T.CylinderGeometry(0.007, 0.007, 0.09, 8), steel, leaf, -LW / 2 - 0.0015, y, fz - 0.004, { cast: false });

  // fio de luz fria por baixo da folha: um plano emissivo atrás dela, visível só pela fresta
  m.mesh(new T.PlaneGeometry(LW, 0.02), leak, root, 0, SILL + 0.009, leafBack - 0.002, { cast: false, recv: false });
  return root;
}

/* ================================================================== tapete */

/**
 * Tapete de 1,6 × 1,1 m com 7 mm de espessura: topo em grade de 5 cm (a textura não nada), laterais da trama
 * crua, uma ruga atravessada perto da ponta oeste (alguém tropeçou nela), e franjas de algodão nas duas pontas
 * curtas, em fios recortados por alfa.
 */
export function buildRug(m: Maker): THREE.Group {
  const { T, kit } = m;
  const root = new T.Group();
  root.name = "tapete";
  const W = RUG.x1 - RUG.x0;
  const D = RUG.z1 - RUG.z0;
  const THICK = 0.007;
  const top = kit.phong({ map: m.tex("tapete", tx.drawRug, 256), shininess: 2, specular: 0x000000 });
  const side = kit.phong({ map: m.tex("tapete-lado", tx.drawRugSide, 64), shininess: 2, specular: 0x000000 });
  const fringe = kit.phong({ map: m.tex("tapete-franja", tx.drawFringe, 128), alphaTest: 0.5, side: m.T.DoubleSide, shininess: 2, specular: 0x000000 });
  // ruga: lombada suave de 1,4 cm a 35 cm da ponta oeste, um pouco torta
  const ridge = (x: number, z: number) => {
    const c = RUG.x0 + 0.35 + (z - RUG.z0) * 0.08;
    const t = (x - c) / 0.07;
    return 0.014 * Math.exp(-t * t);
  };
  const xs = breakpoints(RUG.x0, RUG.x1, 0.05);
  const zs = breakpoints(RUG.z0, RUG.z1, 0.05);
  const surf = latticeSurface(T, {
    us: xs,
    vs: zs,
    at: (u, v) => [u, THICK + ridge(u, v), v],
    normal: [0, 1, 0],
    // metros do tapete: (0,0) no canto sudoeste, v para o norte (ver drawRug)
    uv: (u, v) => [(u - RUG.x0) / W, (RUG.z1 - v) / D],
  });
  surf.computeVertexNormals();
  m.mesh(surf, top, root, 0, 0, 0, { cast: false, name: "tapete-topo" });
  // laterais: seguem a borda do topo (com a ruga) e descem 7 mm
  const skirt = (pts: [number, number][]) => {
    const positions: number[] = [];
    const uvs: number[] = [];
    let along = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x, z] = pts[i];
      if (i > 0) along += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);
      const y = THICK + ridge(x, z);
      positions.push(x, y, z, x, y - THICK, z);
      uvs.push(along / 0.25, 1, along / 0.25, 0);
    }
    const index: number[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
    geo.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
    geo.setIndex(index);
    geo.computeVertexNormals();
    return geo;
  };
  // sentido anti-horário visto de cima: as faces ficam para fora
  const north = xs.map((x) => [x, RUG.z0] as [number, number]).reverse();
  const south = xs.map((x) => [x, RUG.z1] as [number, number]);
  const west = zs.map((z) => [RUG.x0, z] as [number, number]);
  const east = zs.map((z) => [RUG.x1, z] as [number, number]).reverse();
  for (const edge of [south, east, north, west]) m.mesh(skirt(edge), side, root, 0, 0, 0, { cast: false });
  // franjas: 7 cm para fora de cada ponta curta, rente ao chão (2,5 mm, sem tocar o piso)
  const FR = 0.07;
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? RUG.x0 : RUG.x1;
    const geo = latticeSurface(T, {
      us: breakpoints(RUG.z0, RUG.z1, 0.1),
      vs: [0, FR / 2, FR],
      at: (u, v) => [x0 + s * v, 0.0025 + 0.0015 * (1 - v / FR), u],
      normal: [0, 1, 0],
      uv: (u, v) => [(u - RUG.z0) / D, 1 - v / FR],
    });
    m.mesh(geo, fringe, root, 0, 0, 0, { cast: false });
  }
  return root;
}

/* ================================================================== luminária pendente */

export type LampParts = { pivot: THREE.Group; bulbY: number };

/**
 * Luminária de cúpula esmaltada (verde por fora, branca por dentro, borda enrolada e lascada), soquete de
 * baquelite, fio de tecido e canopla no teto. O pivô no teto balança (quem anima é a camada); a lâmpada e a luz
 * ficam a `bulbY` abaixo dele.
 */
export function buildLamp(m: Maker, x: number, ceilingY: number, z: number, bulbWorldY: number): LampParts {
  const { T, kit } = m;
  const pivot = new T.Group();
  pivot.name = "luminaria";
  pivot.position.set(x, ceilingY, z);
  const drop = ceilingY - bulbWorldY;
  const metal = kit.phong({ color: 0x1a1a18, shininess: 30 });
  const cordMat = kit.phong({ color: 0x141210, shininess: 4 });
  const bakelite = kit.phong({ color: 0x2a1a10, shininess: 50 });
  const outer = kit.phong({ map: m.tex("cupula-fora", tx.drawEnamelOut, 128), shininess: 60, specular: 0x202a24 });
  const innerMat = kit.phong({ map: m.tex("cupula-dentro", tx.drawEnamelIn, 64), side: T.BackSide, shininess: 30 });
  const bulb = kit.basic({ color: 0xffd8a0 });
  const opts = { cast: false };
  // canopla
  const rose = [
    [0.0001, 0],
    [0.055, 0],
    [0.056, -0.006],
    [0.05, -0.02],
    [0.012, -0.03],
    [0.0001, -0.03],
  ].map(([r, y]) => new T.Vector2(r, y));
  m.mesh(new T.LatheGeometry(rose, 14), metal, pivot, 0, -0.001, 0, opts);
  // fio até a cúpula
  const shadeTop = -(drop - 0.07);
  m.mesh(new T.CylinderGeometry(0.0035, 0.0035, -shadeTop - 0.03, 5), cordMat, pivot, 0, (shadeTop - 0.03) / 2, 0, opts);
  // cúpula: cone com a borda enrolada (perfil), de fora e de dentro (2 mm para dentro, sem coplanar)
  const shade = (k: number) =>
    [
      [0.03, 0],
      [0.045, -0.02],
      [0.1, -0.075],
      [0.155, -0.13],
      [0.168, -0.142],
      [0.172, -0.15],
      [0.166, -0.155],
    ].map(([r, y]) => new T.Vector2(r * k, y));
  m.mesh(new T.LatheGeometry(shade(1), 18), outer, pivot, 0, shadeTop, 0, opts);
  m.mesh(new T.LatheGeometry(shade(0.985).slice(0, 5), 18), innerMat, pivot, 0, shadeTop - 0.002, 0, opts);
  // soquete e lâmpada
  m.mesh(new T.CylinderGeometry(0.02, 0.022, 0.045, 10), bakelite, pivot, 0, shadeTop - 0.03, 0, opts);
  const bulbMesh = m.mesh(new T.SphereGeometry(0.032, 10, 8), bulb, pivot, 0, -drop, 0, { cast: false, recv: false });
  bulbMesh.scale.set(1, 1.15, 1);
  return { pivot, bulbY: -drop };
}

/* ================================================================== detalhes de parede */

/** Interruptor de baquelite creme (espelho chanfrado + tecla) e o prego que sobrou de um quadro. */
export function buildWallDetails(m: Maker, parent: THREE.Object3D) {
  const { T, kit } = m;
  const plate = kit.phong({ color: 0xb8ae94, shininess: 40 });
  const toggle = kit.phong({ color: 0x8e846c, shininess: 40 });
  const nail = kit.phong({ color: 0x3a342c, specular: 0x202020, shininess: 30 });
  // interruptor à direita da porta, a 1,25 m
  const sw = new T.Group();
  sw.position.set(DOOR.x1 + 0.28, 1.25, DOOR.wallZ);
  parent.add(sw);
  m.box(0.075, 0.12, 0.008, plate, sw, 0, 0, 0.004, { chamfer: 0.0025, cast: false });
  m.box(0.016, 0.03, 0.01, toggle, sw, 0, 0.004, 0.012, { chamfer: 0.003, rx: -0.2, cast: false });
  // prego torto na parede oeste, sobre o contorno do quadro tirado
  m.mesh(new T.CylinderGeometry(0.0025, 0.0018, 0.03, 6), nail, parent, -2 + 0.012, 1.86, 0.45, { rz: Math.PI / 2 - 0.25, cast: false });
  m.mesh(new T.CylinderGeometry(0.0055, 0.0055, 0.0016, 8), nail, parent, -2 + 0.026, 1.863, 0.45, { rz: Math.PI / 2 - 0.25, cast: false });
}
