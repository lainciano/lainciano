import type * as THREE from "three";
import { createStaticBatch } from "../../render/batch";
import type { Maker } from "../../render/kit";
import type { UvMode } from "../../render/shapes";
import { BASEMENT_DOOR, FLUORESCENTS, LAMP, NORTH_DOOR, ROOM, SOUTH_DOOR, WALL_T, WINDOW, type WindowLight } from "./places";
import * as tx from "./textures";

/**
 * Peças da casca da Antessala, em código (contratos 4b, bíblia 12b.4): espessura real, chanfros, peças que começam
 * onde a outra termina (nada coplanar sobreposto: o que encosta na parede fica DENTRO do vão, e as abas sobre o
 * reboco têm a face de trás virada para fora, descartada), faces grandes subdivididas. Cada geometria passa por
 * `own` (Ruling 7); materiais e texturas são do kit, com as chaves prefixadas por `antessala`.
 *
 * Cada vão é um grupo com a origem no pé do vão, na face de DENTRO da parede: o eixo local que entra na parede (o
 * lado de fora) é −z nas portas norte/sul (o grupo da sul gira 180°) e −x na janela; o Porão gira para a parede leste.
 */

/** Materiais da casca (um por papel; o lote junta por material: poucas chamadas). */
export type ShellMaterials = {
  iron: THREE.Material;
  glass: THREE.Material;
  plaster: THREE.Material;
  stone: THREE.Material;
  darkWood: THREE.Material;
  alu: THREE.Material;
  bakelite: THREE.Material;
  housing: THREE.Material;
  tube: THREE.Material;
  /** O escuro sem luz (o outro lado do Porão, a fresta no fim do corredor). */
  dark: THREE.Material;
};

export function shellMaterials(m: Maker): ShellMaterials {
  const { T, kit } = m;
  return {
    iron: kit.phong({ map: m.tex("ferro", tx.drawIron(2801), 128), shininess: 26, specular: 0x1c1c1c }),
    // vidro aramado: transparente, depois do resto (renderOrder 2 nas malhas); só a face da sala (ninguém o vê de
    // fora), então é o mesmo programa do Phong com textura e uma passada só
    glass: kit.phong({ map: m.tex("vidro-aramado", tx.drawWired(2811), 256), transparent: true, depthWrite: false, shininess: 140, specular: 0x1c2220 }),
    plaster: kit.phong({ map: m.tex("reboco", tx.drawPlaster, 128), shininess: 4, specular: 0x000000 }),
    stone: kit.phong({ map: m.tex("peitoril", tx.drawSill, 128), shininess: 30, specular: 0x202020 }),
    darkWood: kit.phong({ map: m.tex("madeira-escura", tx.drawDarkWood, 128), shininess: 34, specular: 0x1a120a }),
    alu: kit.phong({ color: 0x8e908e, specular: 0x505050, shininess: 60 }),
    bakelite: kit.phong({ color: 0xbdb399, specular: 0x202020, shininess: 40 }),
    housing: kit.phong({ map: m.tex("calha", tx.drawFluoHousing, 128), shininess: 30, specular: 0x202020 }),
    tube: kit.phong({ map: m.tex("tubo", tx.drawFluoTube, 64), shininess: 50, specular: 0x303030, emissive: 0x000000 }),
    // o escuro: mesmo programa dos planos de fundo (Basic com textura, sem névoa)
    dark: kit.basic({ map: m.tex("escuro", (g, w, h) => { g.fillStyle = "#000"; g.fillRect(0, 0, w, h); }, 64), fog: false }),
  };
}

/** UV em metros (o ferro e a madeira têm a mesma escala em toda peça). */
const IRON_UV: UvMode = { mode: "world", tile: [0.4, 0.4] };
const GLASS_TILE = 0.5;

/**
 * Vidro aramado: plano subdividido (~5 por metro, não nada) com a UV em metros (a tela tem o mesmo passo em todo
 * painel). Olha para +z; o chamador gira.
 */
function pane(m: Maker, w: number, h: number, mat: THREE.Material, parent: THREE.Object3D, x: number, y: number, z: number, ry = 0): THREE.Mesh {
  const { T } = m;
  const geo = new T.PlaneGeometry(w, h, Math.max(1, Math.round(w * 5)), Math.max(1, Math.round(h * 5)));
  const uv = geo.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / GLASS_TILE, (uv.getY(i) * h) / GLASS_TILE);
  const mesh = m.mesh(geo, mat, parent, x, y, z, { ry, cast: false, recv: false });
  mesh.renderOrder = 2;
  return mesh;
}

/** Junta as peças de uma folha (grupo) numa malha por material, no espaço da própria folha (ela gira inteira). */
function mergeLeaf(m: Maker, leaf: THREE.Group) {
  const batch = createStaticBatch(m.T, m.own, { name: leaf.name });
  batch.add(leaf);
  batch.build(leaf);
}

/* ================================================================== porta norte (dupla, vidro aramado) */

export const NORTH_LEAF = { left: "porta-norte-folha-o", right: "porta-norte-folha-l" } as const;

/**
 * Porta norte para o corredor das alas: batente de ferro grafite em U (6 cm, a espessura da parede) com aba sobre o
 * reboco, soleira de granito, e duas folhas de ferro (montantes, travessas, chapa de chute embaixo, vidro aramado em
 * cima) com a barra de empurrar de alumínio do lado da sala. As folhas são soltas (`dynamic`: a B17 as abre),
 * cada uma juntada numa malha por material; as dobradiças ficam nas bordas de fora. Atrás, o corredor no escuro.
 */
export function buildNorthDoor(m: Maker, mats: ShellMaterials): { root: THREE.Group; leaves: THREE.Group[] } {
  const { T, kit } = m;
  const root = new T.Group();
  root.name = "porta-norte";
  const half = (NORTH_DOOR.x1 - NORTH_DOOR.x0) / 2;
  root.position.set((NORTH_DOOR.x0 + NORTH_DOOR.x1) / 2, 0, NORTH_DOOR.wallZ);
  const top = NORTH_DOOR.top;
  frame(m, mats, root, half, top, WALL_T, 0.06);
  m.box(2 * half, 0.012, WALL_T + 0.014, mats.stone, root, 0, 0.006, -WALL_T / 2 + 0.007, { chamfer: 0.003, uv: { mode: "world", tile: [0.6, 0.6] } });

  const JW = 0.06;
  const clear = 2 * half - 2 * JW;
  const LW = (clear - 0.012) / 2;
  const y0 = 0.018;
  const LH = top - JW - 0.004 - y0;
  const leaves: THREE.Group[] = [];
  for (const side of [-1, 1] as const) {
    // dobradiça na borda de fora da folha, no meio da espessura (a folha abre para o corredor)
    const pivot = new T.Group();
    pivot.name = side < 0 ? NORTH_LEAF.left : NORTH_LEAF.right;
    pivot.position.set(side * (half - JW - 0.004), y0, -0.08);
    root.add(pivot);
    const leaf = new T.Group();
    leaf.name = `${pivot.name}-pecas`;
    leaf.position.set(-side * (LW / 2), 0, 0);
    pivot.add(leaf);
    // a barra fica do lado do encontro das folhas
    glassLeaf(m, mats, leaf, LW, LH, { bar: (-side) as -1 | 1, grille: false });
    mergeLeaf(m, leaf);
    leaves.push(pivot);
  }

  // o corredor das alas, no escuro: verde até meia altura, chão de granilite apagado, a fresta de uma porta lá no fundo
  const beyond = new T.Group();
  beyond.name = "corredor-alem";
  root.add(beyond);
  // sem luz própria (o assado leria as normais de fora da caixa): a tinta escura basta. A caixa é virada do avesso
  // na geometria (escala −1 inverte o giro dos triângulos), não pelo `side`: o mesmo programa dos planos de fundo.
  const corridor = kit.basic({ map: m.tex("corredor", tx.drawCorridor, 64), color: 0x5a5a5a, fog: false });
  const CW = 2 * half;
  const CD = 4.6;
  const hall = new T.BoxGeometry(CW, 2.45, CD, 2, 4, 10);
  hall.scale(-1, 1, 1);
  m.mesh(hall, corridor, beyond, 0, 2.45 / 2 - 0.01, -WALL_T - CD / 2, { cast: false });
  m.mesh(new T.PlaneGeometry(0.02, 1.9), mats.dark, beyond, 0.3, 0.96, -WALL_T - CD + 0.012, { cast: false, recv: false });
  return { root, leaves };
}

/**
 * Batente de ferro em U no vão (montantes e travessa com a profundidade `depth` da parede, por DENTRO do vão) e a aba
 * de 3,5 cm sobre o reboco do lado da sala (6 mm de espessura; a face de trás olha para a parede e é descartada).
 */
function frame(m: Maker, mats: ShellMaterials, root: THREE.Object3D, half: number, top: number, depth: number, jw: number) {
  const o = { chamfer: 0.003, uv: IRON_UV, seg: 3 };
  for (const s of [-1, 1]) m.box(jw, top, depth, mats.iron, root, s * (half - jw / 2), top / 2, -depth / 2, o);
  m.box(2 * half - 2 * jw, jw, depth, mats.iron, root, 0, top - jw / 2, -depth / 2, o);
  const LIP = 0.035;
  const T6 = 0.006;
  for (const s of [-1, 1]) m.box(jw + LIP, top + LIP, T6, mats.iron, root, s * (half - jw + (jw + LIP) / 2), (top + LIP) / 2, T6 / 2, o);
  m.box(2 * (half - jw), jw + LIP, T6, mats.iron, root, 0, top - jw + (jw + LIP) / 2, T6 / 2, o);
}

/**
 * Uma folha de porta de ferro e vidro aramado, com a origem no pé, no centro: montantes de 5 cm, travessas, chapa
 * de chute até 0,875 m e vidro em cima. `bar`: lado do encontro das folhas (−1/+1) onde fica a barra de empurrar
 * (do lado da sala, +z); `grille`: grade de barras chatas por fora (−z), a da porta do pátio.
 */
function glassLeaf(m: Maker, mats: ShellMaterials, leaf: THREE.Group, LW: number, LH: number, o: { bar: -1 | 1; grille: boolean; handle?: boolean }) {
  const t = 0.04;
  const S = 0.05;
  // peças finas: 3 segmentos por metro bastam (o nado é das faces grandes); baguetes e grade, 1
  const ob = { chamfer: 0.003, uv: IRON_UV, seg: 3 };
  const thin = { uv: IRON_UV, seg: 1 };
  for (const s of [-1, 1]) m.box(S, LH, t, mats.iron, leaf, s * (LW / 2 - S / 2), LH / 2, 0, ob);
  const inner = LW - 2 * S;
  m.box(inner, 0.06, t, mats.iron, leaf, 0, LH - 0.03, 0, ob);
  m.box(inner, 0.05, t, mats.iron, leaf, 0, 0.9, 0, ob);
  m.box(inner, 0.1, t, mats.iron, leaf, 0, 0.05, 0, ob);
  // chapa de chute: mais fina que a moldura, recuada no meio da espessura (lê como painel)
  m.box(inner, 0.775, 0.012, mats.iron, leaf, 0, 0.1 + 0.775 / 2, 0, { chamfer: 0.002, uv: IRON_UV, seg: 3 });
  const gy0 = 0.925;
  const gy1 = LH - 0.06;
  pane(m, inner, gy1 - gy0, mats.glass, leaf, 0, (gy0 + gy1) / 2, 0);
  // baguetes de ferro que prendem o vidro (dos dois lados, 1 cm, encostadas no vidro e na moldura)
  for (const z of [-0.012, 0.012]) {
    for (const y of [gy0 + 0.005, gy1 - 0.005]) m.box(inner, 0.01, 0.012, mats.iron, leaf, 0, y, z, thin);
    for (const s of [-1, 1]) m.box(0.01, gy1 - gy0 - 0.02, 0.012, mats.iron, leaf, s * (inner / 2 - 0.005), (gy0 + gy1) / 2, z, thin);
  }
  const barX = o.bar * (LW / 2 - S - 0.22);
  if (o.handle) {
    // puxador vertical de tubo de alumínio (porta do pátio), do lado da sala
    m.mesh(new m.T.CylinderGeometry(0.012, 0.012, 0.36, 8), mats.alu, leaf, o.bar * (LW / 2 - S - 0.05), 1.05, t / 2 + 0.045, { cast: false });
    for (const y of [0.9, 1.2]) m.box(0.02, 0.02, 0.045, mats.alu, leaf, o.bar * (LW / 2 - S - 0.05), y, t / 2 + 0.0225, { chamfer: 0.003, cast: false });
  } else {
    // barra de empurrar de alumínio a 1 m, com dois apoios
    m.box(0.4, 0.03, 0.026, mats.alu, leaf, barX, 1.0, t / 2 + 0.045, { chamfer: 0.006, cast: false });
    for (const dx of [-0.17, 0.17]) m.box(0.02, 0.02, 0.032, mats.alu, leaf, barX + dx, 1.0, t / 2 + 0.016, { chamfer: 0.003, cast: false });
  }
  if (o.grille) {
    // grade de segurança por fora: barras chatas verticais e duas travessas, soldadas na moldura
    const gz = -t / 2 - 0.012;
    const n = Math.round(inner / 0.11);
    for (let i = 1; i < n; i++) m.box(0.012, gy1 - gy0, 0.024, mats.iron, leaf, -inner / 2 + (i * inner) / n, (gy0 + gy1) / 2, gz, { uv: IRON_UV, seg: 1 });
    for (const y of [gy0 + (gy1 - gy0) * 0.36, gy0 + (gy1 - gy0) * 0.72]) m.box(inner, 0.03, 0.008, mats.iron, leaf, 0, y, gz - 0.016, { uv: IRON_UV, seg: 2 });
  }
}

/* ================================================================== porta sul (vidro e grade; a entrada, fechada) */

/**
 * Porta do pátio, por onde a pessoa entrou (fechada atrás dela): mesmo batente e soleira, duas folhas de ferro e vidro
 * aramado com a grade de barras chatas por fora e puxadores de tubo do lado da sala. Estática (vai para o lote). Lá
 * fora, o pátio pintado em código.
 */
export function buildSouthDoor(m: Maker, mats: ShellMaterials, light: WindowLight): THREE.Group {
  const { T, kit } = m;
  const root = new T.Group();
  root.name = "porta-sul";
  const half = (SOUTH_DOOR.x1 - SOUTH_DOOR.x0) / 2;
  root.position.set((SOUTH_DOOR.x0 + SOUTH_DOOR.x1) / 2, 0, SOUTH_DOOR.wallZ);
  root.rotation.y = Math.PI;
  const top = SOUTH_DOOR.top;
  frame(m, mats, root, half, top, WALL_T, 0.06);
  m.box(2 * half, 0.012, WALL_T + 0.014, mats.stone, root, 0, 0.006, -WALL_T / 2 + 0.007, { chamfer: 0.003, uv: { mode: "world", tile: [0.6, 0.6] } });
  const JW = 0.06;
  const LW = (2 * half - 2 * JW - 0.012) / 2;
  const y0 = 0.018;
  const LH = top - JW - 0.004 - y0;
  for (const side of [-1, 1] as const) {
    const leaf = new T.Group();
    leaf.position.set(side * (LW / 2 + 0.002), y0, -0.12);
    root.add(leaf);
    glassLeaf(m, mats, leaf, LW, LH, { bar: (-side) as -1 | 1, grille: true, handle: true });
  }
  // o pátio às costas: concreto molhado e a outra ala no escuro (plano de fundo, sem névoa)
  const patio = kit.basic({ map: m.tex(`patio-${light}`, tx.drawPatio(light), 256), fog: false });
  const back = m.mesh(new T.PlaneGeometry(16, 8), patio, root, 0, 1.6, -7.5, { cast: false, recv: false });
  back.name = "patio";
  return root;
}

/* ================================================================== janela basculante com grade (oeste) */

/** O lago visto da janela: as texturas (a névoa desliza pelo `offset`, a camada a anima). */
export type WindowView = { root: THREE.Group; mist: THREE.Texture };

/**
 * Janela basculante na parede oeste: o vão revestido de reboco (a espessura da parede), peitoril de granito que sai
 * 5 cm para a sala, caixilho de ferro e três básculas de vidro aramado (a do meio aberta, inclinada para dentro),
 * grade de barras por fora, e o lago: a névoa azul que passa devagar diante do vidro e, ao longe, a margem, os fios
 * do Planalto e o poste de sódio. Tudo estático (o lote), menos o `offset` da névoa.
 */
export function buildWindow(m: Maker, mats: ShellMaterials, light: WindowLight): WindowView {
  const { T, kit } = m;
  const root = new T.Group();
  root.name = "janela";
  const zc = (WINDOW.z0 + WINDOW.z1) / 2;
  const hw = (WINDOW.z1 - WINDOW.z0) / 2;
  const H = WINDOW.top - WINDOW.sill;
  const yc = (WINDOW.sill + WINDOW.top) / 2;
  root.position.set(WINDOW.wallX, 0, zc);
  const plasterUv: UvMode = { mode: "world", tile: [0.5, 0.5] };
  // reboco do vão: dois lados e a verga, 2 cm por dentro do furo e 1 cm por trás da parede (a face da frente fica 1 mm
  // atrás do plano da parede: a borda do furo, que não divide os vértices com a caixa, nunca abre fresta para fora)
  const RD = WALL_T - 0.001;
  for (const s of [-1, 1]) m.box(RD, H + 0.02, 0.03, mats.plaster, root, -0.001 - RD / 2, yc + 0.01, s * (hw - 0.005), { uv: plasterUv, cast: false });
  m.box(RD, 0.03, 2 * hw - 0.04, mats.plaster, root, -0.001 - RD / 2, WINDOW.top - 0.005, 0, { uv: plasterUv, cast: false });
  // peitoril de granito: atravessa a parede e sai 5 cm, com 5 cm de sobra para cada lado (dentro da alvenaria)
  m.box(WALL_T + 0.05, 0.04, 2 * hw + 0.1, mats.stone, root, -WALL_T / 2 + 0.025, WINDOW.sill - 0.02, 0, { chamfer: 0.004, uv: { mode: "world", tile: [0.6, 0.6] } });
  // caixilho de ferro no meio da espessura
  const fx = -0.12;
  const fo = { chamfer: 0.003, uv: IRON_UV, seg: 3 };
  const fi = hw - 0.02;
  for (const s of [-1, 1]) m.box(0.05, H - 0.02, 0.04, mats.iron, root, fx, yc - 0.01, s * (fi - 0.02), fo);
  m.box(0.05, 0.04, 2 * fi - 0.08, mats.iron, root, fx, WINDOW.top - 0.04, 0, fo);
  m.box(0.05, 0.04, 2 * fi - 0.08, mats.iron, root, fx, WINDOW.sill + 0.02, 0, fo);
  // três básculas (cada uma gira no eixo horizontal do meio); a do meio está aberta, o alto para dentro
  const inner = 2 * fi - 0.08;
  // vão livre entre a travessa de baixo (até 4 cm acima do peitoril) e a de cima (6 cm abaixo do alto do vão)
  const PH = (H - 0.1) / 3;
  for (let i = 0; i < 3; i++) {
    const pv = new T.Group();
    pv.position.set(fx, WINDOW.sill + 0.04 + PH * (i + 0.5), 0);
    if (i === 1) pv.rotation.z = -0.38;
    root.add(pv);
    for (const s of [-1, 1]) m.box(0.025, 0.022, inner, mats.iron, pv, 0, s * (PH / 2 - 0.011), 0, { uv: IRON_UV, seg: 2 });
    for (const s of [-1, 1]) m.box(0.025, PH - 0.044, 0.022, mats.iron, pv, 0, 0, s * (inner / 2 - 0.011), { uv: IRON_UV, seg: 2 });
    pane(m, inner - 0.044, PH - 0.044, mats.glass, pv, 0, 0, 0, Math.PI / 2);
  }
  // grade por fora: nove barras quadradas e duas travessas chatas
  const gx = -WALL_T + 0.012;
  for (let i = 0; i < 9; i++) m.box(0.016, H - 0.02, 0.016, mats.iron, root, gx, yc - 0.01, -fi + 0.02 + (i * (2 * fi - 0.04)) / 8, { chamfer: 0.002, uv: IRON_UV, seg: 1 });
  for (const y of [WINDOW.sill + 0.28, WINDOW.sill + 0.76]) m.box(0.008, 0.03, 2 * fi, mats.iron, root, gx - 0.012, y, 0, { uv: IRON_UV, seg: 2 });

  // lá fora: a névoa que passa (alfa, desliza) e o lago ao fundo (sem a névoa da cena: é o céu)
  const mistTex = m.tex(`nevoa-${light}`, tx.drawMist(light), 256);
  const mist = kit.basic({ map: mistTex, transparent: true, depthWrite: false, fog: false });
  const mistPlane = m.mesh(new T.PlaneGeometry(10, 4), mist, root, -1.15, 1.6, 0, { ry: Math.PI / 2, cast: false, recv: false });
  mistPlane.renderOrder = 1;
  mistPlane.name = "nevoa";
  const lake = kit.basic({ map: m.tex(`lago-${light}`, tx.drawLake(light), 256), fog: false });
  m.mesh(new T.PlaneGeometry(18, 9), lake, root, -6.75, 2.2, 0, { ry: Math.PI / 2, cast: false, recv: false }).name = "lago";
  return { root, mist: mistTex };
}

/* ================================================================== vão do Porão (leste) */

/**
 * Vão da porta do Porão: batente e alisares de madeira escura envernizada, soleira de madeira gasta, e o escuro do
 * outro lado (a folha, o sigilo e a fresta são da B11). Fechado para a colisão (a parede leste não abre).
 */
export function buildBasementOpening(m: Maker, mats: ShellMaterials): THREE.Group {
  const { T } = m;
  const root = new T.Group();
  root.name = "porao-vao";
  const hw = (BASEMENT_DOOR.z1 - BASEMENT_DOOR.z0) / 2;
  root.position.set(BASEMENT_DOOR.wallX, 0, (BASEMENT_DOOR.z0 + BASEMENT_DOOR.z1) / 2);
  // o grupo olha para a sala: local −x é a sala, +x é a parede (gira para que o "dentro da parede" seja +x)
  const top = BASEMENT_DOOR.top;
  const wood: UvMode = { mode: "world", tile: [0.5, 1.2] };
  const JW = 0.04;
  for (const s of [-1, 1]) m.box(WALL_T, top, JW, mats.darkWood, root, WALL_T / 2, top / 2, s * (hw - JW / 2), { chamfer: 0.002, uv: wood, seg: 3 });
  m.box(WALL_T, JW, 2 * hw - 2 * JW, mats.darkWood, root, WALL_T / 2, top - JW / 2, 0, { chamfer: 0.002, uv: wood });
  // alisares: 7 cm, 1,6 cm de espessura, sobre o reboco (a face de trás olha para a parede)
  const TR = 0.07;
  const TT = 0.016;
  for (const s of [-1, 1]) m.box(TT, top + TR - JW, TR, mats.darkWood, root, -TT / 2, (top + TR - JW) / 2, s * (hw - JW + TR / 2), { chamfer: 0.004, uv: wood, seg: 3 });
  m.box(TT, TR, 2 * (hw - JW + TR), mats.darkWood, root, -TT / 2, top - JW + TR / 2, 0, { chamfer: 0.004, uv: wood });
  // soleira de madeira, gasta no meio
  m.box(WALL_T + 0.02, 0.015, 2 * hw - 2 * JW, mats.darkWood, root, WALL_T / 2 - 0.01, 0.0075, 0, { chamfer: 0.003, uv: wood });
  // o escuro do outro lado
  m.mesh(new T.BoxGeometry(0.3, top, 2 * hw), mats.dark, root, WALL_T + 0.15, top / 2, 0, { cast: false, recv: false }).name = "porao-escuro";
  return root;
}

/* ================================================================== fluorescentes, eletroduto, interruptor */

/** Uma calha de fluorescente apagada (1,26 m): esmalte creme, dois tubos de pontas pretas e os soquetes. */
function fluorescent(m: Maker, mats: ShellMaterials, tube: THREE.Material, parent: THREE.Object3D, x: number, z: number): { fixture: THREE.Group; tubes: THREE.Group } {
  const { T } = m;
  const fixture = new T.Group();
  fixture.position.set(x, ROOM.h, z);
  parent.add(fixture);
  m.box(1.26, 0.055, 0.2, mats.housing, fixture, 0, -0.002 - 0.0275, 0, { chamfer: 0.006, uv: { mode: "face" }, cast: false });
  for (const s of [-1, 1]) m.box(0.022, 0.032, 0.16, mats.bakelite, fixture, s * 0.611, -0.057 - 0.016, 0, { chamfer: 0.003, cast: false });
  const tubes = new T.Group();
  tubes.name = "fluorescente-tubos";
  fixture.add(tubes);
  for (const dz of [-0.05, 0.05]) m.mesh(new T.CylinderGeometry(0.013, 0.013, 1.2, 8, 6), tube, tubes, 0, -0.075, dz, { rz: Math.PI / 2, cast: false });
  return { fixture, tubes };
}

/** Uma calha sozinha (o laboratório): na origem, pendurada de y = pé-direito. */
export function buildFluorescentFixture(m: Maker, mats: ShellMaterials): THREE.Group {
  const root = new m.T.Group();
  root.name = "fluorescente";
  fluorescent(m, mats, mats.tube, root, 0, 0);
  return root;
}

export type CeilingParts = {
  root: THREE.Group;
  /** A calha da estranheza 1 e os tubos dela (soltos: a B19 acende o material `oddityTube`). */
  oddity: { fixture: THREE.Group; tubes: THREE.Group; tube: THREE.MeshPhongMaterial };
};

/**
 * As fluorescentes do prédio, apagadas (uma delas marcada para a estranheza 1, com material próprio e solta), o
 * eletroduto de ferro que as alimenta (desce pela parede sul até o interruptor ao lado da porta) e o fio de pano que
 * ELE puxou da calha mais próxima até a lâmpada âmbar, preso no teto com grampos.
 */
export function buildCeilingFixtures(m: Maker, mats: ShellMaterials): CeilingParts {
  const { T, kit } = m;
  const root = new T.Group();
  root.name = "teto-pecas";
  let oddity: CeilingParts["oddity"] | null = null;
  for (const f of FLUORESCENTS) {
    const tube = f.oddity ? kit.phong({ map: m.tex("tubo", tx.drawFluoTube, 64), shininess: 50, specular: 0x303030, emissive: 0x000000 }) : mats.tube;
    const built = fluorescent(m, mats, tube, root, f.x, f.z);
    if (f.oddity) {
      built.fixture.name = "fluorescente-estranheza";
      built.fixture.userData.oddity = "fluorescente";
      // os dois tubos numa malha (uma chamada); soltos (a B19 acende o material)
      mergeLeaf(m, built.tubes);
      built.tubes.userData.dynamic = true;
      oddity = { fixture: built.fixture, tubes: built.tubes, tube: tube as THREE.MeshPhongMaterial };
    }
  }
  if (!oddity) throw new Error("antessala: sem a fluorescente da estranheza");
  // eletroduto (1" de ferro) junto à parede oeste e os ramais até as calhas
  const Y = ROOM.h - 0.03;
  const R = 0.012;
  const pipe = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
    const mesh = m.mesh(new T.CylinderGeometry(R, R, len, 6, Math.max(1, Math.round(len * 3))), mats.iron, root, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    // o cilindro nasce em y: gira para o eixo do trecho
    mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(x1 - x0, y1 - y0, z1 - z0).normalize());
    return mesh;
  };
  const elbow = (x: number, y: number, z: number) => m.box(0.034, 0.034, 0.034, mats.iron, root, x, y, z, { chamfer: 0.006, uv: IRON_UV });
  const WX = ROOM.minX + 0.05;
  const [f0, f1] = FLUORESCENTS;
  pipe(WX, Y, f0.z, WX, Y, f1.z);
  pipe(WX, Y, f0.z, f0.x - 0.63, Y, f0.z);
  pipe(WX, Y, f1.z, f1.x - 0.63, Y, f1.z);
  elbow(WX, Y, f0.z);
  elbow(WX, Y, f1.z);
  // descida até o interruptor ao lado da porta do pátio
  const SX = -0.85;
  const SZ = ROOM.maxZ - 0.03;
  pipe(SX, Y, f1.z + 0.1, SX, Y, SZ);
  pipe(SX, Y, SZ, SX, 1.36, SZ);
  elbow(SX, Y, SZ);
  for (const [x, z] of [
    [WX, -0.1],
    [WX, 0.75],
    [-1.85, f0.z],
    [SX, 2.0],
  ] as const)
    m.box(0.03, 0.01, 0.05, mats.iron, root, x, ROOM.h - 0.008, z, { uv: IRON_UV });
  // caixa e espelho do interruptor (baquelite creme), a tecla para baixo: está desligado
  const sw = new T.Group();
  sw.position.set(SX, 1.25, ROOM.maxZ);
  sw.rotation.y = Math.PI;
  root.add(sw);
  m.box(0.075, 0.12, 0.008, mats.bakelite, sw, 0, 0, 0.004, { chamfer: 0.0025, cast: false });
  m.box(0.016, 0.03, 0.01, mats.bakelite, sw, 0, -0.004, 0.012, { chamfer: 0.003, rx: 0.2, cast: false });
  // o fio que ele puxou da calha até a lâmpada: pano preto torcido, rente ao teto, com grampos
  const from = { x: f0.x + 0.63, z: f0.z };
  const to = { x: LAMP.x - 0.06, z: LAMP.z };
  const cord = m.mesh(new T.CylinderGeometry(0.003, 0.003, Math.hypot(to.x - from.x, to.z - from.z), 5, 4), mats.iron, root, (from.x + to.x) / 2, ROOM.h - 0.006, (from.z + to.z) / 2);
  cord.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(to.x - from.x, 0, to.z - from.z).normalize());
  for (const t of [0.2, 0.5, 0.8]) m.box(0.006, 0.004, 0.012, mats.alu, root, from.x + (to.x - from.x) * t, ROOM.h - 0.003, from.z + (to.z - from.z) * t, { cast: false, ry: Math.atan2(to.x - from.x, to.z - from.z) });
  return { root, oddity };
}

/* ================================================================== placeholders (só debug) */

/**
 * Caixas cinza onde virão os objetos (B9–B13), só com `?debug=1&placeholders=1` (nunca no jogo normal): cada uma
 * marcada (`userData.placeholder`, nome `placeholder:<id>`), com sombra. Inclui o objeto baixo de teste de sombra no
 * balcão (`teste-sombra`, um livro de 1,8 cm).
 */
export function buildPlaceholders(m: Maker, root: THREE.Object3D, boxes: readonly { id: string; x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }[]): THREE.Group {
  const { T, kit } = m;
  const group = new T.Group();
  group.name = "placeholders";
  group.userData.placeholder = true;
  const gray = kit.phong({ color: 0x6a6a6a, shininess: 6, specular: 0x101010 });
  for (const b of boxes) {
    const mesh = m.box(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0, gray, group, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2, { chamfer: Math.min(0.004, (b.y1 - b.y0) * 0.2), name: `placeholder:${b.id}` });
    mesh.userData.placeholder = true;
  }
  root.add(group);
  return group;
}
