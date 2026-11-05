import type * as THREE from "three";
import type { MaterialKit } from "../render/materials";
import { blotches, edgeWear, grain, mulberry, type Draw, type Rng } from "../render/paint";
import { mergeGeometries, ringSector, roundedSlab, type SlabPart, type V3 } from "../render/slab";

/**
 * Celular de flip de 2005 (T11), modelado em código, sem asset externo: base com o teclado, tampa articulada numa
 * dobradiça de três nós (dois da base, um da tampa), antena curta de borracha, tela interna (a tela do jogo é DOM
 * por cima, como no protótipo 7) e o visor externo pintado na tampa. Grafite com aro prateado, teclas prateadas com
 * a serigrafia escura; desgaste de uso pintado (brilho onde o polegar passa, lascas no aro, riscos no verso).
 *
 * Quatro malhas, quatro chamadas de desenho: base (casca + nós + antena), tampa (casca + nó do meio), teclas (as 21
 * num buffer só, cada uma com a sua faixa de vértices: apertar afunda só a dela) e a tela. Três texturas de canvas
 * 256² do kit (base, tampa, teclas), pintadas uma vez. A geometria é desta peça (`dispose`), os materiais e as
 * texturas são do kit (morrem com o engine).
 *
 * Eixos (no `root`): x largura, y comprimento (dobradiça em +y), z espessura (teclado virado para +z). A tampa gira
 * em torno de x no eixo da dobradiça: `setLid(0)` fechada sobre o teclado, `setLid(1)` aberta (≈160°).
 */

export const PHONE = {
  w: 0.047,
  base: { h: 0.086, t: 0.0095, r: 0.0085, bevel: 0.0014 },
  lid: { h: 0.084, t: 0.0075, r: 0.0085, bevel: 0.0013 },
  /** Raio do cano da dobradiça (cobre a espessura fechada: 17 mm). */
  barrel: 0.0087,
  /** Tampa aberta (rad). */
  open: 2.8,
  /** Tela interna, no espaço da tampa (centro em y; a tampa vai de y = −h, ponta livre, a 0, dobradiça). */
  screen: { w: 0.031, h: 0.039, y: -0.045 },
  /** Curso da tecla ao afundar. */
  travel: 0.0009,
  /** Altura do tampo das teclas acima da face. */
  keyTop: 0.0011,
} as const;

/** Eixo da dobradiça no `root`: fim da base, meia altura da pilha fechada. */
export const HINGE = { y: PHONE.base.h / 2, z: PHONE.lid.t / 2 } as const;

export type PhoneKey =
  | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "*" | "0" | "#"
  | "up" | "down" | "left" | "right" | "ok" | "softL" | "softR" | "call" | "end";

type KeySpec = { key: PhoneKey; x: number; y: number; cell: number } & ({ shape: "pill"; w: number; h: number; r: number } | { shape: "arc"; a: number });

const NAV = { x: 0, y: 0.0245, r0: 0.0058, r1: 0.0106, half: 0.62 } as const;
const NUM_COLS = [-0.0138, 0, 0.0138] as const;
const NUM_ROWS = [0.0035, -0.0075, -0.0185, -0.0295] as const;
const NUM_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"] as const;
const LETTERS: Record<string, string> = { "2": "abc", "3": "def", "4": "ghi", "5": "jkl", "6": "mno", "7": "pqrs", "8": "tuv", "9": "wxyz", "0": "␣", "1": "∞" };

const KEYS: KeySpec[] = [
  ...NUM_KEYS.map((key, i): KeySpec => ({ key, x: NUM_COLS[i % 3], y: NUM_ROWS[Math.floor(i / 3)], cell: i, shape: "pill", w: 0.0122, h: 0.008, r: 0.0034 })),
  { key: "right", x: NAV.x, y: NAV.y, cell: 16, shape: "arc", a: 0 },
  { key: "up", x: NAV.x, y: NAV.y, cell: 16, shape: "arc", a: Math.PI / 2 },
  { key: "left", x: NAV.x, y: NAV.y, cell: 16, shape: "arc", a: Math.PI },
  { key: "down", x: NAV.x, y: NAV.y, cell: 16, shape: "arc", a: -Math.PI / 2 },
  { key: "ok", x: NAV.x, y: NAV.y, cell: 17, shape: "pill", w: 0.0098, h: 0.0098, r: 0.0049 },
  { key: "softL", x: -0.0165, y: 0.0318, cell: 18, shape: "pill", w: 0.0094, h: 0.0042, r: 0.0021 },
  { key: "softR", x: 0.0165, y: 0.0318, cell: 18, shape: "pill", w: 0.0094, h: 0.0042, r: 0.0021 },
  { key: "call", x: -0.0165, y: 0.0158, cell: 19, shape: "pill", w: 0.0096, h: 0.0056, r: 0.0026 },
  { key: "end", x: 0.0165, y: 0.0158, cell: 20, shape: "pill", w: 0.0096, h: 0.0056, r: 0.0026 },
];

/* ------------------------------------------------ atlas (uv) */

/** Regiões das texturas da base e da tampa: frente, verso, faixa da lateral (aro) e borracha (antena). */
const REGION = { front: [0, 0.5], back: [0.5, 0.97], side: [0.97, 1] } as const;
const SIDE_V = [0.07, 1] as const;
const RUBBER_V = [0, 0.06] as const;
const CELL = 1 / 8;
const CELL_PAD = 2 / 256;
/** Célula lisa das laterais das teclas. */
const KEY_SIDE_CELL = 63;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** UV da casca: frente e verso planos; o verso pode vir espelhado (visto de trás) e/ou de ponta-cabeça. */
function shellUv(w: number, h: number, t: number, o: { backMirror: boolean; backFlip: boolean; frontFlip?: boolean }) {
  return (p: V3, part: SlabPart, perimeter: number): [number, number] => {
    const fx = p[0] / w + 0.5;
    const fy = p[1] / h + 0.5;
    if (part === "front") return [lerp(REGION.front[0], REGION.front[1], fx), o.frontFlip ? 1 - fy : fy];
    if (part === "back") return [lerp(REGION.back[0], REGION.back[1], o.backMirror ? 1 - fx : fx), o.backFlip ? 1 - fy : fy];
    return [lerp(REGION.side[0], REGION.side[1], p[2] / t + 0.5), lerp(SIDE_V[0], SIDE_V[1], perimeter)];
  };
}

/** Reescreve a uv de um cilindro (nó da dobradiça, antena) para uma faixa do atlas. */
function stripUv(geo: THREE.BufferGeometry, u: readonly [number, number], v: readonly [number, number]) {
  const uv = geo.getAttribute("uv");
  // longe da emenda pintada no meio da faixa
  for (let i = 0; i < uv.count; i++) uv.setXY(i, lerp(u[0], lerp(u[0], u[1], 0.4), uv.getY(i)), lerp(v[0], v[1], uv.getX(i)));
  return geo;
}

/* ------------------------------------------------ pintura */

const GRAPHITE = "#353a40";
const SILVER = "#9aa0a7";

/** Plástico grafite com brilho escovado e grão. */
function plastic(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: Rng, base = GRAPHITE) {
  g.fillStyle = base;
  g.fillRect(x, y, w, h);
  for (let i = 0; i < 70; i++) {
    g.fillStyle = `rgba(255,255,255,${0.012 + r() * 0.02})`;
    g.fillRect(x + r() * w, y, 1, h);
  }
}

/** Retângulo arredondado (caminho). */
function rrect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rad: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, rad);
}

/** Riscos finos claros (uso, chave no bolso). */
function scratches(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: Rng, n: number, a = 0.18) {
  for (let i = 0; i < n; i++) {
    const sx = x + r() * w;
    const sy = y + r() * h;
    g.strokeStyle = `rgba(210,214,220,${a * (0.4 + r() * 0.6)})`;
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(sx, sy);
    g.lineTo(sx + (r() - 0.5) * 22, sy + (r() - 0.5) * 9);
    g.stroke();
  }
}

/** Aro prateado (laterais, biséis e nós) com lascas que mostram o plástico escuro por baixo. */
function silverStrip(g: CanvasRenderingContext2D, x: number, w: number, h: number, r: Rng) {
  g.fillStyle = SILVER;
  g.fillRect(x, 0, w, h);
  for (let y = 0; y < h; y += 2) {
    g.fillStyle = `rgba(255,255,255,${0.04 + r() * 0.06})`;
    g.fillRect(x, y, w, 1);
  }
  // linha de emenda das duas metades da casca, no meio da espessura
  g.fillStyle = "rgba(20,22,24,.55)";
  g.fillRect(x + w / 2 - 0.5, 0, 1, h);
  for (let i = 0; i < 26; i++) {
    g.fillStyle = `rgba(36,38,42,${0.5 + r() * 0.4})`;
    g.fillRect(x + r() * w, r() * h, 1 + r() * 2, 1 + r() * 3);
  }
  // borracha da antena no pé da faixa
  g.fillStyle = "#151617";
  g.fillRect(x, h * (1 - RUBBER_V[1]) - 1, w, h * RUBBER_V[1] + 1);
}

/** Base: frente (teclado, poços das teclas, aro do direcional, microfone), verso (tampa da bateria, etiqueta). */
const drawBase: Draw = (g, w, h) => {
  const r = mulberry(1105);
  const fw = w * REGION.front[1];
  // canvas: y 0 = dobradiça (v 1). Metros → pixels da frente.
  const px = (x: number) => (x / PHONE.w + 0.5) * fw;
  const py = (y: number) => (0.5 - y / PHONE.base.h) * h;
  const sx = fw / PHONE.w;
  const sy = h / PHONE.base.h;
  plastic(g, 0, 0, fw, h, r);
  blotches(g, fw, h, r, 6, [0, 0, 0], 1.5, 0.22);
  // brilho de uso no meio do teclado (onde o polegar passa) e encardido nos cantos
  const shine = g.createRadialGradient(px(0.002), py(-0.006), 2, px(0.002), py(-0.006), fw * 0.55);
  shine.addColorStop(0, "rgba(150,156,166,.16)");
  shine.addColorStop(1, "rgba(150,156,166,0)");
  g.fillStyle = shine;
  g.fillRect(0, 0, fw, h);
  // aro do direcional (prateado, gasto em cima)
  g.strokeStyle = "rgba(140,146,154,.75)";
  g.lineWidth = 2.2;
  g.beginPath();
  g.ellipse(px(NAV.x), py(NAV.y), (NAV.r1 + 0.0012) * sx, (NAV.r1 + 0.0012) * sy, 0, 0, Math.PI * 2);
  g.stroke();
  // poços: sombra em volta de cada tecla
  for (const k of KEYS) {
    g.fillStyle = "rgba(6,7,8,.7)";
    if (k.shape === "pill") {
      const ww = (k.w + 0.0014) * sx;
      const hh = (k.h + 0.0014) * sy;
      rrect(g, px(k.x) - ww / 2, py(k.y) - hh / 2, ww, hh, (k.r + 0.0007) * sx);
      g.fill();
    }
  }
  g.fillStyle = "rgba(6,7,8,.7)";
  g.beginPath();
  g.ellipse(px(NAV.x), py(NAV.y), (NAV.r1 + 0.0006) * sx, (NAV.r1 + 0.0006) * sy, 0, 0, Math.PI * 2);
  g.fill();
  // microfone: furo com chanfro
  g.fillStyle = "#0a0a0b";
  g.beginPath();
  g.ellipse(px(0), py(-0.0385), 0.0009 * sx, 0.0009 * sy, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "rgba(130,136,144,.35)";
  g.lineWidth = 0.8;
  g.stroke();
  scratches(g, 0, 0, fw, h, r, 10, 0.12);
  edgeWear(g, fw, h, r, [118, 122, 130], 4, 0.4);

  // verso (espelhado: visto de trás), x de REGION.back
  const bx = w * REGION.back[0];
  const bw = w * (REGION.back[1] - REGION.back[0]);
  g.save();
  g.translate(bx, 0);
  plastic(g, 0, 0, bw, h, r);
  blotches(g, bw, h, r, 6, [0, 0, 0], 1.4, 0.3);
  // tampa da bateria: emenda arredondada, trava com sulcos embaixo
  g.strokeStyle = "rgba(8,9,10,.85)";
  g.lineWidth = 1.2;
  rrect(g, bw * 0.08, h * 0.2, bw * 0.84, h * 0.74, 6);
  g.stroke();
  g.strokeStyle = "rgba(150,154,160,.18)";
  g.lineWidth = 0.6;
  rrect(g, bw * 0.08 + 1, h * 0.2 + 1, bw * 0.84, h * 0.74, 6);
  g.stroke();
  for (let i = 0; i < 4; i++) {
    g.fillStyle = "rgba(8,9,10,.8)";
    g.fillRect(bw * 0.38, h * (0.88 + i * 0.016), bw * 0.24, 1.2);
  }
  // etiqueta gasta (cinza claro, número apagado e código de barras)
  g.fillStyle = "rgba(170,168,158,.55)";
  g.fillRect(bw * 0.22, h * 0.36, bw * 0.56, h * 0.13);
  for (let i = 0; i < 26; i++) {
    g.fillStyle = `rgba(30,30,30,${0.35 + r() * 0.3})`;
    g.fillRect(bw * 0.26 + i * (bw * 0.017), h * 0.415, r() < 0.5 ? 1 : 2, h * 0.05);
  }
  g.fillStyle = "rgba(30,30,30,.45)";
  g.fillRect(bw * 0.26, h * 0.38, bw * 0.32, 1.5);
  // parafusos
  for (const [fx, fy] of [
    [0.16, 0.06],
    [0.84, 0.06],
  ] as const) {
    g.fillStyle = "#121314";
    g.beginPath();
    g.arc(bw * fx, h * fy, 2.2, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(160,164,170,.4)";
    g.beginPath();
    g.moveTo(bw * fx - 1.4, h * fy);
    g.lineTo(bw * fx + 1.4, h * fy);
    g.stroke();
  }
  scratches(g, 0, 0, bw, h, r, 34, 0.2);
  edgeWear(g, bw, h, r, [118, 122, 130], 4, 0.45);
  g.restore();

  silverStrip(g, w * REGION.side[0], w * (REGION.side[1] - REGION.side[0]), h, r);
  grain(g, w, h, r, 10);
};

/** Tampa: fora (visor externo, lente, grade do alto-falante), dentro (moldura da tela, fenda do fone). */
const drawLid: Draw = (g, w, h) => {
  const r = mulberry(1131);
  const fw = w * REGION.front[1];
  const sx = fw / PHONE.w;
  const sy = h / PHONE.lid.h;
  // fora: canvas y 0 = dobradiça (v 1, frente sem inversão)
  const px = (x: number) => (x / PHONE.w + 0.5) * fw;
  const py = (y: number) => (0.5 - y / PHONE.lid.h) * h;
  plastic(g, 0, 0, fw, h, r, "#30353b");
  blotches(g, fw, h, r, 6, [0, 0, 0], 1.5, 0.25);
  // faixa prateada brilhante junto da dobradiça
  const band = g.createLinearGradient(0, 0, 0, h * 0.12);
  band.addColorStop(0, "rgba(150,156,164,.55)");
  band.addColorStop(1, "rgba(150,156,164,0)");
  g.fillStyle = band;
  g.fillRect(0, 0, fw, h * 0.12);
  // lente da câmera
  g.fillStyle = "#08090a";
  g.beginPath();
  g.arc(px(0), py(0.026), 0.0036 * sx, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "rgba(170,176,184,.7)";
  g.lineWidth = 1.4;
  g.stroke();
  g.fillStyle = "rgba(120,150,170,.5)";
  g.beginPath();
  g.arc(px(0) - 1, py(0.026) - 1, 1.2, 0, Math.PI * 2);
  g.fill();
  // visor externo: vidro escuro com um reflexo oblíquo
  const ew = 0.026 * sx;
  const eh = 0.019 * sy;
  const ex = px(0) - ew / 2;
  const ey = py(0.006) - eh / 2;
  g.fillStyle = "#0b0f10";
  rrect(g, ex, ey, ew, eh, 3);
  g.fill();
  g.strokeStyle = "rgba(150,156,164,.45)";
  g.lineWidth = 1;
  g.stroke();
  const glass = g.createLinearGradient(ex, ey, ex + ew, ey + eh);
  glass.addColorStop(0.2, "rgba(255,255,255,0)");
  glass.addColorStop(0.32, "rgba(255,255,255,.1)");
  glass.addColorStop(0.42, "rgba(255,255,255,0)");
  g.fillStyle = glass;
  g.fillRect(ex, ey, ew, eh);
  // grade do alto-falante, perto da ponta livre
  for (let i = 0; i < 7; i++) {
    g.fillStyle = "#0a0b0c";
    g.beginPath();
    g.arc(px(-0.009 + i * 0.003), py(-0.031), 0.0006 * sx, 0, Math.PI * 2);
    g.fill();
  }
  scratches(g, 0, 0, fw, h, r, 28, 0.2);
  edgeWear(g, fw, h, r, [124, 128, 136], 4, 0.5);

  // dentro: aberta, a ponta livre fica em cima (canvas y 0 = ponta livre), sem espelho
  const bx = w * REGION.back[0];
  const bw = w * (REGION.back[1] - REGION.back[0]);
  const bsx = bw / PHONE.w;
  const ipx = (x: number) => (x / PHONE.w + 0.5) * bw;
  // y da tampa (−h na ponta livre … 0 na dobradiça) → canvas (0 na ponta livre)
  const ipy = (y: number) => ((y + PHONE.lid.h) / PHONE.lid.h) * h;
  g.save();
  g.translate(bx, 0);
  plastic(g, 0, 0, bw, h, r, "#2a2e33");
  // moldura da tela: preto brilhante, um pouco maior que a tela
  const sw = (PHONE.screen.w + 0.0046) * bsx;
  const sh = (PHONE.screen.h + 0.0052) * sy;
  const scx = ipx(0);
  const scy = ipy(PHONE.screen.y);
  g.fillStyle = "#08090a";
  rrect(g, scx - sw / 2, scy - sh / 2, sw, sh, 4);
  g.fill();
  g.strokeStyle = "rgba(160,166,174,.35)";
  g.lineWidth = 1;
  g.stroke();
  // fenda do fone, perto da ponta livre, com a grade
  g.fillStyle = "#050506";
  rrect(g, scx - 0.006 * bsx, ipy(-0.0775) - 2, 0.012 * bsx, 4, 2);
  g.fill();
  g.strokeStyle = "rgba(140,146,154,.5)";
  g.stroke();
  // dois pés de borracha (encostam no teclado ao fechar)
  for (const fx of [-0.017, 0.017]) {
    g.fillStyle = "#121314";
    g.beginPath();
    g.arc(ipx(fx), ipy(-0.079), 1.8, 0, Math.PI * 2);
    g.fill();
  }
  scratches(g, 0, 0, bw, h, r, 8, 0.1);
  edgeWear(g, bw, h, r, [118, 122, 130], 4, 0.35);
  g.restore();

  silverStrip(g, w * REGION.side[0], w * (REGION.side[1] - REGION.side[0]), h, r);
  grain(g, w, h, r, 9);
};

/** Teclas: prata escovada com a serigrafia escura (número grande, letras pequenas), símbolos do direcional. */
const drawKeys: Draw = (g, w) => {
  const r = mulberry(1153);
  const c = w / 8;
  const cellXY = (i: number) => [(i % 8) * c, Math.floor(i / 8) * c] as const;
  const silverCell = (i: number, worn = 0) => {
    const [x, y] = cellXY(i);
    const grad = g.createLinearGradient(x, y, x, y + c);
    grad.addColorStop(0, "#b4b9bf");
    grad.addColorStop(1, "#8d9298");
    g.fillStyle = grad;
    g.fillRect(x, y, c, c);
    for (let k = 0; k < 10; k++) {
      g.fillStyle = `rgba(255,255,255,${0.05 + r() * 0.08})`;
      g.fillRect(x, y + r() * c, c, 1);
    }
    if (worn > 0) {
      g.fillStyle = `rgba(210,214,220,${worn})`;
      g.beginPath();
      g.ellipse(x + c / 2, y + c / 2, c * 0.3, c * 0.26, 0, 0, Math.PI * 2);
      g.fill();
    }
    return [x, y] as const;
  };
  const ink = (alpha = 1) => `rgba(28,30,34,${alpha})`;
  NUM_KEYS.forEach((key, i) => {
    // o 5 e o 2 (centro do polegar) estão mais gastos: a tinta falha
    const worn = key === "5" ? 0.28 : key === "2" || key === "8" ? 0.16 : 0.06;
    const [x, y] = silverCell(i, worn);
    g.save();
    // a tecla é ~1,5× mais larga que alta e a uv estica a célula: desenha comprimido em x
    g.translate(x + c / 2, y + c / 2);
    g.scale(0.66, 1);
    g.fillStyle = ink(key === "5" ? 0.72 : 0.92);
    g.font = "bold 19px sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(key, -6, 1);
    g.font = "bold 9px sans-serif";
    g.fillStyle = ink(key === "5" ? 0.55 : 0.75);
    g.fillText(LETTERS[key] ?? "", 11, 3);
    g.restore();
  });
  // direcional: o anel (célula 16 cobre o quadrado do anel) com quatro setas
  {
    const [x, y] = silverCell(16, 0.08);
    const cx = x + c / 2;
    const cy = y + c / 2;
    g.fillStyle = ink(0.85);
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      const rr = c * 0.39;
      g.save();
      g.translate(cx + Math.cos(a) * rr, cy - Math.sin(a) * rr);
      g.rotate(-a);
      g.beginPath();
      g.moveTo(2.2, 0);
      g.lineTo(-1.4, -2.2);
      g.lineTo(-1.4, 2.2);
      g.closePath();
      g.fill();
      g.restore();
    }
  }
  // ok: o botão do meio, gasto no centro
  {
    const [x, y] = silverCell(17, 0.3);
    g.strokeStyle = ink(0.6);
    g.lineWidth = 1.4;
    g.beginPath();
    g.arc(x + c / 2, y + c / 2, c * 0.28, 0, Math.PI * 2);
    g.stroke();
  }
  // teclas de função: um traço
  {
    const [x, y] = silverCell(18);
    g.fillStyle = ink(0.8);
    g.fillRect(x + c * 0.3, y + c * 0.45, c * 0.4, c * 0.1);
  }
  // chamar (verde) e encerrar (vermelho): fone
  const handset = (i: number, color: string, down: boolean) => {
    const [x, y] = silverCell(i);
    g.save();
    g.translate(x + c / 2, y + c / 2);
    g.scale(0.62, 1);
    if (down) g.rotate(Math.PI * 0.75);
    else g.rotate(-Math.PI * 0.25);
    g.strokeStyle = color;
    g.lineWidth = 3.2;
    g.lineCap = "round";
    g.beginPath();
    g.arc(0, 0, 7, Math.PI * 0.15, Math.PI * 0.85);
    g.stroke();
    g.restore();
  };
  handset(19, "rgba(40,120,64,.95)", false);
  handset(20, "rgba(150,36,36,.95)", true);
  silverCell(KEY_SIDE_CELL);
  // laterais da tecla um pouco mais escuras
  {
    const [x, y] = cellXY(KEY_SIDE_CELL);
    g.fillStyle = "rgba(40,42,46,.45)";
    g.fillRect(x, y, c, c);
  }
  grain(g, w, w, r, 8);
};

/* ------------------------------------------------ montagem */

export type PhoneModel = {
  root: THREE.Group;
  lid: THREE.Group;
  screen: THREE.Mesh;
  /** 0 fechada, 1 aberta (≈160°). */
  setLid(open: number): void;
  /** Profundidade (0..1) de uma tecla; só reescreve os vértices quando muda. */
  setKey(key: PhoneKey, depth: number): void;
  /** Centro do tampo da tecla (no `root`, sem o afundamento). */
  keyTop(key: PhoneKey, out: THREE.Vector3): THREE.Vector3;
  /** Ponta livre da tampa, no meio da borda (onde o polegar empurra para abrir), no `root`. */
  lidEdge(out: THREE.Vector3): THREE.Vector3;
  /** Cantos da tela interna no `root` (aberta ou não): sup.-esq., sup.-dir., inf.-dir., inf.-esq. de quem olha. */
  screenCorners(out: THREE.Vector3[]): THREE.Vector3[];
  /** Tela acesa (luz de fundo do LCD por baixo do DOM) ou apagada. */
  setBacklight(on: boolean): void;
  /** Triângulos e malhas (orçamento). */
  stats: { triangles: number; meshes: number };
  keys: readonly PhoneKey[];
  dispose(): void;
};

export function createPhoneModel(three: typeof THREE, kit: MaterialKit): PhoneModel {
  const T = three;
  const geometries: THREE.BufferGeometry[] = [];
  const own = <G extends THREE.BufferGeometry>(geo: G) => {
    geometries.push(geo);
    return geo;
  };
  /** Rascunho só para juntar (descartado na hora). */
  const scratch: THREE.BufferGeometry[] = [];
  const temp = <G extends THREE.BufferGeometry>(geo: G) => {
    scratch.push(geo);
    return geo;
  };
  const m4 = () => new T.Matrix4();
  const W = PHONE.w;
  const B = PHONE.base;
  const L = PHONE.lid;
  const rb = PHONE.barrel;

  /* base: casca + dois nós da dobradiça + antena */
  const baseShell = temp(
    roundedSlab(T, W, B.h, B.t, { radius: B.r, bevel: B.bevel, edgeSeg: [3, 6], rings: 4, uv: shellUv(W, B.h, B.t, { backMirror: true, backFlip: false }) }),
  );
  const knuckle = (len: number) => {
    const geo = temp(new T.CylinderGeometry(rb, rb, len, 14, 1, false));
    stripUv(geo, REGION.side, SIDE_V);
    return geo;
  };
  const sideLen = W / 2 - 0.0125 - 0.0004;
  const knuckleAt = (x: number) => m4().makeRotationZ(Math.PI / 2).setPosition(x, HINGE.y, HINGE.z);
  const baseGeo = own(
    mergeGeometries(T, [
      { geo: baseShell },
      { geo: knuckle(sideLen), matrix: knuckleAt(-(W / 2 - 0.0002 - sideLen / 2)) },
      { geo: knuckle(sideLen), matrix: knuckleAt(W / 2 - 0.0002 - sideLen / 2) },
    ]),
  );

  /* tampa (no espaço do pivô): casca + nó do meio + antena curta na ponta livre (aberta, aponta para cima) */
  const lidZ = B.t / 2 - HINGE.z + L.t / 2;
  const lidShell = temp(
    roundedSlab(T, W, L.h, L.t, { radius: L.r, bevel: L.bevel, edgeSeg: [3, 6], rings: 4, uv: shellUv(W, L.h, L.t, { backMirror: false, backFlip: true }) }),
  );
  const antenna = temp(new T.CylinderGeometry(0.0029, 0.0034, 0.012, 10, 1, false));
  stripUv(antenna, REGION.side, RUBBER_V);
  const antennaTip = temp(new T.SphereGeometry(0.0029, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2));
  stripUv(antennaTip, REGION.side, RUBBER_V);
  const antennaX = W / 2 - 0.0062;
  const antennaZ = lidZ + 0.0008;
  const lidGeo = own(
    mergeGeometries(T, [
      { geo: lidShell, matrix: m4().setPosition(0, -L.h / 2, lidZ) },
      { geo: knuckle(0.0242), matrix: m4().makeRotationZ(Math.PI / 2) },
      // 3 mm enterrada na ponta; o cilindro afina para fora (−y do pivô)
      { geo: antenna, matrix: m4().makeRotationX(Math.PI).setPosition(antennaX, -L.h - 0.003, antennaZ) },
      { geo: antennaTip, matrix: m4().makeRotationX(Math.PI).setPosition(antennaX, -L.h - 0.009, antennaZ) },
    ]),
  );

  /* teclas: um buffer, uma faixa de vértices por tecla */
  const keyParts: { geo: THREE.BufferGeometry; matrix: THREE.Matrix4 }[] = [];
  const ranges = new Map<PhoneKey, { start: number; count: number }>();
  const cellUv = (cell: number, fx: number, fy: number): [number, number] => {
    const cu = (cell % 8) * CELL;
    // célula 0 no alto do canvas (v alto)
    const cv = 1 - (Math.floor(cell / 8) + 1) * CELL;
    return [cu + CELL_PAD + fx * (CELL - 2 * CELL_PAD), cv + CELL_PAD + fy * (CELL - 2 * CELL_PAD)];
  };
  const keyThick = 0.0015;
  const keyZ = B.t / 2 + PHONE.keyTop - keyThick;
  let vertexCount = 0;
  for (const k of KEYS) {
    let geo: THREE.BufferGeometry;
    if (k.shape === "pill") {
      geo = temp(
        roundedSlab(T, k.w, k.h, keyThick, {
          radius: k.r,
          bevel: 0.00045,
          back: false,
          cornerSeg: 3,
          edgeSeg: [1, 1],
          rings: 2,
          uv: (p, part) => (part === "front" ? cellUv(k.cell, p[0] / k.w + 0.5, p[1] / k.h + 0.5) : cellUv(KEY_SIDE_CELL, 0.5, 0.5)),
        }),
      );
      geo.translate(0, 0, keyThick / 2);
    } else {
      // arco do direcional: a célula cobre o quadrado do anel inteiro
      geo = temp(
        ringSector(T, NAV.r0, NAV.r1, k.a - NAV.half, k.a + NAV.half, keyThick, {
          seg: 7,
          bevel: 0.0005,
          uv: (p, top) => (top ? cellUv(k.cell, p[0] / (2 * NAV.r1) + 0.5, p[1] / (2 * NAV.r1) + 0.5) : cellUv(KEY_SIDE_CELL, 0.5, 0.5)),
        }),
      );
    }
    const count = geo.getAttribute("position").count;
    ranges.set(k.key, { start: vertexCount, count });
    vertexCount += count;
    keyParts.push({ geo, matrix: m4().setPosition(k.x, k.y, keyZ) });
  }
  const keysGeo = own(mergeGeometries(T, keyParts));
  const keyPos = keysGeo.getAttribute("position") as THREE.BufferAttribute;
  keyPos.setUsage(T.DynamicDrawUsage);
  const restZ = Float32Array.from({ length: keyPos.count }, (_, i) => keyPos.getZ(i));
  const depths = new Map<PhoneKey, number>();

  for (const geo of scratch) geo.dispose();
  scratch.length = 0;

  const screenGeo = own(new T.PlaneGeometry(PHONE.screen.w, PHONE.screen.h));

  /* materiais e texturas (do kit) */
  // Um brilho próprio baixo (como a pele das mãos): o aparelho lê no escuro sem a lanterna, que está guardada.
  const bodyMat = kit.phong({ map: kit.texture("celular:base", drawBase, 256), shininess: 36, specular: 0x26262a, emissive: 0x0b0c0e });
  const lidMat = kit.phong({ map: kit.texture("celular:tampa", drawLid, 256), shininess: 40, specular: 0x2a2a2e, emissive: 0x0b0c0e });
  // Luz de fundo do teclado (2005): as teclas acendem um pouco com a tampa aberta (o mapa é o próprio desenho).
  const keyTex = kit.texture("celular:teclas", drawKeys, 256);
  const keyMat = kit.phong({ map: keyTex, emissiveMap: keyTex, shininess: 55, specular: 0x34343a, emissive: 0x0e1012 });
  const keyGlowOff = keyMat.emissive.clone();
  const keyGlowOn = new T.Color().setHex(0x2a3036, T.LinearSRGBColorSpace);
  const screenMat = kit.basic({ color: 0x0a1210 });
  const backlightOff = screenMat.color.clone();
  const backlightOn = new T.Color().setHex(0x5a6a64, T.LinearSRGBColorSpace);

  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D) => {
    const m = new T.Mesh(geo, mat);
    m.castShadow = false;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const root = new T.Group();
  root.name = "celular";
  mesh(baseGeo, bodyMat, root);
  const keysMesh = mesh(keysGeo, keyMat, root);
  keysMesh.name = "celular-teclas";
  const lid = new T.Group();
  lid.name = "celular-tampa";
  lid.position.set(0, HINGE.y, HINGE.z);
  root.add(lid);
  mesh(lidGeo, lidMat, lid);
  const screen = mesh(screenGeo, screenMat, lid);
  screen.name = "celular-tela";
  // face de dentro da tampa (−z fechada), 0,25 mm à frente dela: sem z-fighting com a moldura pintada
  screen.position.set(0, PHONE.screen.y, lidZ - L.t / 2 - 0.00025);
  screen.rotation.y = Math.PI;

  const keyIndex = new Map(KEYS.map((k) => [k.key, k]));
  const v = new T.Vector3();

  return {
    root,
    lid,
    screen,
    setLid(open) {
      lid.rotation.x = -Math.min(1, Math.max(0, open)) * PHONE.open;
    },
    setKey(key, depth) {
      const d = Math.min(1, Math.max(0, depth));
      if ((depths.get(key) ?? 0) === d) return;
      depths.set(key, d);
      const range = ranges.get(key);
      if (!range) return;
      for (let i = range.start; i < range.start + range.count; i++) keyPos.setZ(i, restZ[i] - d * PHONE.travel);
      keyPos.addUpdateRange(range.start * 3, range.count * 3);
      keyPos.needsUpdate = true;
    },
    keyTop(key, out) {
      const k = keyIndex.get(key);
      if (!k) return out.set(0, 0, B.t / 2 + PHONE.keyTop);
      if (k.shape === "arc") {
        const rr = (NAV.r0 + NAV.r1) / 2;
        return out.set(k.x + Math.cos(k.a) * rr, k.y + Math.sin(k.a) * rr, B.t / 2 + PHONE.keyTop);
      }
      return out.set(k.x, k.y, B.t / 2 + PHONE.keyTop);
    },
    lidEdge(out) {
      lid.updateMatrix();
      return out.set(0, -L.h, lidZ).applyMatrix4(lid.matrix);
    },
    screenCorners(out) {
      lid.updateMatrix();
      screen.updateMatrix();
      const hw = PHONE.screen.w / 2;
      const hh = PHONE.screen.h / 2;
      // aberta, a ponta livre (y mais negativo) fica em cima e o x da tampa é o x de quem olha
      const z = screen.position.z;
      const corners: [number, number][] = [
        [-hw, PHONE.screen.y - hh],
        [hw, PHONE.screen.y - hh],
        [hw, PHONE.screen.y + hh],
        [-hw, PHONE.screen.y + hh],
      ];
      corners.forEach(([x, y], i) => {
        v.set(x, y, z).applyMatrix4(lid.matrix);
        (out[i] ??= new T.Vector3()).copy(v);
      });
      return out;
    },
    setBacklight(on) {
      screenMat.color.copy(on ? backlightOn : backlightOff);
      keyMat.emissive.copy(on ? keyGlowOn : keyGlowOff);
    },
    stats: {
      triangles: [baseGeo, lidGeo, keysGeo, screenGeo].reduce((n, geo) => n + (geo.index ? geo.index.count : geo.getAttribute("position").count) / 3, 0),
      meshes: 4,
    },
    keys: KEYS.map((k) => k.key),
    dispose() {
      root.removeFromParent();
      for (const geo of geometries) geo.dispose();
      geometries.length = 0;
    },
  };
}
