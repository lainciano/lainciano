import type * as THREE from "three";
import { blotches, edgeWear, grain, mulberry, type Draw } from "../render/paint";
import { chamferBox } from "../render/shapes";

/**
 * Pintura (canvas) e geometrias das mãos, tiradas de `hands.ts` (T8): pele, dorso, unha, manga, serrilha e
 * anodizado, mais falange afilada, nó, palma arqueada e manga com dobras. Só funções puras.
 */

/* ------------------------------------------------ pintura (render/paint.ts) */

/** Pele: tom quente com variação, mais escura nas pontas da falange (dobras das juntas). */
export const drawSkin: Draw = (g, w, h) => {
  const r = mulberry(900);
  g.fillStyle = "#9a725c";
  g.fillRect(0, 0, w, h);
  blotches(g, w, h, r, 5, [128, 78, 62], 1.4, 0.32);
  blotches(g, w, h, r, 12, [176, 132, 110], 2.2, 0.14);
  for (const [y, a] of [
    [0.04, 0.35],
    [0.96, 0.35],
    [0.12, 0.15],
    [0.88, 0.15],
  ] as const) {
    g.fillStyle = `rgba(78,44,32,${a})`;
    g.fillRect(0, h * y - 1, w, 2);
  }
  grain(g, w, h, r, 8);
};

/** Dorso da mão: pele com os tendões claros e as veias sutis indo dos nós ao pulso. */
export const drawSkinBack: Draw = (g, w, h) => {
  drawSkin(g, w, h);
  const r = mulberry(905);
  for (let i = 0; i < 4; i++) {
    const x = w * (0.2 + i * 0.2);
    g.strokeStyle = "rgba(200,160,136,.28)";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x, 0);
    g.quadraticCurveTo(x + (r() - 0.5) * 8, h * 0.5, w * 0.5 + (x - w * 0.5) * 0.35, h);
    g.stroke();
  }
  g.strokeStyle = "rgba(80,70,96,.18)";
  g.lineWidth = 1.4;
  g.beginPath();
  g.moveTo(w * 0.3, h);
  g.bezierCurveTo(w * 0.4, h * 0.6, w * 0.65, h * 0.5, w * 0.7, h * 0.15);
  g.stroke();
};

/** Unha: rosada com a borda livre mais clara. */
export const drawNail: Draw = (g, w, h) => {
  g.fillStyle = "#c99e8c";
  g.fillRect(0, 0, w, h);
  g.fillStyle = "rgba(240,224,210,.75)";
  g.fillRect(0, 0, w, h * 0.25);
  g.fillStyle = "rgba(120,70,60,.3)";
  g.fillRect(0, h * 0.92, w, h * 0.08);
};

/** Manga da jaqueta: sarja cinza-escura, sombras de dobra, costura e o punho puído. */
export const drawSleeve: Draw = (g, w, h) => {
  const r = mulberry(890);
  g.fillStyle = "#33342f";
  g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      g.fillStyle = ((x >> 1) + (y >> 1)) % 4 < 2 ? "rgba(255,255,255,.04)" : "rgba(0,0,0,.09)";
      g.fillRect(x, y, 2, 2);
    }
  }
  // dobras: faixas escuras e claras oblíquas perto do punho (v baixo)
  for (let i = 0; i < 6; i++) {
    const y = h * (0.05 + i * 0.07 + r() * 0.03);
    g.fillStyle = "rgba(0,0,0,.22)";
    g.fillRect(0, y, w, 2);
    g.fillStyle = "rgba(255,255,255,.06)";
    g.fillRect(0, y + 2, w, 1);
  }
  // costura ao longo da manga
  g.strokeStyle = "rgba(150,146,130,.5)";
  g.setLineDash([2, 2]);
  g.beginPath();
  g.moveTo(w * 0.5, 0);
  g.lineTo(w * 0.5, h);
  g.stroke();
  g.setLineDash([]);
  blotches(g, w, h, r, 6, [0, 0, 0], 1.5, 0.3);
  edgeWear(g, w, h, r, [100, 96, 88], 5, 0.45);
  grain(g, w, h, r, 14);
};

export const drawKnurl: Draw = (g, w, h) => {
  const r = mulberry(910);
  g.fillStyle = "#1c1c1e";
  g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 3) {
    for (let x = (y / 3) % 2 ? 0 : 1.5; x < w; x += 3) {
      g.fillStyle = `rgba(150,150,156,${0.18 + r() * 0.16})`;
      g.fillRect(x, y, 1, 1);
    }
  }
  for (let i = 0; i < 18; i++) {
    g.fillStyle = `rgba(170,170,176,${0.12 + r() * 0.2})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 4, 1);
  }
};

export const drawAnodized: Draw = (g, w, h) => {
  const r = mulberry(920);
  g.fillStyle = "#202024";
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = `rgba(170,170,178,${0.1 + r() * 0.22})`;
    g.lineWidth = 0.5;
    const x = r() * w;
    const y = r() * h;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 18, y + (r() - 0.5) * 3);
    g.stroke();
  }
  edgeWear(g, w, h, r, [120, 120, 126], 3, 0.6);
};

/* ------------------------------------------------ geometria */

/**
 * Falange afilada (raio r0 na base, r1 na ponta), seção oval, levemente arqueada para o dorso (+y), ao longo de +x
 * de 0 a `len`, aberta nas pontas (o nó e a ponta redonda fecham). 6 lados × 2 anéis = 24 triângulos.
 */
export function phalanx(T: typeof THREE, len: number, r0: number, r1: number, bow: number, sides = 6): THREE.BufferGeometry {
  const geo = new T.CylinderGeometry(r1, r0, len, sides, 2, true);
  geo.rotateZ(-Math.PI / 2);
  geo.translate(len / 2, 0, 0);
  const pos = geo.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) / len;
    pos.setY(i, pos.getY(i) + bow * len * 4 * u * (1 - u));
    pos.setZ(i, pos.getZ(i) * 0.88);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Nó/ponta: esfera baixa (5 × 3: 20 triângulos), um pouco achatada. */
export function knob(T: typeof THREE, r: number): THREE.BufferGeometry {
  const geo = new T.SphereGeometry(r, 5, 3);
  geo.scale(1, 0.92, 0.88);
  return geo;
}

/** Palma com o dorso arqueado: caixa chanfrada (grade fina) com a face de fora (+x) estufada no meio. */
export function palmGeo(T: typeof THREE, w: number, h: number, d: number, out: "x" | "y"): THREE.BufferGeometry {
  const geo = chamferBox(T, w, h, d, { chamfer: 0.008, seg: 40, uv: { mode: "face" } });
  const pos = geo.getAttribute("position");
  const [ha, hb, hc] = out === "x" ? [w / 2, h / 2, d / 2] : [h / 2, w / 2, d / 2];
  for (let i = 0; i < pos.count; i++) {
    const a = out === "x" ? pos.getX(i) : pos.getY(i);
    const b = out === "x" ? pos.getY(i) : pos.getX(i);
    const c = pos.getZ(i);
    if (a < ha * 0.3) continue;
    const bulge = 0.0045 * Math.max(0, 1 - (b / hb) ** 2) * Math.max(0, 1 - (c / hc) ** 2);
    if (out === "x") pos.setX(i, a + bulge);
    else pos.setY(i, a + bulge);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Manga: cone aberto com dobras mais fundas perto do punho. */
export function sleeveGeo(T: typeof THREE, r0: number, r1: number, len: number): THREE.BufferGeometry {
  const geo = new T.CylinderGeometry(r1, r0, len, 10, 5, true);
  const pos = geo.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const near = Math.max(0, (len / 2 - y) / len);
    const f = 1 + 0.07 * near * Math.sin(a * 3 + y * 38) + 0.02 * Math.sin(a * 5 - y * 20);
    pos.setX(i, x * f);
    pos.setZ(i, z * f);
  }
  geo.computeVertexNormals();
  return geo;
}
