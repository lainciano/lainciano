import type * as THREE from "three";
import type { Engine } from "../../runtime/engine";
import { protoColor } from "../materials";

/**
 * Cena de referência de debug (`?debug=1&shot=psx-ref`, Ruling 2 da Fase 1A): um pedaço da Antessala do
 * protótipo 7 (piso de granilite, paredes em dois tons, teto, o balcão de fórmica e a luz pendente com sombra)
 * para comparar o PSX portado com o protótipo na mesma moldura. Só existe em chunk lazy de debug; não é
 * conteúdo do jogo (a sala da 1A é a `cinza`, T8).
 *
 * Paleta e posições vêm do protótipo 7 (hex na convenção dele, ver render/materials.ts). As luzes foram
 * recalibradas por comparação de imagem: o r128 usava luz "legada" (× π e queda linear até o alcance), o 0.186
 * usa luz física (queda 1/dⁿ), então intensidade e queda não são os números de lá.
 *
 * Receita que a T8 deve copiar (ver o relatório da T6):
 * - toda caixa e plano com textura é subdividido (~5 segmentos por metro): com a textura afim (0.28) e o
 *   tremor, um quad grande de 2 triângulos faz a textura "nadar" quando a câmera anda;
 * - UV em metros do mundo (`worldUv`) quando duas peças do mesmo material se encostam: sem costura de escala;
 * - nada coplanar e sobreposto (z-fighting): peças vizinhas se encostam na borda, não se cruzam;
 * - decalque sobre uma superfície (desgaste, mancha): mesma malha de vértices da superfície (posições e índice
 *   compartilhados, só a UV muda). Com o tremor, malhas diferentes no mesmo plano movem os vértices cada uma do
 *   seu jeito e o decalque pisca em ângulo rasante; com os mesmos vértices a profundidade coincide;
 * - sombra da luz principal: `near` 0,5 (a cúpula e a lâmpada ficam fora), `bias` −0,0005, `normalBias` 0,003,
 *   mapa 1024: objeto de 2 cm deitado no tampo ainda projeta e encosta na própria sombra (com 0,015 o livro
 *   ficava sem sombra). Regra para dimensionar: `normalBias` ≈ 1–1,5 texel no receptor principal, com
 *   texel ≈ 2·d·tan(ângulo do spot)/mapSize e d = distância luz → receptor. Aqui o receptor é o tampo
 *   (d ≈ 0,86 m → texel ≈ 2 mm, 0,003 ≈ 1,5 texel); numa sala 4 × 4 com o piso como receptor (d ≈ 2 m, texel
 *   ≈ 4,8 mm) 0,003 fica abaixo de 1 texel: a T8 deve recalcular e varrer o ângulo de visão (acne em parede
 *   rasante não foi checada aqui).
 */

declare global {
  interface Window {
    /** Controles da cena de referência (só com `?debug=1&shot=psx-ref`). */
    __criptaShot?: { wear(mode: "on" | "off" | "solid"): void };
  }
}

const ROOM = { w: 4.5, d: 5, h: 2.6 } as const;
/** Altura onde o verde de baixo encontra o bege (m). */
const WALL_SPLIT = 1.25;
/** Câmera do lugar "centro" do protótipo, olhando o balcão (P = 0,15 / 1,0, olho 1,6). */
export const PSX_REF_CAMERA = { x: 0.15, y: 1.6, z: 1.0, yaw: -0.4636, pitch: -0.08 } as const;
/** Tempo preso para as fotos (grão e glitch estáveis entre capturas). */
const FROZEN_T = 1;
/** Segmentos por metro em caixas e planos (como os planos do protótipo). */
const SEG_PER_M = 5;
/** Altura do tampo de fórmica (face de cima). */
const TOP_Y = 0.978 + 0.035 / 2;

/** Fator para portar a intensidade "legada" do r128 para a luz física do 0.186 (antes da calibração). */
const LEGACY = Math.PI;
const LIGHTS = {
  ambient: { color: 0x1e1b18, intensity: 0.2 * LEGACY },
  hemi: { sky: 0x3a4452, ground: 0x22170e, intensity: 0.14 * LEGACY },
  // Queda ajustada para seguir a curva legada (1 − d/alcance)ⁿ de 0,8 a 3,5 m: lá 1,75 com n = 1,5 e 0,38 com n = 2.
  lamp: { color: 0xffb062, intensity: 1.64 * LEGACY, distance: 6.5, angle: 0.88, penumbra: 0.65, decay: 0.75 },
  fill: { color: 0xffa860, intensity: 0.23 * LEGACY, distance: 4.6, decay: 1 },
} as const;
/** Sombra da luz pendente (a lâmpada fica a 0,86 m do tampo e 1,86 m do chão). */
export const LAMP_SHADOW = { mapSize: 1024, near: 0.5, far: 6, bias: -0.0005, normalBias: 0.003 } as const;

type Rng = () => number;
type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;

/** PRNG do protótipo (mulberry32): mesmas texturas a cada abertura. */
function mulberry(seed: number): Rng {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Manchas: uma grade pequena de alfas aleatórios esticada com suavização (o `layer` do protótipo). */
function blotches(g: CanvasRenderingContext2D, w: number, h: number, r: Rng, cells: number, rgb: [number, number, number], pow: number, amax: number) {
  const ch = Math.max(2, Math.round((cells * h) / w));
  const c = document.createElement("canvas");
  c.width = cells;
  c.height = ch;
  const cg = c.getContext("2d");
  if (!cg) return;
  const img = cg.createImageData(cells, ch);
  for (let i = 0; i < cells * ch; i++) {
    const p = i * 4;
    img.data[p] = rgb[0];
    img.data[p + 1] = rgb[1];
    img.data[p + 2] = rgb[2];
    img.data[p + 3] = Math.pow(r(), pow) * amax * 255;
  }
  cg.putImageData(img, 0, 0);
  g.save();
  g.imageSmoothingEnabled = true;
  g.drawImage(c, 0, 0, w, h);
  g.restore();
}

function grain(g: CanvasRenderingContext2D, w: number, h: number, r: Rng, amp: number) {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amp;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

/** Contorno irregular (raio sorteado por vértice): lasca, mancha, pedra. */
function jagged(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, rng: Rng, n: number, sx = 1, sy = 1) {
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.45 + rng() * 0.7);
    const x = cx + Math.cos(a) * rr * sx;
    const y = cy + Math.sin(a) * rr * sy;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
}

/** Cantos e bordas gastos (o `edgeWear` do protótipo). */
function edgeWear(g: CanvasRenderingContext2D, w: number, h: number, r: Rng, rgb: [number, number, number], width: number, amax: number) {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const e = Math.min(x, y, w - 1 - x, h - 1 - y);
      if (e > width) continue;
      const a = amax * Math.pow(1 - e / width, 2) * (0.35 + r() * 0.65);
      const p = (y * w + x) * 4;
      d[p] += (rgb[0] - d[p]) * a;
      d[p + 1] += (rgb[1] - d[p + 1]) * a;
      d[p + 2] += (rgb[2] - d[p + 2]) * a;
    }
  }
  g.putImageData(img, 0, 0);
}

/**
 * Granilite: um ladrilho de 1 m com meia junta de latão em cada borda (o vizinho completa a junta, então o
 * ladrilho pode girar). Quatro variantes, cada uma com sementes, pedras e um defeito próprios; o desgaste de
 * baixa frequência vem do decalque da sala, não do ladrilho (senão todo centro escurece igual).
 */
function drawGranilite(variant: number): Draw {
  return (g, w, h) => {
    const r = mulberry(11 + variant * 97);
    const base = ["#8a867d", "#807c75", "#918b80", "#86817a"][variant] ?? "#8a867d";
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    blotches(g, w, h, r, 3 + variant, [55, 50, 44], 1.5, 0.3 + variant * 0.03);
    blotches(g, w, h, r, 10 + variant * 3, [190, 184, 172], 2, 0.14);
    blotches(g, w, h, r, 30 + variant * 5, [48, 44, 38], 2.4, 0.16);
    // salpico fino por pixel, como o protótipo (7% dos pixels: preto, osso, ocre, vinho)
    const img = g.getImageData(0, 0, w, h);
    const d = img.data;
    const speck = [0.07, 0.085, 0.06, 0.075][variant] ?? 0.07;
    for (let i = 0; i < w * h; i++) {
      const t = r();
      if (t >= speck) continue;
      const c = t < speck * 0.4 ? [32, 30, 28] : t < speck * 0.66 ? [222, 216, 204] : t < speck * 0.86 ? [160, 122, 64] : [106, 66, 46];
      const j = (r() - 0.5) * 22;
      d[i * 4] = c[0] + j;
      d[i * 4 + 1] = c[1] + j;
      d[i * 4 + 2] = c[2] + j;
    }
    g.putImageData(img, 0, 0);
    // pedrinhas maiores: densidade e mistura mudam por variante
    const stones = ["#1e1c1a", "#e2dbcc", "#a37b40", "#6c4130"];
    const count = [460, 600, 380, 520][variant] ?? 460;
    const mix = [0.42, 0.34, 0.5, 0.38][variant] ?? 0.42;
    for (let i = 0; i < count; i++) {
      const t = r();
      g.fillStyle = stones[t < mix ? 0 : t < mix + 0.28 ? 1 : t < 0.9 ? 2 : 3];
      const s = 0.8 + r() * (variant === 1 ? 2.2 : 1.4);
      jagged(g, r() * w, r() * h, s, r, 5);
      g.fill();
    }
    if (variant === 1) {
      // fio de trinca que atravessa o ladrilho
      g.strokeStyle = "rgba(34,30,26,.55)";
      g.lineWidth = 0.8;
      g.beginPath();
      let x = w * 0.15;
      let y = h * (0.2 + r() * 0.3);
      g.moveTo(x, y);
      let a = 0.4;
      for (let i = 0; i < 40; i++) {
        a += (r() - 0.5) * 0.7;
        x += Math.cos(a) * 4;
        y += Math.sin(a) * 4;
        g.lineTo(x, y);
      }
      g.stroke();
    } else if (variant === 2) {
      // mancha velha de ferrugem/café absorvida pela pedra
      const cx = w * (0.3 + r() * 0.4);
      const cy = h * (0.3 + r() * 0.4);
      const stain = g.createRadialGradient(cx, cy, 2, cx, cy, 46);
      stain.addColorStop(0, "rgba(96,58,26,.4)");
      stain.addColorStop(1, "rgba(96,58,26,0)");
      g.fillStyle = stain;
      jagged(g, cx, cy, 48, r, 14, 1.3, 0.9);
      g.fill();
    } else if (variant === 3) {
      // canto lascado
      g.fillStyle = "rgba(58,52,44,.8)";
      g.beginPath();
      g.moveTo(w, h);
      g.lineTo(w - 10 - r() * 6, h);
      g.lineTo(w - 4, h - 6);
      g.lineTo(w, h - 12 - r() * 5);
      g.closePath();
      g.fill();
    }
    // meia junta em cada borda: escura por fora, fio de latão por dentro
    g.fillStyle = "rgba(38,33,26,.9)";
    g.fillRect(0, 0, 1.25, h);
    g.fillRect(w - 1.25, 0, 1.25, h);
    g.fillRect(0, 0, w, 1.25);
    g.fillRect(0, h - 1.25, w, 1.25);
    g.fillStyle = "rgba(176,142,82,.3)";
    g.fillRect(1.25, 0, 0.75, h);
    g.fillRect(0, 1.25, w, 0.75);
    grain(g, w, h, r, 10);
  };
}

/** Coordenadas do decalque da sala inteira (mesmo mapa fx/fz do piso do protótipo). */
const fx = (x: number, w: number) => ((x + ROOM.w / 2) / ROOM.w) * w;
const fz = (z: number, h: number) => ((z + ROOM.d / 2) / ROOM.d) * h;

/** Desgaste de baixa frequência sobre o piso: o caminho porta→balcão, sujeira junto às paredes, manchas com história. */
const drawFloorWear: Draw = (g, w, h) => {
  const r = mulberry(12);
  g.clearRect(0, 0, w, h);
  const paths: [number, number][][] = [
    [[0.05, 2.6], [0.15, 1.3], [0.3, 0.1], [0.32, -0.8], [0.35, -1.9], [0.12, -2.5]],
    [[0.15, 1.3], [-0.45, 1.1]],
    [[0.3, -0.6], [-0.9, -1.6]],
    [[0.3, 0.6], [1.5, 0.9]],
  ];
  g.lineCap = "round";
  g.lineJoin = "round";
  for (const path of paths) {
    for (let k = 0; k < 10; k++) {
      g.strokeStyle = `rgba(52,45,36,${0.02 + r() * 0.025})`;
      g.lineWidth = w * (0.04 + r() * 0.05);
      g.beginPath();
      path.forEach(([x, z], i) => {
        const px = fx(x, w) + (r() - 0.5) * 4;
        const pz = fz(z, h) + (r() - 0.5) * 4;
        if (i === 0) g.moveTo(px, pz);
        else g.lineTo(px, pz);
      });
      g.stroke();
    }
  }
  // brilho de cera gasta no meio do caminho principal
  g.strokeStyle = "rgba(255,250,240,.05)";
  g.lineWidth = w * 0.015;
  g.beginPath();
  paths[0].forEach(([x, z], i) => (i === 0 ? g.moveTo(fx(x, w), fz(z, h)) : g.lineTo(fx(x, w), fz(z, h))));
  g.stroke();
  // sujeira junto às paredes
  const edge = (x0: number, y0: number, x1: number, y1: number) => {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, "rgba(30,25,18,.4)");
    gr.addColorStop(1, "rgba(30,25,18,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  };
  edge(0, 0, 0, 14);
  edge(0, h, 0, h - 14);
  edge(0, 0, 14, 0);
  edge(w, 0, w - 14, 0);
  // ferrugem do aquecedor e respingos de café diante do balcão
  const rust = g.createRadialGradient(fx(-1.25, w), fz(2.3, h), 1, fx(-1.25, w), fz(2.3, h), 14);
  rust.addColorStop(0, "rgba(120,62,22,.45)");
  rust.addColorStop(1, "rgba(110,60,25,0)");
  g.fillStyle = rust;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 6; i++) {
    g.fillStyle = `rgba(60,36,18,${0.3 + r() * 0.3})`;
    jagged(g, fx(0.5, w) + r() * 6, fz(-0.15, h) + r() * 8, 0.8 + r() * 0.8, r, 6);
    g.fill();
  }
};

/** Lasca de reboco: borda irregular, sombra embaixo, fundo de outra tinta e o fio claro da borda de cima. */
function plasterChip(g: CanvasRenderingContext2D, cx: number, cy: number, rad: number, r: Rng, under: string) {
  const seed = (r() * 1e6) | 0;
  g.fillStyle = "rgba(25,18,10,.35)";
  jagged(g, cx + 0.8, cy + 1, rad, mulberry(seed), 11, 1.4, 0.8);
  g.fill();
  g.fillStyle = under;
  jagged(g, cx, cy, rad, mulberry(seed), 11, 1.4, 0.8);
  g.fill();
  g.strokeStyle = "rgba(255,248,230,.3)";
  g.lineWidth = 0.6;
  jagged(g, cx - 0.4, cy - 0.4, rad, mulberry(seed), 11, 1.4, 0.8);
  g.stroke();
}

/** Parede: bege em cima, verde até 1,25 m, faixa escura entre os dois, sujeira no rodapé e no teto. */
function drawWall(seed: number): Draw {
  return (g, w, h) => {
    const r = mulberry(seed);
    const y = (m: number) => h - (m / ROOM.h) * h;
    const split = y(WALL_SPLIT);
    g.fillStyle = "#b5a788";
    g.fillRect(0, 0, w, split);
    g.fillStyle = "#56705e";
    g.fillRect(0, split, w, h - split);
    g.save();
    g.beginPath();
    g.rect(0, 0, w, split);
    g.clip();
    blotches(g, w, h, r, 6, [96, 78, 50], 1.6, 0.32);
    blotches(g, w, h, r, 20, [232, 222, 200], 2.6, 0.15);
    g.restore();
    g.save();
    g.beginPath();
    g.rect(0, split, w, h - split);
    g.clip();
    blotches(g, w, h, r, 6, [18, 36, 26], 1.5, 0.38);
    blotches(g, w, h, r, 24, [150, 182, 160], 3, 0.13);
    g.restore();
    g.fillStyle = "#2a3a30";
    g.fillRect(0, split - 1, w, 2);
    let gr = g.createLinearGradient(0, h, 0, y(0.4));
    gr.addColorStop(0, "rgba(24,20,14,.8)");
    gr.addColorStop(0.25, "rgba(24,20,14,.35)");
    gr.addColorStop(1, "rgba(24,20,14,0)");
    g.fillStyle = gr;
    g.fillRect(0, y(0.4), w, h);
    gr = g.createLinearGradient(0, 0, 0, y(ROOM.h - 0.45));
    gr.addColorStop(0, "rgba(42,36,24,.5)");
    gr.addColorStop(1, "rgba(42,36,24,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, w, y(ROOM.h - 0.45));
    // reboco descascado: poucas lascas grandes e algumas pequenas na divisa das tintas
    for (let i = 0; i < 5; i++) {
      const up = r() < 0.6;
      const cy = up ? 20 + r() * (split - 30) : split + 8 + r() * (h - split) * 0.6;
      plasterChip(g, r() * w, cy, 2.5 + r() * 4.5, r, up ? (r() < 0.55 ? "#9e9a8f" : "#cbc2aa") : r() < 0.6 ? "#a2a89c" : "#bdae8e");
    }
    for (let i = 0; i < 4; i++) plasterChip(g, r() * w, split + (r() - 0.3) * 4, 1.2 + r() * 1.6, r, "#a59f90");
    grain(g, w, h, r, 12);
  };
}

const drawCeiling: Draw = (g, w, h) => {
  const r = mulberry(23);
  g.fillStyle = "#a59e8c";
  g.fillRect(0, 0, w, h);
  blotches(g, w, h, r, 6, [110, 96, 70], 1.4, 0.35);
  blotches(g, w, h, r, 20, [60, 52, 40], 2.5, 0.16);
  grain(g, w, h, r, 9);
};

/**
 * Fórmica bege. O tampo usa UV em metros com 1 m × 2 m por textura (o kit é quadrado, 256 px); por isso o
 * desenho é achatado na vertical (×0,5) e sai redondo depois de esticado.
 */
const drawFormica: Draw = (g, w, h) => {
  const r = mulberry(31);
  g.fillStyle = "#cbb995";
  g.fillRect(0, 0, w, h);
  blotches(g, w, h, r, 8, [150, 128, 90], 1.8, 0.25);
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = r() < 0.6 ? `rgba(120,100,70,${0.3 + r() * 0.4})` : `rgba(240,232,214,${0.4 + r() * 0.4})`;
    g.fillRect(r() * w, r() * h, 1, 0.5);
  }
  // marcas de copo
  for (let i = 0; i < 3; i++) {
    g.strokeStyle = `rgba(105,72,40,${0.22 + r() * 0.2})`;
    g.lineWidth = 1.2;
    g.beginPath();
    const start = r() * 6;
    g.ellipse(w * (0.2 + r() * 0.6), h * (0.15 + r() * 0.7), 9 + r() * 3, (9 + r() * 3) / 2, 0, start, start + 3 + r() * 3);
    g.stroke();
  }
  // queimadura de cigarro: centro preto, halo marrom
  const bx = w * 0.22;
  const by = h * 0.62;
  const burn = g.createRadialGradient(bx, by, 0.5, bx, by, 9);
  burn.addColorStop(0, "#120a05");
  burn.addColorStop(0.45, "rgba(70,38,16,.9)");
  burn.addColorStop(1, "rgba(120,80,40,0)");
  g.fillStyle = burn;
  g.beginPath();
  g.ellipse(bx, by, 9, 4, 0.2, 0, Math.PI * 2);
  g.fill();
  // riscos finos
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(250,246,236,${0.2 + r() * 0.25})`;
    g.lineWidth = 0.5;
    const x = r() * w;
    const y = r() * h;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 30, y + (r() - 0.5) * 4);
    g.stroke();
  }
  grain(g, w, h, r, 8);
};

function drawWood(seed: number, base: string): Draw {
  return (g, w, h) => {
    const r = mulberry(seed);
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 50; i++) {
      g.strokeStyle = r() < 0.5 ? `rgba(18,8,3,${0.15 + r() * 0.3})` : `rgba(120,76,42,${0.08 + r() * 0.14})`;
      g.lineWidth = 0.5 + r() * 1.4;
      let x = r() * w;
      g.beginPath();
      g.moveTo(x, 0);
      for (let yy = 0; yy <= h; yy += 8) {
        x += (r() - 0.5) * 2;
        g.lineTo(x + Math.sin(yy * 0.05 + i) * 2, yy);
      }
      g.stroke();
    }
    // frisos verticais do painel (a cada ~13 cm com 0,9 m por textura)
    for (let x = 0; x < w; x += w / 7) {
      g.fillStyle = "rgba(10,5,2,.6)";
      g.fillRect(x, 0, 2, h);
      g.fillStyle = "rgba(160,110,70,.15)";
      g.fillRect(x + 2, 0, 1, h);
    }
    blotches(g, w, h, r, 6, [20, 10, 4], 1.6, 0.3);
    grain(g, w, h, r, 10);
  };
}

/** Capa de tecido gasto de um livro de registro: vermelho escuro, filete dourado, cantos puídos. */
const drawCloth: Draw = (g, w, h) => {
  const r = mulberry(141);
  g.fillStyle = "#4a1712";
  g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 2) {
    g.fillStyle = `rgba(0,0,0,${0.06 + r() * 0.05})`;
    g.fillRect(0, y, w, 1);
  }
  blotches(g, w, h, r, 6, [20, 6, 4], 1.5, 0.35);
  g.strokeStyle = "rgba(176,142,82,.55)";
  g.lineWidth = 1;
  g.strokeRect(w * 0.12, h * 0.1, w * 0.76, h * 0.8);
  g.fillStyle = "rgba(176,142,82,.5)";
  g.fillRect(w * 0.3, h * 0.3, w * 0.4, 2);
  g.fillRect(w * 0.36, h * 0.36, w * 0.28, 1);
  edgeWear(g, w, h, r, [150, 120, 96], 6, 0.7);
  grain(g, w, h, r, 10);
};

/** Miolo visto de lado: papel amarelado com as linhas das folhas. */
const drawPages: Draw = (g, w, h) => {
  const r = mulberry(151);
  g.fillStyle = "#d9cfb6";
  g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 1.5) {
    g.fillStyle = `rgba(110,92,64,${0.08 + r() * 0.12})`;
    g.fillRect(0, y, w, 0.6);
  }
  edgeWear(g, w, h, r, [150, 128, 90], 5, 0.5);
};

/** Papelão pardo: ondas do miolo, marcas impressas e bordas amassadas. */
const drawCardboard: Draw = (g, w, h) => {
  const r = mulberry(161);
  g.fillStyle = "#9a7a52";
  g.fillRect(0, 0, w, h);
  blotches(g, w, h, r, 6, [70, 50, 30], 1.5, 0.3);
  for (let x = 0; x < w; x += 3) {
    g.fillStyle = "rgba(255,240,210,.04)";
    g.fillRect(x, 0, 1, h);
  }
  // seta "este lado para cima" e um número de lote
  g.strokeStyle = "rgba(30,24,18,.6)";
  g.lineWidth = 2;
  for (const ox of [w * 0.62, w * 0.74]) {
    g.beginPath();
    g.moveTo(ox, h * 0.42);
    g.lineTo(ox, h * 0.22);
    g.moveTo(ox - 6, h * 0.29);
    g.lineTo(ox, h * 0.22);
    g.lineTo(ox + 6, h * 0.29);
    g.stroke();
  }
  g.fillStyle = "rgba(30,24,18,.5)";
  for (let i = 0; i < 6; i++) g.fillRect(w * 0.14 + i * 9, h * 0.7, 6, 10);
  for (let i = 0; i < 5; i++) {
    g.fillStyle = `rgba(60,40,22,${0.15 + r() * 0.2})`;
    jagged(g, r() * w, r() * h, 6 + r() * 12, r, 10);
    g.fill();
  }
  edgeWear(g, w, h, r, [70, 52, 32], 10, 0.6);
  grain(g, w, h, r, 12);
};

const drawTape: Draw = (g, w, h) => {
  const r = mulberry(171);
  g.fillStyle = "#b89a6a";
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 30; i++) {
    g.fillStyle = `rgba(255,250,235,${0.08 + r() * 0.1})`;
    g.fillRect(r() * w, 0, 1 + r() * 2, h);
  }
  grain(g, w, h, r, 8);
};

/** Reescreve a UV de uma caixa em metros (do mundo, com `offset`) por face, com `tile` metros por textura. */
function worldUv(geo: THREE.BufferGeometry, tileU: number, tileV: number, offset: readonly [number, number, number] = [0, 0, 0]) {
  const pos = geo.getAttribute("position");
  const nor = geo.getAttribute("normal");
  const uv = geo.getAttribute("uv");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + offset[0];
    const y = pos.getY(i) + offset[1];
    const z = pos.getZ(i) + offset[2];
    const nx = nor.getX(i);
    const ny = nor.getY(i);
    const nz = nor.getZ(i);
    if (Math.abs(ny) > 0.5) uv.setXY(i, x / tileU, -z / tileV);
    else if (Math.abs(nx) > 0.5) uv.setXY(i, (nx > 0 ? -z : z) / tileU, y / tileV);
    else uv.setXY(i, (nz > 0 ? x : -x) / tileU, y / tileV);
  }
  uv.needsUpdate = true;
}

/**
 * Piso em ladrilhos de 1 m (juntas em x, z = ±0,5 e ±1,5, como o protótipo), cada um subdividido, numa só
 * geometria com um grupo por variante. A variante e o giro de 90° de cada ladrilho saem de uma semente fixa.
 */
function floorGeometry(T: typeof THREE, variants: number): THREE.BufferGeometry {
  const xs = [-ROOM.w / 2, -1.5, -0.5, 0.5, 1.5, ROOM.w / 2];
  const zs = [-ROOM.d / 2, -1.5, -0.5, 0.5, 1.5, ROOM.d / 2];
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const byVariant: number[][] = Array.from({ length: variants }, () => []);
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < zs.length - 1; j++) {
      const [x0, x1, z0, z1] = [xs[i], xs[i + 1], zs[j], zs[j + 1]];
      const ix = Math.floor((x0 + x1) / 2 + 0.5);
      const iz = Math.floor((z0 + z1) / 2 + 0.5);
      const rng = mulberry(1000 + ix * 31 + iz * 17);
      const variant = Math.floor(rng() * variants) % variants;
      const turn = Math.floor(rng() * 4);
      const nx = Math.max(1, Math.round((x1 - x0) * SEG_PER_M));
      const nz = Math.max(1, Math.round((z1 - z0) * SEG_PER_M));
      const first = positions.length / 3;
      for (let b = 0; b <= nz; b++) {
        for (let a = 0; a <= nx; a++) {
          const x = x0 + ((x1 - x0) * a) / nx;
          const z = z0 + ((z1 - z0) * b) / nz;
          positions.push(x, 0, z);
          normals.push(0, 1, 0);
          // UV local do ladrilho (0..1 do ladrilho inteiro), girado em passos de 90° em torno do centro.
          let u = x + 0.5 - ix;
          let v = 1 - (z + 0.5 - iz);
          for (let k = 0; k < turn; k++) [u, v] = [1 - v, u];
          uvs.push(u, v);
        }
      }
      const row = nx + 1;
      for (let b = 0; b < nz; b++) {
        for (let a = 0; a < nx; a++) {
          const p = first + b * row + a;
          // (a, c, b) e (b, c, d): face para +y
          byVariant[variant].push(p, p + row, p + 1, p + 1, p + row, p + row + 1);
        }
      }
    }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new T.Float32BufferAttribute(normals, 3));
  geo.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
  const index: number[] = [];
  byVariant.forEach((list, v) => {
    geo.addGroup(index.length, list.length, v);
    index.push(...list);
  });
  geo.setIndex(index);
  return geo;
}

/** Monta a cena no `engine.scene`, posiciona a câmera e prende o tempo. Devolve a remoção. */
export function buildPsxRef(engine: Engine): () => void {
  const { three: T, scene, camera, kit } = engine;
  const root = new T.Group();
  root.name = "psx-ref";
  const geometries: THREE.BufferGeometry[] = [];
  const lights: THREE.Light[] = [];
  const seg = (m: number) => Math.max(1, Math.round(m * SEG_PER_M));

  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x: number, y: number, z: number, parent: THREE.Object3D = root, cast = false) => {
    geometries.push(geo);
    const m = new T.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  /** Plano subdividido (5 por metro, como o protótipo): o tremor e a textura afim agem nos vértices. */
  const plane = (w: number, h: number, mat: THREE.Material, x: number, y: number, z: number, rx: number, ry: number) => {
    const m = mesh(new T.PlaneGeometry(w, h, seg(w), seg(h)), mat, x, y, z);
    m.rotation.set(rx, ry, 0, "YXZ");
    return m;
  };
  /**
   * Caixa subdividida (~5 por metro em cada eixo). `uv`: metros por textura (u, v) para UV do mundo; sem ele,
   * a UV de face do three (cor lisa ou peça pequena).
   */
  const box = (
    w: number,
    h: number,
    d: number,
    mat: THREE.Material | THREE.Material[],
    x: number,
    y: number,
    z: number,
    o: { cast?: boolean; uv?: [number, number]; parent?: THREE.Object3D; worldOffset?: boolean } = {},
  ) => {
    const geo = new T.BoxGeometry(w, h, d, seg(w), seg(h), seg(d));
    if (o.uv) worldUv(geo, o.uv[0], o.uv[1], o.worldOffset === false ? [0, 0, 0] : [x, y, z]);
    return mesh(geo, mat, x, y, z, o.parent ?? root, o.cast ?? true);
  };

  // Piso: 4 variantes de granilite por ladrilho + decalque de desgaste da sala inteira.
  const tiles = [0, 1, 2, 3].map((v) => kit.phong({ map: kit.texture(`psx-ref:granilite-${v}`, drawGranilite(v), 256) }));
  const floorGeo = floorGeometry(T, tiles.length);
  mesh(floorGeo, tiles, 0, 0, 0);
  const wearTex = kit.texture("psx-ref:desgaste", drawFloorWear, 256);
  wearTex.wrapS = T.ClampToEdgeWrapping;
  wearTex.wrapT = T.ClampToEdgeWrapping;
  const wear = kit.phong({
    map: wearTex,
    transparent: true,
    depthWrite: false,
    specular: 0x000000,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });
  // O decalque usa as MESMAS posições e o mesmo índice do piso (só a UV, em coordenadas da sala, é dele): o
  // tremor move os vértices dos dois igual e a profundidade coincide; o polygonOffset fica só como folga.
  const wearGeo = new T.BufferGeometry();
  const floorPos = floorGeo.getAttribute("position");
  wearGeo.setAttribute("position", floorPos);
  wearGeo.setAttribute("normal", floorGeo.getAttribute("normal"));
  const roomUv = new Float32Array(floorPos.count * 2);
  for (let i = 0; i < floorPos.count; i++) {
    roomUv[i * 2] = (floorPos.getX(i) + ROOM.w / 2) / ROOM.w;
    roomUv[i * 2 + 1] = 1 - (floorPos.getZ(i) + ROOM.d / 2) / ROOM.d;
  }
  wearGeo.setAttribute("uv", new T.BufferAttribute(roomUv, 2));
  wearGeo.setIndex(floorGeo.getIndex());
  const wearMesh = mesh(wearGeo, wear, 0, 0, 0);
  wearMesh.renderOrder = 1;
  // Teste de cintilação (e2e): o decalque some, volta, ou vira uma cor chapada (magenta, sem luz nem névoa) para
  // contar os pixels de piso que "furam" o decalque em ângulo rasante.
  const solid = kit.basic({
    color: 0xff00ff,
    fog: false,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });
  window.__criptaShot = {
    wear(mode) {
      wearMesh.visible = mode !== "off";
      wearMesh.material = mode === "solid" ? solid : wear;
    },
  };
  plane(ROOM.w, ROOM.d, kit.phong({ map: kit.texture("psx-ref:teto", drawCeiling, 256) }), 0, ROOM.h, 0, Math.PI / 2, 0);

  // Paredes: norte, sul, oeste, leste (viradas para dentro).
  const walls: [number, number, number, number, number][] = [
    [201, ROOM.w, 0, -ROOM.d / 2, 0],
    [202, ROOM.w, 0, ROOM.d / 2, Math.PI],
    [203, ROOM.d, -ROOM.w / 2, 0, Math.PI / 2],
    [204, ROOM.d, ROOM.w / 2, 0, -Math.PI / 2],
  ];
  for (const [seed, width, x, z, ry] of walls) {
    plane(width, ROOM.h, kit.phong({ map: kit.texture(`psx-ref:parede-${seed}`, drawWall(seed), 256) }), x, ROOM.h / 2, z, 0, ry);
  }
  // Rodapé de granilite: o leste para onde o norte começa (sem cruzar no canto).
  const skirt = kit.phong({ color: 0x4a4740 });
  box(ROOM.w, 0.08, 0.012, skirt, 0, 0.04, -ROOM.d / 2 + 0.006, { cast: false });
  box(0.012, 0.08, ROOM.d - 0.012, skirt, ROOM.w / 2 - 0.006, 0.04, 0.006, { cast: false });

  // Balcão em L (fórmica, cantoneira de alumínio, frente de madeira), nas medidas do protótipo. As peças se
  // encostam pelas bordas; os dois tampos e as frentes usam UV do mundo, então a fórmica e os frisos continuam
  // de uma peça para a outra.
  const formica = kit.phong({ map: kit.texture("psx-ref:formica", drawFormica, 256) });
  const panel = kit.phong({ map: kit.texture("psx-ref:painel", drawWood(45, "#36200f"), 256) });
  const wood = kit.phong({ map: kit.texture("psx-ref:madeira", drawWood(41, "#3c2416"), 128) });
  const edge = kit.phong({ color: 0xa89a7c });
  const alu = kit.phong({ color: 0x9c9e9c, shininess: 40 });
  const dark = kit.phong({ color: 0x1b1612 });
  // faces do BoxGeometry: +x, −x, +y, −y, +z, −z
  const topMats = [edge, edge, formica, edge, edge, edge];
  const sideMats = [wood, panel, wood, wood, panel, panel];
  const PANEL_UV: [number, number] = [0.9, 0.9];
  const TOP_UV: [number, number] = [1, 2];
  const TOP_H = 0.035;
  const FRONT_Z = 0.25;
  // corpo principal e o anexo (x 0,72–1,28 e 1,30–1,65)
  box(0.56, 0.96, 1.8, sideMats, 1.0, 0.48, -0.7, { uv: PANEL_UV });
  box(0.35, 0.96, 0.52, sideMats, 1.475, 0.48, -0.06, { uv: PANEL_UV });
  // tampos: o principal x 0,67–1,33 · z −1,65–0,25 (10 segmentos de 19 cm); o do anexo começa onde o principal
  // acaba, frente alinhada, e o fundo cai numa linha da grade do principal (−0,32 = 3 segmentos de 19 cm): os
  // vértices da borda comum coincidem, então o tremor move os dois iguais e não abre fresta (junção em T).
  box(0.66, TOP_H, 1.9, topMats, 1.0, 0.978, -0.7, { uv: TOP_UV });
  const annexBack = -0.32;
  box(0.35, TOP_H, FRONT_Z - annexBack, topMats, 1.505, 0.978, (FRONT_Z + annexBack) / 2, { uv: TOP_UV });
  // A cantoneira (2,4 cm de largura, 1,2 cm por fora e 1,2 cm por dentro do tampo, 2,5 mm acima dele) entra
  // no tampo em vez de encostar: a aresta é resolvida pelo depth buffer, não por vértice compartilhado, então o
  // tremor não abre fresta (a linha pontilhada da 1ª versão). As pontas terminam dentro da peça vizinha.
  const LIP = 0.024;
  const lipH = 0.04;
  const lipY = 0.978;
  const [x0, x1, xa, zf, zb] = [0.658, 1.336, 1.692, FRONT_Z + 0.012, -1.662];
  box(xa - x0, lipH, LIP, alu, (xa + x0) / 2, lipY, zf - LIP / 2, { cast: false });
  box(LIP, lipH, zf - LIP - (zb + LIP), alu, x0 + LIP / 2, lipY, (zf - LIP + zb + LIP) / 2, { cast: false });
  box(x1 - x0, lipH, LIP, alu, (x1 + x0) / 2, lipY, zb + LIP / 2, { cast: false });
  // anexo: cantoneira também no fundo (x 1,33–1,692, metade dentro do tampo); a da ponta termina dentro dela,
  // sem sobrar no ar atrás do tampo e do corpo
  const annexBackOut = annexBack - LIP / 2;
  box(xa - 1.33, lipH, LIP, alu, (xa + 1.33) / 2, lipY, annexBack, { cast: false });
  box(LIP, lipH, zf - LIP - (annexBackOut + LIP), alu, xa - LIP / 2, lipY, (zf - LIP + annexBackOut + LIP) / 2, { cast: false });
  // rodapé escuro recuado sob a frente (encosta no corpo, não entra nele)
  box(0.02, 0.1, 1.8, dark, 0.71, 0.05, -0.7, { cast: false });
  // prateleira interna (vista só por trás)
  box(0.5, 0.025, 1.7, kit.phong({ map: kit.texture("psx-ref:madeira-2", drawWood(43, "#4a2c1a"), 128) }), 1.0, 0.62, -0.7, { cast: false, uv: PANEL_UV });

  // Livro de registro deitado no tampo (2,2 cm): capas, miolo recuado e lombada redonda. Teste de sombra baixa.
  const book = new T.Group();
  book.position.set(0.98, TOP_Y, -1.05);
  book.rotation.y = 0.35;
  root.add(book);
  const cloth = kit.phong({ map: kit.texture("psx-ref:livro-capa", drawCloth, 128), shininess: 6 });
  const pages = kit.phong({ map: kit.texture("psx-ref:livro-miolo", drawPages, 64) });
  const BOOK = { w: 0.152, d: 0.214, t: 0.022, board: 0.0028 } as const;
  box(BOOK.w, BOOK.board, BOOK.d, cloth, 0, BOOK.board / 2, 0, { parent: book, worldOffset: false });
  box(BOOK.w, BOOK.board, BOOK.d, cloth, 0, BOOK.t - BOOK.board / 2, 0, { parent: book, worldOffset: false });
  box(BOOK.w - 0.006, BOOK.t - BOOK.board * 2, BOOK.d - 0.008, pages, 0.003, BOOK.t / 2, 0, { parent: book, worldOffset: false });
  const spine = mesh(new T.CylinderGeometry(BOOK.t / 2, BOOK.t / 2, BOOK.d, 8, 1, false, Math.PI, Math.PI), cloth, -BOOK.w / 2, BOOK.t / 2, 0, book, true);
  spine.rotation.x = Math.PI / 2;

  // Caixa de papelão no chão, dentro do cone da luz: teste de sombra no piso e de contato.
  const crate = new T.Group();
  crate.position.set(0.0, 0, -0.35);
  crate.rotation.y = 0.25;
  root.add(crate);
  const CRATE = { w: 0.38, h: 0.28, d: 0.32 } as const;
  const cardboard = kit.phong({ map: kit.texture("psx-ref:papelao", drawCardboard, 256), shininess: 4 });
  const tape = kit.phong({ map: kit.texture("psx-ref:fita", drawTape, 64), shininess: 30 });
  box(CRATE.w, CRATE.h, CRATE.d, cardboard, 0, CRATE.h / 2, 0, { parent: crate, uv: [0.4, 0.4], worldOffset: false });
  // fita: por cima da emenda das abas e descendo 5 cm pela frente e por trás (1 mm afastada, nunca coplanar)
  box(0.05, 0.001, CRATE.d + 0.0016, tape, 0, CRATE.h + 0.0005, 0, { parent: crate, cast: false, worldOffset: false });
  for (const s of [1, -1]) box(0.05, 0.05, 0.001, tape, 0, CRATE.h - 0.025, s * (CRATE.d / 2 + 0.0005), { parent: crate, cast: false, worldOffset: false });

  // Luzes de fundo do protótipo.
  const ambient = new T.AmbientLight(protoColor(T, LIGHTS.ambient.color), LIGHTS.ambient.intensity);
  const hemi = new T.HemisphereLight(protoColor(T, LIGHTS.hemi.sky), protoColor(T, LIGHTS.hemi.ground), LIGHTS.hemi.intensity);
  root.add(ambient, hemi);
  lights.push(ambient, hemi);

  // Luz pendente sobre o balcão: fio, cúpula verde, lâmpada, spot com sombra e um preenchimento.
  const pivot = new T.Group();
  pivot.position.set(0.98, ROOM.h, -0.55);
  root.add(pivot);
  const cylinder = (rt: number, rb: number, h: number, segs: number, open = false) => new T.CylinderGeometry(rt, rb, h, segs, 1, open);
  mesh(cylinder(0.004, 0.004, 0.66, 4), kit.phong({ color: 0x111111 }), 0, -0.33, 0, pivot);
  mesh(cylinder(0.03, 0.16, 0.13, 12, true), kit.phong({ color: 0x2f4a3a, side: T.DoubleSide }), 0, -0.71, 0, pivot);
  mesh(cylinder(0.034, 0.034, 0.04, 8), kit.phong({ color: 0x6a5a40 }), 0, -0.65, 0, pivot);
  const bulb = mesh(new T.SphereGeometry(0.035, 8, 6), kit.basic({ color: 0xffd8a0 }), 0, -0.76, 0, pivot);
  bulb.receiveShadow = false;

  const { lamp: L, fill: F } = LIGHTS;
  const lamp = new T.SpotLight(protoColor(T, L.color), L.intensity, L.distance, L.angle, L.penumbra, L.decay);
  lamp.position.set(0, -0.74, 0);
  const lampTarget = new T.Object3D();
  lampTarget.position.set(0, -3, 0);
  pivot.add(lamp, lampTarget);
  lamp.target = lampTarget;
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(LAMP_SHADOW.mapSize, LAMP_SHADOW.mapSize);
  lamp.shadow.bias = LAMP_SHADOW.bias;
  lamp.shadow.normalBias = LAMP_SHADOW.normalBias;
  lamp.shadow.camera.near = LAMP_SHADOW.near;
  lamp.shadow.camera.far = LAMP_SHADOW.far;
  const fill = new T.PointLight(protoColor(T, F.color), F.intensity, F.distance, F.decay);
  fill.position.set(0, -0.62, 0);
  pivot.add(fill);
  lights.push(lamp, fill);

  scene.add(root);
  const { x, y, z, yaw, pitch } = PSX_REF_CAMERA;
  camera.position.set(x, y, z);
  camera.rotation.set(pitch, yaw, 0, "YXZ");
  camera.updateMatrixWorld();
  engine.freezeTime(FROZEN_T);
  // As fotos comparam pixel a pixel: a qualidade do aparelho fica presa (o FpsGuard do SwiftShader desceria
  // para 360 no meio da sequência).
  engine.setQuality(engine.info().quality);

  return () => {
    delete window.__criptaShot;
    engine.freezeTime(null);
    scene.remove(root);
    for (const light of lights) light.dispose();
    for (const geo of geometries) geo.dispose();
    geometries.length = 0;
  };
}
