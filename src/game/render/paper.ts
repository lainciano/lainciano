import type { Doc } from "../layers/types";
import { blotches, edgeWear, jagged, mulberry, type Rng } from "./paint";

/**
 * Nível 1 do leitor (T10): o papel do documento pintado em código, no mesmo espírito do protótipo 7 (letra à mão,
 * papel envelhecido, pontilhado), sem asset externo. Roda UMA vez por abertura, num `<canvas>` do DOM (nada de
 * textura WebGL, nada redesenhado por quadro); quem mostra o canvas o zera ao fechar (`Reader.tsx`, largura e altura
 * 0); o canvas da medida nasce 0×0 e os rascunhos internos (`blotches`) se zeram sozinhos.
 *
 * Camadas, de baixo para cima: contorno rasgado (com furos de espiral nas folhas de caderno) → papel com manchas,
 * fibras e pintas → pauta → letra à mão (tremor, inclinação, pressão, deriva da linha) → dobras com luz e sombra →
 * aro de caneca → bordas gastas → pontilhado ordenado e vinheta. Tudo derivado de `look.seed`: o mesmo papel a cada
 * abertura. Não importa three nem react: roda em chunk próprio, carregado por `import()` na primeira leitura.
 */

/** Medida de um trecho de texto na fonte já escolhida (`ctx.measureText(s).width`). */
export type Measure = (s: string) => number;

/** Quebra o texto em linhas que cabem em `maxWidth`. Quebras do autor ficam; linha vazia = respiro entre parágrafos. */
export function wrapText(text: string, maxWidth: number, measure: Measure): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && measure(next) > maxWidth) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  // O texto vazio ("") não tem linhas; um "\n" no fim não deixa respiro sobrando.
  while (out.length && out[out.length - 1] === "") out.pop();
  return out;
}

export type PaperPlan = {
  w: number;
  h: number;
  /** Tamanho da letra (px do canvas). */
  size: number;
  lineHeight: number;
  marginX: number;
  textW: number;
  top: number;
};

const PAPER_W = 760;
const MIN_H = 540;
const MAX_H = 1100;
const BASE_SIZE = 34;
const MIN_SIZE = 24;
const TOP = 132;
const BOTTOM = 96;
const SIGNATURE_H = 96;
const LINE_RATIO = 1.42;

/** Tamanho da folha e da letra para `lineCount` linhas (já quebradas no tamanho-base). */
export function planPaper(lineCount: number, hasSignature: boolean): PaperPlan {
  const extra = hasSignature ? SIGNATURE_H : 0;
  const marginX = 84;
  const need = TOP + BOTTOM + extra + lineCount * BASE_SIZE * LINE_RATIO;
  const room = MAX_H - TOP - BOTTOM - extra;
  const factor = need > MAX_H ? room / (lineCount * BASE_SIZE * LINE_RATIO) : 1;
  const size = Math.max(MIN_SIZE, Math.round(BASE_SIZE * factor));
  const lineHeight = size * LINE_RATIO;
  const h = Math.min(MAX_H, Math.max(MIN_H, Math.round(TOP + BOTTOM + extra + lineCount * lineHeight)));
  return { w: PAPER_W, h, size, lineHeight, marginX, textW: PAPER_W - 2 * marginX, top: TOP };
}

/* ------------------------------------------------ pintura (só no navegador) */

const TONE = "#d9cdb0";
const INK = "#2a2118";
const FALLBACK_FAMILY = "Georgia, 'Times New Roman', serif";
const PAD = 9; // folga transparente em volta do papel (a sombra respira)

/** A serifa do site (a variável que o next/font publica), ou uma serifa do sistema. */
function serifFamily(): string {
  const fromSite = (el: Element) => getComputedStyle(el).getPropertyValue("--font-instrument-serif").trim();
  const site = fromSite(document.documentElement) || (document.body ? fromSite(document.body) : "");
  return site ? `${site}, ${FALLBACK_FAMILY}` : FALLBACK_FAMILY;
}

/** Espera a fonte do site (no máx. 1,2 s): sem ela a letra sai na serifa do sistema, nunca em branco. */
async function fontReady(family: string, size: number): Promise<void> {
  const fonts = document.fonts;
  if (!fonts?.load) return;
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 1200));
  try {
    await Promise.race([fonts.load(`${size}px ${family}`, "aáçãõé").then(() => undefined), timeout]);
  } catch {
    // sem a fonte, a serifa do sistema escreve
  }
}

/** Contorno do papel: bordas rasgadas, quina cortada e, nas folhas de caderno, os furos da espiral à esquerda. */
function outline(g: CanvasRenderingContext2D, w: number, h: number, r: Rng, spiral: boolean) {
  const x0 = PAD;
  const y0 = PAD;
  const x1 = w - PAD;
  const y1 = h - PAD;
  const jitter = (amp: number) => (r() - 0.5) * amp;
  g.beginPath();
  g.moveTo(x0 + 14, y0 + jitter(3));
  for (let x = x0 + 14; x <= x1 - 18; x += 9 + r() * 7) g.lineTo(x, y0 + jitter(5));
  g.lineTo(x1 - 18, y0 + jitter(3));
  g.lineTo(x1 + jitter(2), y0 + 22); // quina de cima cortada
  for (let y = y0 + 22; y <= y1 - 6; y += 12 + r() * 10) g.lineTo(x1 + jitter(3), y);
  for (let x = x1; x >= x0 + 8; x -= 11 + r() * 9) g.lineTo(x, y1 + jitter(4));
  g.lineTo(x0 + jitter(2), y1 - 4);
  if (spiral) {
    // furos da espiral arrancados: meia-lua para dentro, de baixo para cima, com o papel puxado em volta
    const step = 46;
    for (let y = y1 - 30; y > y0 + 40; y -= step) {
      const cy = y + jitter(6);
      const rad = 8.5 + r() * 2.5;
      g.lineTo(x0 + jitter(2), cy + rad + 4);
      // a meia-lua sobe de baixo para cima (o caminho vai nesse sentido): y = cy + rad·cos(a), de +rad a −rad
      for (let k = 0; k <= 8; k++) {
        const a = (k / 8) * Math.PI;
        g.lineTo(x0 + Math.sin(a) * rad * 1.15 + jitter(1.2), cy + Math.cos(a) * rad);
      }
    }
  }
  for (let y = y0 + 40; y >= y0 + 16; y -= 9 + r() * 6) g.lineTo(x0 + jitter(4), y);
  g.closePath();
}

/** Fibras claras e escuras, pintas de umidade: o que faz o papel parecer papel de perto. */
function fibres(g: CanvasRenderingContext2D, w: number, h: number, r: Rng) {
  g.lineWidth = 1;
  for (let i = 0; i < 260; i++) {
    const x = r() * w;
    const y = r() * h;
    const len = 5 + r() * 18;
    const a = r() * Math.PI;
    g.strokeStyle = r() < 0.55 ? `rgba(255,248,228,${0.05 + r() * 0.1})` : `rgba(96,72,40,${0.04 + r() * 0.08})`;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  for (let i = 0; i < 46; i++) {
    g.fillStyle = `rgba(122,84,40,${0.1 + r() * 0.2})`;
    jagged(g, r() * w, r() * h, 1 + r() * 2.6, r, 7);
    g.fill();
  }
}

/** Pauta de caderno (azul desbotado), uma linha logo abaixo de cada linha de texto, e a margem vermelha. */
function ruling(g: CanvasRenderingContext2D, w: number, h: number, plan: PaperPlan, r: Rng) {
  g.lineWidth = 1.2;
  const first = plan.top + 7 - Math.floor((plan.top - 56) / plan.lineHeight) * plan.lineHeight;
  for (let y = first; y < h - 40; y += plan.lineHeight) {
    g.strokeStyle = `rgba(78,98,138,${0.2 + r() * 0.08})`;
    g.beginPath();
    g.moveTo(PAD + 4, y + (r() - 0.5) * 1.2);
    g.lineTo(w - PAD - 4, y + (r() - 0.5) * 1.2);
    g.stroke();
  }
  g.strokeStyle = "rgba(168,52,42,0.34)";
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(plan.marginX - 26, PAD + 6);
  g.lineTo(plan.marginX - 26 + (r() - 0.5) * 2, h - PAD - 6);
  g.stroke();
}

type Pen = { family: string; size: number; ink: string; r: Rng };

/** Espaçamento entre letras (a serifa condensada do site, escrita à mão, pede um respiro a mais). */
const TRACK = 1.04;

/**
 * Uma linha à mão: a mão tem humor por palavra (a base sobe ou desce, a inclinação e o peso da pena mudam) e jeito
 * por letra (tremor, tamanho, pressão); a base deriva ao longo da linha e o espaço entre palavras anda ao acaso. As
 * posições vêm da medida do trecho inteiro (com kerning), nunca de letras soltas somadas. Devolve a largura escrita.
 */
function handwrite(g: CanvasRenderingContext2D, line: string, x: number, baseline: number, pen: Pen, extra: { slope: number; ink?: string } = { slope: 0 }): number {
  const { r, size } = pen;
  g.font = `italic ${size}px ${pen.family}`;
  g.textBaseline = "alphabetic";
  const x0 = x + (r() - 0.5) * 5;
  let walk = 0;
  let prefix = "";
  for (const word of line.split(" ")) {
    const startX = x0 + g.measureText(prefix).width * TRACK + walk;
    const wordY = (r() - 0.5) * size * 0.09;
    const wordSlant = (r() - 0.5) * 0.07;
    const wordScale = 0.97 + r() * 0.06;
    const wordPress = 0.8 + r() * 0.2;
    const chars = Array.from(word);
    chars.forEach((ch, i) => {
      const before = g.measureText(chars.slice(0, i).join("")).width * TRACK;
      const cx = startX + before + (r() - 0.5) * 0.8;
      g.save();
      g.translate(cx, baseline + (cx - x0) * extra.slope + wordY + (r() - 0.5) * size * 0.04);
      g.rotate(-0.05 + wordSlant + (r() - 0.5) * 0.04);
      g.scale(wordScale * (0.97 + r() * 0.06), wordScale * (0.97 + r() * 0.07));
      // a pena começa a palavra pesada e vai aliviando
      g.globalAlpha = Math.min(1, wordPress * (0.88 + r() * 0.12) + (i === 0 ? 0.08 : 0));
      g.fillStyle = extra.ink ?? pen.ink;
      g.fillText(ch, 0, 0);
      if (r() < 0.05) {
        g.globalAlpha = 0.3;
        g.fillText(ch, 0.9, 0.7);
      }
      g.restore();
    });
    prefix += `${word} `;
    // o espaço entre palavras só cresce (a mão alarga, nunca amassa uma palavra na outra)
    walk += (0.05 + r() * 0.55) * size * 0.1;
  }
  g.globalAlpha = 1;
  return g.measureText(line).width * TRACK;
}

/** Assinatura: letra maior, com o traço de baixo (uma curva só) e uma gota de tinta. */
function signature(g: CanvasRenderingContext2D, text: string, right: number, y: number, pen: Pen) {
  const big: Pen = { ...pen, size: Math.round(pen.size * 1.22) };
  g.font = `italic ${big.size}px ${big.family}`;
  const w = g.measureText(text).width * TRACK;
  const x = right - w;
  handwrite(g, text, x, y, big, { slope: -0.012, ink: "#1e1812" });
  g.strokeStyle = "#1e1812";
  g.lineCap = "round";
  g.lineWidth = 2.2;
  g.globalAlpha = 0.85;
  g.beginPath();
  g.moveTo(x - 8, y + 14);
  g.bezierCurveTo(x + w * 0.3, y + 6, x + w * 0.7, y + 22, x + w + 14, y + 8);
  g.stroke();
  g.globalAlpha = 0.9;
  g.fillStyle = "#1e1812";
  jagged(g, x + w + 20, y + 15, 3, pen.r, 9);
  g.fill();
  g.globalAlpha = 1;
}

/** Dobras: o vinco, a luz que cai de um lado e a sombra do outro; a letra passa por cima e o vinco corta a letra. */
function folds(g: CanvasRenderingContext2D, w: number, h: number, count: number, r: Rng) {
  const crease = (x0: number, y0: number, x1: number, y1: number, horizontal: boolean) => {
    const len = horizontal ? x1 - x0 : y1 - y0;
    const nx = horizontal ? 0 : 1;
    const ny = horizontal ? 1 : 0;
    // sombra larga de um lado, luz do outro
    for (const [side, color] of [[-1, "rgba(58,38,18,0.13)"], [1, "rgba(255,248,230,0.16)"]] as const) {
      const gx = x0 + (nx * side) * 22;
      const gy = y0 + (ny * side) * 22;
      const grad = g.createLinearGradient(x0, y0, gx, gy);
      grad.addColorStop(0, color);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad;
      if (horizontal) g.fillRect(x0, side < 0 ? y0 - 22 : y0, len, 22);
      else g.fillRect(side < 0 ? x0 - 22 : x0, y0, 22, len);
    }
    // o vinco em si, em segmentos (nunca uma reta perfeita)
    g.lineWidth = 1.6;
    g.strokeStyle = "rgba(74,52,28,0.34)";
    g.beginPath();
    g.moveTo(x0, y0);
    for (let t = 0; t <= len; t += 14) g.lineTo(horizontal ? x0 + t : x0 + (r() - 0.5) * 1.4, horizontal ? y0 + (r() - 0.5) * 1.4 : y0 + t);
    g.stroke();
    g.lineWidth = 1;
    g.strokeStyle = "rgba(255,250,236,0.3)";
    g.beginPath();
    g.moveTo(x0 + nx * 1.6, y0 + ny * 1.6);
    g.lineTo(horizontal ? x1 : x0 + nx * 1.6, horizontal ? y0 + 1.6 : y1);
    g.stroke();
  };
  for (let i = 1; i <= count; i++) {
    const y = (h * i) / (count + 1) + (r() - 0.5) * 10;
    crease(PAD, y, w - PAD, y, true);
  }
  // com duas dobras ou mais, uma vinca a folha ao meio e o cruzamento se gasta
  if (count >= 2) {
    const x = w * 0.5 + (r() - 0.5) * 12;
    crease(x, PAD, x, h - PAD, false);
    for (let i = 1; i <= count; i++) {
      const y = (h * i) / (count + 1);
      for (let k = 0; k < 14; k++) {
        g.fillStyle = r() < 0.5 ? "rgba(255,246,222,0.22)" : "rgba(80,56,30,0.18)";
        g.fillRect(x + (r() - 0.5) * 22, y + (r() - 0.5) * 12, 1 + r() * 2, 1 + r() * 2);
      }
    }
  }
}

/** Aro de caneca: traço grosso interrompido, mais escuro na borda, mais claro dentro. */
function mugRing(g: CanvasRenderingContext2D, w: number, h: number, r: Rng) {
  const cx = w * (0.7 + r() * 0.12);
  const cy = h * (0.74 + r() * 0.1);
  const rad = w * 0.075;
  g.save();
  g.fillStyle = "rgba(120,82,40,0.05)";
  g.beginPath();
  g.arc(cx, cy, rad, 0, Math.PI * 2);
  g.fill();
  g.lineCap = "round";
  g.strokeStyle = "rgba(112,72,34,0.26)";
  g.lineWidth = 3.4;
  g.beginPath();
  g.arc(cx, cy, rad, 0.35, 5.5);
  g.stroke();
  g.strokeStyle = "rgba(112,72,34,0.12)";
  g.lineWidth = 7;
  g.beginPath();
  g.arc(cx, cy, rad - 2, 0.5, 4.8);
  g.stroke();
  g.restore();
}

/** Pontilhado ordenado (matriz 4×4) sobre o papel pronto, só nos pixels que existem, e vinheta nas bordas. */
function dither(g: CanvasRenderingContext2D, w: number, h: number, r: Rng, levels: number) {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const step = 255 / levels;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      if (d[p + 3] === 0) continue;
      const b = (bayer[((y >> 1) & 3) * 4 + ((x >> 1) & 3)] / 16 - 0.5) * step;
      const n = (r() - 0.5) * 14;
      for (let k = 0; k < 3; k++) d[p + k] = Math.round((d[p + k] + b + n) / step) * step;
    }
  }
  g.putImageData(img, 0, 0);
  const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.34, w / 2, h / 2, Math.max(w, h) * 0.72);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(18,10,4,0.5)");
  g.save();
  g.globalCompositeOperation = "source-atop";
  g.fillStyle = vg;
  g.fillRect(0, 0, w, h);
  g.restore();
}

/**
 * Pinta o documento no canvas (que passa a ter o tamanho da folha). Assíncrono só pela fonte; a pintura é uma
 * rajada síncrona. Se `signal` abortar antes (o leitor fechou), não pinta nada.
 */
export async function paintPaper(canvas: HTMLCanvasElement, doc: Doc, signal?: AbortSignal): Promise<void> {
  const look = doc.look ?? {};
  const family = serifFamily();
  await fontReady(family, BASE_SIZE);
  if (signal?.aborted) return;

  // Só mede texto: o canvas da medida nasce 0×0 (nada de buffer de 300×150 esperando o GC).
  const probeCanvas = document.createElement("canvas");
  probeCanvas.width = 0;
  probeCanvas.height = 0;
  const probe = probeCanvas.getContext("2d");
  if (!probe) return;
  probe.font = `italic ${BASE_SIZE}px ${family}`;
  const textW = PAPER_W - 2 * 84;
  const base = wrapText(doc.text, textW, (s) => probe.measureText(s).width);
  const plan = planPaper(base.length, !!look.signature);
  probe.font = `italic ${plan.size}px ${family}`;
  const lines = plan.size === BASE_SIZE ? base : wrapText(doc.text, plan.textW, (s) => probe.measureText(s).width);
  probe.canvas.width = probe.canvas.height = 0;

  canvas.width = plan.w;
  canvas.height = plan.h;
  const g = canvas.getContext("2d", { willReadFrequently: true });
  if (!g) return;
  const r = mulberry(look.seed ?? 421);
  const tone = look.tone ?? TONE;
  const spiral = look.ruled !== false;

  g.clearRect(0, 0, plan.w, plan.h);
  g.save();
  outline(g, plan.w, plan.h, r, spiral);
  g.clip();

  // papel: cor base mais clara no meio, manchas largas e finas, fibras e pintas
  g.fillStyle = tone;
  g.fillRect(0, 0, plan.w, plan.h);
  const glow = g.createRadialGradient(plan.w * 0.45, plan.h * 0.4, 20, plan.w / 2, plan.h / 2, plan.w * 0.75);
  glow.addColorStop(0, "rgba(255,248,226,0.2)");
  glow.addColorStop(1, "rgba(90,64,30,0.14)");
  g.fillStyle = glow;
  g.fillRect(0, 0, plan.w, plan.h);
  blotches(g, plan.w, plan.h, r, 5, [150, 120, 80], 1.5, 0.35);
  blotches(g, plan.w, plan.h, r, 18, [110, 90, 60], 2.4, 0.2);
  fibres(g, plan.w, plan.h, r);
  if (look.ruled !== false) ruling(g, plan.w, plan.h, plan, r);

  // letra
  const pen: Pen = { family, size: plan.size, ink: look.ink ?? INK, r };
  // cada linha (a vazia também) é uma linha da pauta; a letra senta logo acima da risca
  const limit = plan.h - 70 - (look.signature ? SIGNATURE_H : 0);
  const slope = (r() - 0.5) * 0.014;
  let y = plan.top;
  for (const line of lines) {
    if (y > limit) break;
    if (line) handwrite(g, line, plan.marginX, y, pen, { slope: slope + (r() - 0.5) * 0.006 });
    y += plan.lineHeight;
  }
  if (look.signature) signature(g, look.signature, plan.w - plan.marginX + 6, Math.min(plan.h - 80, y + plan.lineHeight * 0.3), pen);

  // por cima da letra: dobras, aro, desgaste
  folds(g, plan.w, plan.h, look.folds ?? 2, r);
  mugRing(g, plan.w, plan.h, r);
  edgeWear(g, plan.w, plan.h, r, [120, 92, 54], 18, 0.6);
  g.restore();

  dither(g, plan.w, plan.h, mulberry(7), 12);
}
