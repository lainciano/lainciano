import { blotches, edgeWear, grain, jagged, mulberry, type Draw, type Rng } from "../../render/paint";
import { BASEMENT_DOOR, COUNTER, HEATER, LAMP, NORTH_DOOR, ROOM, SOUTH_DOOR, WALL_BAND, WINDOW, type WindowLight } from "./places";

/**
 * Texturas de canvas da Antessala (desenhadas uma vez, dentro do `kit.texture`, no máximo 256 px; nenhuma é redesenhada
 * por quadro). Cores na convenção do protótipo 7 (hex/CSS lidos como lineares, ver render/materials.ts).
 *
 * Paleta (bíblia §4): o que é do PRÉDIO é frio e institucional (granilite, tinta a óleo verde-hospital até meia
 * parede, bege por cima, ferro grafite com ferrugem nas quinas, vidro aramado sujo); o que é do lainciano é quente (a
 * lâmpada âmbar e, nas próximas tarefas, a manta, o tapete, a muda). Nada vermelho aqui (o `#c0230f` é só pista) e
 * nada roxo (é só do cartão de reconhecimento).
 */

const W = ROOM.maxX - ROOM.minX;
const D = ROOM.maxZ - ROOM.minZ;
const H = ROOM.h;

/* ------------------------------------------------------------------ paredes */

export type WallFeature =
  /** vão de porta (u0..u1 em metros ao longo da parede, da esquerda de quem olha a parede de dentro) */
  | { t: "door"; u0: number; u1: number; top: number; handle?: "l" | "r" }
  /** janela: a mancha de umidade desce do peitoril até quase o chão, com a tinta estufada e as escorridas */
  | { t: "window"; u0: number; u1: number; sill: number; top: number }
  /** contorno limpo de algo que ficou anos pendurado e foi tirado (com os furos dos parafusos) */
  | { t: "ghost"; u0: number; u1: number; y0: number; y1: number }
  /** sujeira de dedo em volta do interruptor */
  | { t: "switch"; u: number; y: number }
  /** umidade subindo do chão (franja marrom) */
  | { t: "tide"; u: number; w: number; h: number }
  /** marca de encosto (cadeira, maca) riscando a barra verde */
  | { t: "rub"; u0: number; u1: number; y: number };

/** Mancha de umidade que se espalha num contorno de anéis (cada anel um pouco mais escuro na borda). */
function tideRings(g: CanvasRenderingContext2D, cx: number, top: number, width: number, depth: number, r: Rng, alpha = 1) {
  for (let k = 0; k < 4; k++) {
    const shrink = 1 - k * 0.18;
    g.beginPath();
    g.moveTo(cx - (width / 2) * shrink, top);
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = cx - (width / 2) * shrink + width * shrink * t;
      const sag = Math.sin(Math.PI * t) * depth * shrink * (0.7 + r() * 0.45);
      g.lineTo(x, top + sag);
    }
    g.closePath();
    g.fillStyle = `rgba(96,74,40,${(0.1 + k * 0.03) * alpha})`;
    g.fill();
    g.strokeStyle = `rgba(74,52,26,${(0.28 - k * 0.04) * alpha})`;
    g.lineWidth = 1.1;
    g.stroke();
  }
}

/**
 * Placa de tinta descascando: a camada de cima levanta numa borda irregular e mostra a de baixo (uma tinta mais
 * antiga ou o reboco), com a sombra da lasca e o fio claro da borda que pegou luz.
 */
function peel(g: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, r: Rng, under: string) {
  const seed = (r() * 1e6) | 0;
  g.fillStyle = "rgba(20,18,12,.32)";
  jagged(g, cx + 0.8, cy + 1.1, 1, mulberry(seed), 13, rx, ry);
  g.fill();
  g.fillStyle = under;
  jagged(g, cx, cy, 1, mulberry(seed), 13, rx, ry);
  g.fill();
  g.strokeStyle = "rgba(250,244,226,.22)";
  g.lineWidth = 0.6;
  jagged(g, cx - 0.5, cy - 0.5, 1, mulberry(seed), 13, rx, ry);
  g.stroke();
}

/** Trinca fina no reboco (passos curtos com desvio). */
function crack(g: CanvasRenderingContext2D, x: number, y: number, len: number, a: number, r: Rng, color: string) {
  g.strokeStyle = color;
  g.lineWidth = 0.7;
  g.beginPath();
  g.moveTo(x, y);
  for (let s = 0; s < len; s += 3) {
    a += (r() - 0.5) * 0.7;
    x += Math.cos(a) * 3;
    y += Math.sin(a) * 3;
    g.lineTo(x, y);
  }
  g.stroke();
}

/**
 * Parede da Antessala: tinta a óleo verde-hospital até 1,25 m (lavável, com o brilho gasto em faixas verticais de
 * pano molhado), filete verde-escuro, bege-cal por cima; encardido no pé e perto do teto, placas descascando (mais no
 * bege, onde a umidade sobe), trincas, e as marcas próprias de cada parede (`feats`). `width` em metros (a textura é
 * quadrada e esticada: tudo se desenha em metros com `px`/`py`).
 */
export function drawWall(seed: number, width: number, feats: readonly WallFeature[], peelCount = 12): Draw {
  return (g, w, h) => {
    const r = mulberry(seed);
    const px = (m: number) => (m / width) * w;
    const py = (m: number) => h - (m / H) * h;
    const split = py(WALL_BAND);
    // bege-cal em cima, verde-hospital embaixo
    g.fillStyle = "#b3a586";
    g.fillRect(0, 0, w, split);
    g.fillStyle = "#53705c";
    g.fillRect(0, split, w, h - split);
    g.save();
    g.beginPath();
    g.rect(0, 0, w, split);
    g.clip();
    blotches(g, w, h, r, 7, [96, 78, 50], 1.6, 0.3);
    blotches(g, w, h, r, 24, [232, 222, 200], 2.6, 0.14);
    blotches(g, w, h, r, 60, [70, 58, 40], 2.6, 0.1);
    g.restore();
    g.save();
    g.beginPath();
    g.rect(0, split, w, h - split);
    g.clip();
    blotches(g, w, h, r, 7, [18, 36, 26], 1.5, 0.36);
    blotches(g, w, h, r, 28, [150, 182, 160], 3, 0.12);
    // brilho do óleo gasto em faixas verticais (o pano de limpeza)
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(205,232,214,${r() * 0.05})`;
      g.fillRect(r() * w, split, 1 + r() * 3, h - split);
    }
    // riscos horizontais (macas, cadeiras de espera encostadas)
    for (let i = 0; i < 22; i++) {
      g.strokeStyle = `rgba(214,226,214,${0.06 + r() * 0.1})`;
      g.lineWidth = 0.6;
      const x = r() * w;
      const y = py(0.3 + r() * 0.65);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + 5 + r() * 18, y + (r() - 0.5) * 1.5);
      g.stroke();
    }
    g.restore();
    // filete verde-escuro que separa as tintas (pintado à mão: a linha ondula um pouco)
    g.fillStyle = "#283a2e";
    for (let x = 0; x < w; x += 2) g.fillRect(x, split - 1.4 + Math.sin(x * 0.11 + seed) * 0.4, 2, 2.6);
    g.fillStyle = "rgba(255,250,235,.1)";
    g.fillRect(0, split - 2.4, w, 0.8);
    // encardido no pé da parede e perto do teto
    let gr = g.createLinearGradient(0, h, 0, py(0.4));
    gr.addColorStop(0, "rgba(24,20,14,.7)");
    gr.addColorStop(0.25, "rgba(24,20,14,.3)");
    gr.addColorStop(1, "rgba(24,20,14,0)");
    g.fillStyle = gr;
    g.fillRect(0, py(0.4), w, h);
    gr = g.createLinearGradient(0, 0, 0, py(H - 0.45));
    gr.addColorStop(0, "rgba(42,36,24,.45)");
    gr.addColorStop(1, "rgba(42,36,24,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, w, py(H - 0.45));

    for (const f of feats) {
      if (f.t === "door") {
        // encardido de mão em volta do vão e o halo do lado da maçaneta; chutes no pé
        g.strokeStyle = "rgba(32,26,18,.2)";
        g.lineWidth = 7;
        g.strokeRect(px(f.u0), py(f.top), px(f.u1 - f.u0), h);
        const hx = f.handle === "l" ? px(f.u0) - 5 : px(f.u1) + 5;
        const rg = g.createRadialGradient(hx, py(1.05), 1, hx, py(1.05), 16);
        rg.addColorStop(0, "rgba(34,26,18,.4)");
        rg.addColorStop(1, "rgba(34,26,18,0)");
        g.fillStyle = rg;
        g.fillRect(hx - 18, py(1.05) - 18, 36, 36);
        for (let i = 0; i < 18; i++) {
          g.strokeStyle = `rgba(20,16,12,${0.18 + r() * 0.25})`;
          g.lineWidth = 0.8 + r();
          const x = px(f.u0) - 14 + r() * (px(f.u1 - f.u0) + 28);
          const y = py(0.04 + r() * 0.22);
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + 3 + r() * 6, y + (r() - 0.5) * 2);
          g.stroke();
        }
      } else if (f.t === "window") {
        // umidade que desce da janela: anéis sob o peitoril, tinta estufada e escorridas até o verde
        const cx = px((f.u0 + f.u1) / 2);
        const spread = px(f.u1 - f.u0) * 1.25;
        tideRings(g, cx, py(f.sill), spread, py(0.35) - py(f.sill), r);
        for (let i = 0; i < 9; i++) {
          const x = px(f.u0) + r() * px(f.u1 - f.u0);
          const len = (py(0.3) - py(f.sill)) * (0.4 + r() * 0.6);
          const sg = g.createLinearGradient(0, py(f.sill), 0, py(f.sill) + len);
          sg.addColorStop(0, "rgba(70,52,28,.4)");
          sg.addColorStop(1, "rgba(70,52,28,0)");
          g.fillStyle = sg;
          g.fillRect(x, py(f.sill), 1 + r() * 1.6, len);
        }
        // bolhas da tinta (estufada pela água)
        for (let i = 0; i < 14; i++) {
          const x = cx + (r() - 0.5) * spread * 0.8;
          const y = py(f.sill) + (r() * 0.7 + 0.1) * (py(0.4) - py(f.sill));
          g.fillStyle = "rgba(240,230,200,.16)";
          g.beginPath();
          g.arc(x - 0.4, y - 0.4, 1 + r() * 1.6, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = "rgba(30,24,14,.22)";
          g.beginPath();
          g.arc(x + 0.5, y + 0.6, 1 + r() * 1.2, 0, Math.PI);
          g.fill();
        }
        // a tinta solta em placas grandes logo abaixo do peitoril (o verde por baixo do bege, o reboco por baixo do verde)
        for (let i = 0; i < 6; i++) {
          const y = py(f.sill) + 4 + r() * (py(WALL_BAND + 0.05) - py(f.sill));
          peel(g, cx + (r() - 0.5) * spread * 0.7, y, 2 + r() * 4, 1.5 + r() * 3, r, r() < 0.5 ? "#8d9a86" : "#c2b89e");
        }
        // encardido do caixilho acima (a fuligem da chuva entra pelo basculante)
        const top = g.createLinearGradient(0, py(f.top) - 14, 0, py(f.top));
        top.addColorStop(0, "rgba(40,34,26,0)");
        top.addColorStop(1, "rgba(40,34,26,.35)");
        g.fillStyle = top;
        g.fillRect(px(f.u0) - 6, py(f.top) - 14, px(f.u1 - f.u0) + 12, 14);
      } else if (f.t === "ghost") {
        // a tinta que o sol não pegou: mais clara, com a borda de pó e os quatro furos
        g.fillStyle = "rgba(240,232,210,.2)";
        g.fillRect(px(f.u0), py(f.y1), px(f.u1 - f.u0), py(f.y0) - py(f.y1));
        g.strokeStyle = "rgba(60,48,30,.3)";
        g.lineWidth = 1.2;
        g.strokeRect(px(f.u0), py(f.y1), px(f.u1 - f.u0), py(f.y0) - py(f.y1));
        g.fillStyle = "#2a2018";
        for (const [a, b] of [
          [f.u0 + 0.03, f.y0 + 0.03],
          [f.u1 - 0.03, f.y0 + 0.03],
          [f.u0 + 0.03, f.y1 - 0.03],
          [f.u1 - 0.03, f.y1 - 0.03],
        ]) {
          g.beginPath();
          g.arc(px(a), py(b), 0.9, 0, Math.PI * 2);
          g.fill();
        }
      } else if (f.t === "switch") {
        const sw = g.createRadialGradient(px(f.u), py(f.y), 1, px(f.u), py(f.y), 12);
        sw.addColorStop(0, "rgba(30,24,16,.4)");
        sw.addColorStop(1, "rgba(30,24,16,0)");
        g.fillStyle = sw;
        g.fillRect(px(f.u) - 12, py(f.y) - 12, 24, 24);
      } else if (f.t === "tide") {
        tideRings(g, px(f.u), h, px(f.w), -(h - py(f.h)), r, 0.9);
      } else if (f.t === "rub") {
        for (let i = 0; i < 5; i++) {
          g.strokeStyle = `rgba(30,40,32,${0.18 + r() * 0.2})`;
          g.lineWidth = 0.8 + r() * 0.8;
          const y = py(f.y) + (r() - 0.5) * 3;
          g.beginPath();
          g.moveTo(px(f.u0) + r() * 4, y);
          g.lineTo(px(f.u1) - r() * 4, y + (r() - 0.5) * 2);
          g.stroke();
        }
      }
    }
    // descascado: placas no bege (a umidade sobe por trás do reboco) e na linha do filete; poucas no verde
    for (let i = 0; i < peelCount; i++) {
      const ym = 0.3 + r() * (H - 0.45);
      const up = ym > WALL_BAND;
      const under = up ? (r() < 0.55 ? "#9e9a8f" : "#cbc2aa") : r() < 0.6 ? "#a2a89c" : "#bdae8e";
      peel(g, r() * w, py(ym), 1.5 + r() * (up ? 6 : 3), 1.2 + r() * (up ? 4 : 2), r, under);
    }
    for (let i = 0; i < 6; i++) peel(g, r() * w, split + (r() - 0.35) * 4, 1 + r() * 2.5, 0.8 + r() * 1.4, r, "#a59f90");
    for (let i = 0; i < 4; i++) crack(g, r() * w, py(0.5 + r() * 1.9), 18 + r() * 34, r() * Math.PI * 2, r, "rgba(36,28,20,.4)");
    grain(g, w, h, r, 12);
  };
}

/** Marcas de cada parede, em metros ao longo dela (da esquerda de quem a olha de dentro). */
export const WALL_FEATURES = {
  // norte (da esquerda = oeste): a porta dupla, o contorno do quadro de horários tirado, o interruptor, umidade no canto
  n: [
    { t: "door", u0: NORTH_DOOR.x0 - ROOM.minX, u1: NORTH_DOOR.x1 - ROOM.minX, top: NORTH_DOOR.top, handle: "r" },
    { t: "ghost", u0: 3.3, u1: 3.78, y0: 1.5, y1: 1.92 },
    { t: "switch", u: 3.08, y: 1.25 },
    { t: "tide", u: 0.3, w: 0.6, h: 0.7 },
  ],
  // sul (da esquerda = leste): a porta de entrada, o interruptor à esquerda dela (de dentro), umidade atrás do aquecedor
  s: [
    { t: "door", u0: ROOM.maxX - SOUTH_DOOR.x1, u1: ROOM.maxX - SOUTH_DOOR.x0, top: SOUTH_DOOR.top, handle: "l" },
    { t: "switch", u: ROOM.maxX + 0.85, y: 1.25 },
    { t: "tide", u: ROOM.maxX - (HEATER.x0 + HEATER.x1) / 2, w: 0.7, h: 0.55 },
    { t: "rub", u0: 0.25, u1: 1.4, y: 0.82 },
  ],
  // oeste (da esquerda = sul): a janela e a mancha de umidade sob ela, o contorno do extintor que sumiu
  o: [
    { t: "window", u0: ROOM.maxZ - WINDOW.z1, u1: ROOM.maxZ - WINDOW.z0, sill: WINDOW.sill, top: WINDOW.top },
    { t: "ghost", u0: 4.42, u1: 4.68, y0: 0.72, y1: 1.32 },
    { t: "tide", u: 4.8, w: 0.5, h: 0.95 },
  ],
  // leste (da esquerda = norte): o vão do Porão, a marca do balcão que foi arrastado, umidade perto do canto
  l: [
    { t: "door", u0: BASEMENT_DOOR.z0 - ROOM.minZ, u1: BASEMENT_DOOR.z1 - ROOM.minZ, top: BASEMENT_DOOR.top, handle: "r" },
    { t: "rub", u0: 0.9, u1: 2.7, y: 0.98 },
    { t: "tide", u: 0.2, w: 0.4, h: 0.6 },
  ],
} as const satisfies Record<"n" | "s" | "o" | "l", readonly WallFeature[]>;

/* ------------------------------------------------------------------ teto */

/** Sala inteira vista de baixo (canvas: x → direita, sul em cima; o mesmo `uv` do teto do kit). */
const cx = (x: number, w: number) => ((x - ROOM.minX) / W) * w;
const czCeil = (z: number, h: number) => ((ROOM.maxZ - z) / D) * h;

/**
 * Teto de cal: infiltrações antigas em anéis (o canto da janela, o do aquecedor), a fuligem acima da lâmpada que ele
 * pendurou, e a sombra mais limpa onde as fluorescentes ficaram anos acesas (o retângulo em volta da calha).
 */
export function drawCeiling(fluorescents: readonly { x: number; z: number }[]): Draw {
  return (g, w, h) => {
    const r = mulberry(2301);
    g.fillStyle = "#a59e8c";
    g.fillRect(0, 0, w, h);
    blotches(g, w, h, r, 6, [110, 96, 70], 1.4, 0.32);
    blotches(g, w, h, r, 24, [60, 52, 40], 2.5, 0.14);
    for (const [x, z, rad] of [
      [-1.8, -1.2, 26],
      [-1.5, 2.1, 20],
      [1.7, 1.8, 16],
    ] as const) {
      for (let k = 0; k < 4; k++) {
        g.strokeStyle = `rgba(110,80,40,${0.16 + k * 0.05})`;
        g.lineWidth = 1.4;
        jagged(g, cx(x, w), czCeil(z, h), rad * (1 - k * 0.2), mulberry(2310 + k), 20, 1.2, 1);
        g.stroke();
      }
    }
    // fuligem da lâmpada âmbar (o calor sobe pela cúpula)
    const lg = g.createRadialGradient(cx(LAMP.x, w), czCeil(LAMP.z, h), 1, cx(LAMP.x, w), czCeil(LAMP.z, h), 18);
    lg.addColorStop(0, "rgba(30,22,12,.55)");
    lg.addColorStop(1, "rgba(30,22,12,0)");
    g.fillStyle = lg;
    g.fillRect(0, 0, w, h);
    // halo de pó em volta das calhas
    for (const f of fluorescents) {
      const x0 = cx(f.x - 0.72, w);
      const x1 = cx(f.x + 0.72, w);
      const y0 = czCeil(f.z + 0.16, h);
      const y1 = czCeil(f.z - 0.16, h);
      g.fillStyle = "rgba(48,42,30,.16)";
      g.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
    // teia e pó junto às paredes
    edgeWear(g, w, h, r, [40, 34, 24], 10, 0.55);
    grain(g, w, h, r, 9);
  };
}

/* ------------------------------------------------------------------ piso: desgaste */

/** Sala inteira vista de cima (canvas: x → direita, norte em cima), o `uv` do decalque do kit. */
const fz = (z: number, h: number) => ((z - ROOM.minZ) / D) * h;

/**
 * Decalque de desgaste de baixa frequência sobre o granilite: o caminho da porta sul ao balcão (o mais gasto, com a
 * cera fosca no meio), os ramos até o estar, a janela e o Porão, a frente do balcão polida por quem esperou ali,
 * sujeira junto às paredes, a ferrugem que o aquecedor velho deixou, a umidade que escorreu da janela e as gotas de
 * café perto do balcão.
 */
export const drawFloorWear: Draw = (g, w, h) => {
  const r = mulberry(2401);
  g.clearRect(0, 0, w, h);
  const fx = (x: number) => cx(x, w);
  const paths: { pts: [number, number][]; k: number }[] = [
    { pts: [[0.05, 2.5], [0.1, 2.05], [0.2, 0.75], [0.3, -0.55], [0.25, -1.4], [0.1, -2.45]], k: 1 },
    { pts: [[0.1, 2.05], [-0.4, 1.7], [-0.9, 1.5]], k: 0.55 },
    { pts: [[0.25, -0.2], [-0.6, -0.7], [-1.5, -0.9]], k: 0.45 },
    { pts: [[0.2, 0.75], [1.0, 0.85], [1.6, 0.9], [2.2, 0.9]], k: 0.5 },
    { pts: [[0.1, -1.9], [0.9, -2.1], [1.5, -2.1], [1.95, -1.4], [1.95, -0.9]], k: 0.35 },
  ];
  g.lineCap = "round";
  g.lineJoin = "round";
  for (const { pts, k } of paths) {
    for (let n = 0; n < 12; n++) {
      g.strokeStyle = `rgba(48,42,34,${(0.022 + r() * 0.022) * k})`;
      g.lineWidth = w * (0.03 + r() * 0.045);
      g.beginPath();
      pts.forEach(([x, z], i) => {
        const p = [fx(x) + (r() - 0.5) * 4, fz(z, h) + (r() - 0.5) * 4] as const;
        if (i === 0) g.moveTo(p[0], p[1]);
        else g.lineTo(p[0], p[1]);
      });
      g.stroke();
    }
  }
  // cera gasta: o meio do caminho principal fica mais fosco e claro
  for (let n = 0; n < 3; n++) {
    g.strokeStyle = "rgba(240,236,224,.035)";
    g.lineWidth = w * 0.012;
    g.beginPath();
    paths[0].pts.forEach(([x, z], i) => (i === 0 ? g.moveTo(fx(x) + (r() - 0.5) * 3, fz(z, h)) : g.lineTo(fx(x) + (r() - 0.5) * 3, fz(z, h))));
    g.stroke();
  }
  // diante do balcão: a faixa polida de quem esperou atendimento
  const front = g.createLinearGradient(fx(COUNTER.x0 - 0.5), 0, fx(COUNTER.x0), 0);
  front.addColorStop(0, "rgba(44,38,30,0)");
  front.addColorStop(1, "rgba(44,38,30,.16)");
  g.fillStyle = front;
  g.fillRect(fx(COUNTER.x0 - 0.5), fz(COUNTER.z0, h), fx(COUNTER.x0) - fx(COUNTER.x0 - 0.5), fz(COUNTER.z1, h) - fz(COUNTER.z0, h));
  // sujeira junto às paredes (a vassoura não chega no canto)
  const edge = (x0: number, y0: number, x1: number, y1: number) => {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, "rgba(26,24,20,.42)");
    gr.addColorStop(1, "rgba(26,24,20,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  };
  edge(0, 0, 0, 10);
  edge(0, h, 0, h - 10);
  edge(0, 0, 10, 0);
  edge(w, 0, w - 10, 0);
  // ferrugem do aquecedor velho (a água da condensação escorreu dos pés)
  const hx = fx((HEATER.x0 + HEATER.x1) / 2);
  const hz = fz(HEATER.z0 + 0.12, h);
  const rust = g.createRadialGradient(hx, hz, 2, hx, hz, 16);
  rust.addColorStop(0, "rgba(120,62,22,.42)");
  rust.addColorStop(0.7, "rgba(110,60,25,.16)");
  rust.addColorStop(1, "rgba(110,60,25,0)");
  g.fillStyle = rust;
  jagged(g, hx, hz, 17, r, 14, 1.3, 0.8);
  g.fill();
  // a água da janela escorreu pela parede e manchou o piso junto ao rodapé
  g.save();
  const wz = fz((WINDOW.z0 + WINDOW.z1) / 2, h);
  const wet = g.createRadialGradient(fx(ROOM.minX), wz, 2, fx(ROOM.minX), wz, 30);
  wet.addColorStop(0, "rgba(64,54,36,.4)");
  wet.addColorStop(1, "rgba(64,54,36,0)");
  g.fillStyle = wet;
  jagged(g, fx(ROOM.minX) + 4, wz, 22, r, 16, 0.7, 1.4);
  g.fill();
  g.restore();
  // gotas de café diante do balcão (a caneca)
  for (let i = 0; i < 6; i++) {
    g.fillStyle = `rgba(60,36,18,${0.28 + r() * 0.25})`;
    g.beginPath();
    g.ellipse(fx(0.5) + r() * 8, fz(-0.1, h) + r() * 12, 0.6 + r() * 0.9, 0.5 + r() * 0.6, 0, 0, Math.PI * 2);
    g.fill();
  }
  // a chuva que entrou pela porta: marcas de sola secas, de fora para dentro
  for (let i = 0; i < 10; i++) {
    const x = fx(SOUTH_DOOR.x0 + 0.3 + r() * (SOUTH_DOOR.x1 - SOUTH_DOOR.x0 - 0.6));
    const y = fz(ROOM.maxZ - 0.05 - r() * 0.6, h);
    g.fillStyle = `rgba(52,44,32,${0.12 + r() * 0.12})`;
    g.beginPath();
    g.ellipse(x, y, 1.6, 3.2, (r() - 0.5) * 0.5, 0, Math.PI * 2);
    g.fill();
  }
};

/* ------------------------------------------------------------------ ferro, vidro, reboco */

/** Ferro pintado de grafite: tinta fosca, respingos, ferrugem nas quinas e escorrida dos parafusos. */
export function drawIron(seed: number): Draw {
  return (g, w, h) => {
    const r = mulberry(seed);
    g.fillStyle = "#2c2e30";
    g.fillRect(0, 0, w, h);
    blotches(g, w, h, r, 5, [16, 16, 18], 1.5, 0.35);
    blotches(g, w, h, r, 18, [84, 88, 92], 2.6, 0.12);
    // ferrugem só em pontos (a tinta lascou) e nas quinas, pouca: o ferro lê grafite
    for (let i = 0; i < 12; i++) {
      g.fillStyle = `rgba(${96 + r() * 26},${46 + r() * 16},20,${0.2 + r() * 0.3})`;
      jagged(g, r() * w, r() * h, 0.6 + r() * 2, r, 9);
      g.fill();
    }
    for (let i = 0; i < 5; i++) {
      const x = r() * w;
      const y = r() * h * 0.6;
      const gr = g.createLinearGradient(0, y, 0, y + 10 + r() * 22);
      gr.addColorStop(0, "rgba(110,56,22,.26)");
      gr.addColorStop(1, "rgba(110,56,22,0)");
      g.fillStyle = gr;
      g.fillRect(x, y, 1.2, 30);
    }
    edgeWear(g, w, h, r, [104, 54, 24], Math.max(2, w * 0.03), 0.35);
    grain(g, w, h, r, 12);
  };
}

/**
 * Vidro aramado sujo (com alfa): o cinza-esverdeado do vidro grosso, a tela de arame em quadrados de ~1,3 cm (a 256 px
 * por painel de ~0,5 m, um fio a cada 7 px), pó acumulado embaixo, manchas de mão na altura do puxador e o risco
 * claro de um reflexo velho. `tall`: painel mais alto que largo (a tela fica no mesmo passo).
 */
export function drawWired(seed: number): Draw {
  return (g, w, h) => {
    const r = mulberry(seed);
    g.clearRect(0, 0, w, h);
    g.fillStyle = "rgba(84,100,94,.12)";
    g.fillRect(0, 0, w, h);
    // tela de arame soldada: fios um pouco tortos, mais escuros onde enferrujaram
    for (let x = 3; x < w; x += 7) {
      g.fillStyle = `rgba(${30 + r() * 16},${32 + r() * 8},30,.7)`;
      g.fillRect(x + (r() - 0.5) * 0.6, 0, 0.9, h);
    }
    for (let y = 3; y < h; y += 7) {
      g.fillStyle = `rgba(${30 + r() * 16},${32 + r() * 8},30,.7)`;
      g.fillRect(0, y + (r() - 0.5) * 0.6, w, 0.9);
    }
    // sujeira em nuvens e o pó que desce para o pé do painel
    for (let i = 0; i < 14; i++) {
      const x = r() * w;
      const y = r() * h;
      const gr = g.createRadialGradient(x, y, 2, x, y, 18 + r() * 40);
      gr.addColorStop(0, `rgba(64,60,50,${0.08 + r() * 0.1})`);
      gr.addColorStop(1, "rgba(70,66,56,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    }
    const dust = g.createLinearGradient(0, h, 0, h * 0.62);
    dust.addColorStop(0, "rgba(58,52,42,.4)");
    dust.addColorStop(1, "rgba(64,58,46,0)");
    g.fillStyle = dust;
    g.fillRect(0, 0, w, h);
    // marcas de mão (gordura) e um reflexo
    for (let i = 0; i < 3; i++) {
      g.fillStyle = "rgba(200,206,196,.07)";
      jagged(g, w * (0.2 + r() * 0.6), h * (0.55 + r() * 0.3), 8 + r() * 6, r, 9, 0.8, 1.2);
      g.fill();
    }
    g.strokeStyle = "rgba(230,240,235,.07)";
    g.lineWidth = 7;
    g.beginPath();
    const x = r() * w * 0.6;
    g.moveTo(x, 0);
    g.lineTo(x + 50, h);
    g.stroke();
  };
}

/** Reboco cru nos vãos (a espessura da parede): cinza-quente, esfarelado nas quinas. */
export const drawPlaster: Draw = (g, w, h) => {
  const r = mulberry(2501);
  g.fillStyle = "#8e887a";
  g.fillRect(0, 0, w, h);
  blotches(g, w, h, r, 6, [60, 54, 44], 1.5, 0.3);
  blotches(g, w, h, r, 20, [170, 164, 150], 2.4, 0.14);
  edgeWear(g, w, h, r, [52, 46, 36], 6, 0.5);
  grain(g, w, h, r, 14);
};

/** Peitoril de granito cinza (pedra polida, com o canto lascado e a marca redonda de um vaso que ficou ali). */
export const drawSill: Draw = (g, w, h) => {
  const r = mulberry(2511);
  g.fillStyle = "#6e6c66";
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 1800; i++) {
    const t = r();
    g.fillStyle = t < 0.4 ? "rgba(22,22,22,.7)" : t < 0.75 ? "rgba(212,208,198,.5)" : "rgba(122,98,80,.5)";
    g.fillRect(r() * w, r() * h, 1 + r(), 1 + r());
  }
  g.strokeStyle = "rgba(40,36,30,.35)";
  g.lineWidth = 1.2;
  g.beginPath();
  g.arc(w * 0.3, h * 0.5, w * 0.06, 0, Math.PI * 2);
  g.stroke();
  edgeWear(g, w, h, r, [38, 36, 32], 6, 0.5);
  grain(g, w, h, r, 8);
};

/** Madeira escura envernizada (o batente do Porão): veio vertical, verniz craquelado e escurecido na altura da mão. */
export const drawDarkWood: Draw = (g, w, h) => {
  const r = mulberry(2521);
  g.fillStyle = "#2e1a0e";
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) {
    g.strokeStyle = r() < 0.6 ? `rgba(12,6,2,${0.15 + r() * 0.3})` : `rgba(120,76,40,${0.06 + r() * 0.1})`;
    g.lineWidth = 0.5 + r() * 1.2;
    let x = r() * w;
    g.beginPath();
    g.moveTo(x, 0);
    for (let y = 0; y <= h; y += 6) {
      x += (r() - 0.5) * 1.2;
      g.lineTo(x + Math.sin(y * 0.04 + i) * 1.5, y);
    }
    g.stroke();
  }
  // craquelado do verniz: redes finas e claras
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = "rgba(160,120,80,.14)";
    g.lineWidth = 0.5;
    const x = r() * w;
    const y = r() * h;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 8, y + (r() - 0.5) * 8);
    g.lineTo(x + (r() - 0.5) * 10, y + (r() - 0.5) * 10);
    g.stroke();
  }
  edgeWear(g, w, h, r, [70, 44, 24], 5, 0.55);
  grain(g, w, h, r, 10);
};

/* ------------------------------------------------------------------ fluorescentes */

/** Calha da fluorescente: esmalte creme amarelado, ferrugem nos parafusos, insetos mortos acumulados no fundo. */
export const drawFluoHousing: Draw = (g, w, h) => {
  const r = mulberry(2601);
  g.fillStyle = "#c4bea9";
  g.fillRect(0, 0, w, h);
  blotches(g, w, h, r, 8, [120, 104, 70], 1.6, 0.3);
  for (let i = 0; i < 30; i++) {
    g.fillStyle = `rgba(30,24,18,${0.3 + r() * 0.5})`;
    g.fillRect(r() * w, h * (0.35 + r() * 0.3), 1 + r(), 1);
  }
  for (const x of [0.06, 0.94]) {
    g.fillStyle = "rgba(110,60,22,.5)";
    g.beginPath();
    g.arc(w * x, h / 2, 2.2, 0, Math.PI * 2);
    g.fill();
  }
  edgeWear(g, w, h, r, [80, 70, 50], 6, 0.5);
  grain(g, w, h, r, 10);
};

/**
 * Tubo fluorescente velho apagado: vidro leitoso cinza e as pontas enegrecidas (o tubo que já piscou demais). O `v`
 * da textura corre ao longo do tubo (o comprimento do cilindro): as pontas são o alto e o pé do canvas.
 */
export const drawFluoTube: Draw = (g, w, h) => {
  const r = mulberry(2611);
  g.fillStyle = "#9a9c98";
  g.fillRect(0, 0, w, h);
  for (const top of [true, false]) {
    const gr = top ? g.createLinearGradient(0, 0, 0, h * 0.1) : g.createLinearGradient(0, h, 0, h * 0.9);
    gr.addColorStop(0, "rgba(30,28,26,.85)");
    gr.addColorStop(1, "rgba(30,28,26,0)");
    g.fillStyle = gr;
    g.fillRect(0, top ? 0 : h * 0.9, w, h * 0.1);
  }
  grain(g, w, h, r, 8);
};

/* ------------------------------------------------------------------ lá fora: o lago, o pátio, o corredor */

/** Céu, névoa e luz do poste por estado (dia, entardecer, noite): nenhum roxo (o roxo é do cartão). */
const SKY: Record<WindowLight, { top: string; mid: string; horizon: string; water: string; shore: string; mist: [number, number, number]; sodium: number }> = {
  dia: { top: "#7e8d98", mid: "#a5b0b6", horizon: "#c4c8c4", water: "#7d8a8e", shore: "#3d4640", mist: [205, 212, 214], sodium: 0 },
  entardecer: { top: "#16263e", mid: "#3e5470", horizon: "#b08a64", water: "#33465c", shore: "#11171c", mist: [140, 162, 192], sodium: 0.8 },
  noite: { top: "#050a16", mid: "#173052", horizon: "#3f6a92", water: "#18304c", shore: "#04070c", mist: [118, 158, 206], sodium: 1 },
};

/**
 * A vista da janela (bíblia §3, fundo à esquerda): o Lago do Descoberto com névoa azul, a margem baixa do outro lado,
 * os fios do Planalto no horizonte (torre e catenárias) e, ao longe, um poste de sódio laranja (aceso no entardecer e
 * à noite: o quente contra o frio). Plano de fundo pintado em código, sem textura externa.
 */
export function drawLake(state: WindowLight): Draw {
  return (g, w, h) => {
    const r = mulberry(2701);
    const s = SKY[state];
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, s.top);
    gr.addColorStop(0.42, s.mid);
    gr.addColorStop(0.56, s.horizon);
    gr.addColorStop(0.6, s.water);
    gr.addColorStop(1, state === "dia" ? "#59666a" : "#060a10");
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    // margem do outro lado: morros baixos e a mata, em silhueta
    g.fillStyle = s.shore;
    g.beginPath();
    g.moveTo(0, h * 0.58);
    for (let x = 0; x <= w; x += 4) g.lineTo(x, h * 0.575 - 2 - Math.abs(Math.sin(x * 0.03)) * 8 - Math.abs(Math.sin(x * 0.11 + 1)) * 3 - r() * 2);
    g.lineTo(w, h * 0.6);
    g.lineTo(0, h * 0.6);
    g.fill();
    // os fios do Planalto: uma torre de transmissão e as catenárias atravessando o céu
    const tx = w * 0.22;
    const ty = h * 0.57;
    g.strokeStyle = state === "dia" ? "rgba(40,44,46,.55)" : "rgba(4,6,10,.8)";
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(tx - 6, ty);
    g.lineTo(tx, ty - 34);
    g.lineTo(tx + 6, ty);
    g.moveTo(tx - 8, ty - 26);
    g.lineTo(tx + 8, ty - 26);
    g.moveTo(tx - 5, ty - 14);
    g.lineTo(tx + 5, ty - 14);
    g.stroke();
    g.lineWidth = 0.6;
    for (const [dy, sag] of [
      [-26, 9],
      [-26, 12],
      [-30, 10],
    ] as const) {
      g.beginPath();
      g.moveTo(0, ty + dy + 6);
      g.quadraticCurveTo(tx / 2, ty + dy + sag, tx - 8, ty + dy);
      g.moveTo(tx + 8, ty + dy);
      g.quadraticCurveTo(w * 0.6, ty + dy + sag * 2.4, w, ty + dy + 4);
      g.stroke();
    }
    // reflexo do céu e ondas finas na água
    for (let y = h * 0.62; y < h; y += 2) {
      g.fillStyle = `rgba(${s.mist[0]},${s.mist[1]},${s.mist[2]},${0.025 + r() * 0.05})`;
      g.fillRect(r() * w * 0.4, y, w * (0.15 + r() * 0.45), 1);
    }
    // o poste de sódio ao longe, na margem de cá (à direita da janela): haste, braço e o halo laranja na névoa
    const lx = w * 0.6;
    const ly = h * 0.52;
    g.fillStyle = state === "dia" ? "#2a2e30" : "#05070a";
    g.fillRect(lx - 0.8, ly, 1.6, h * 0.12);
    g.fillRect(lx - 0.8, ly - 0.6, 5, 1.2);
    if (s.sodium > 0) {
      let sg = g.createRadialGradient(lx + 4, ly, 0.5, lx + 4, ly, 52);
      sg.addColorStop(0, `rgba(255,196,96,${s.sodium})`);
      sg.addColorStop(0.12, `rgba(255,150,50,${0.6 * s.sodium})`);
      sg.addColorStop(1, "rgba(255,120,40,0)");
      g.fillStyle = sg;
      g.fillRect(0, 0, w, h);
      // o reflexo do poste na água, quebrado pelas ondas
      sg = g.createLinearGradient(0, ly + 12, 0, h);
      sg.addColorStop(0, `rgba(255,140,50,${0.32 * s.sodium})`);
      sg.addColorStop(1, "rgba(255,140,50,0)");
      g.fillStyle = sg;
      for (let y = ly + 12; y < h; y += 2) g.fillRect(lx + 4 - 3 - r() * 3, y, 6 + r() * 4, 1);
    }
    // névoa em camadas sobre a água e a margem
    blotches(g, w, h, r, 10, s.mist, 1.3, state === "dia" ? 0.45 : 0.32);
    blotches(g, w, h, r, 28, s.mist, 2.2, 0.14);
    grain(g, w, h, r, 6);
  };
}

/** Névoa que passa diante da janela (com alfa; a camada desliza devagar pelo `offset`, nunca é redesenhada). */
export function drawMist(state: WindowLight): Draw {
  return (g, w, h) => {
    const r = mulberry(2711);
    const [cr, cg, cb] = SKY[state].mist;
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 34; i++) {
      // nuvens repetidas nas bordas (a textura faz a volta sem emenda)
      const x = r() * w;
      const y = h * 0.25 + r() * h * 0.6;
      const rad = 12 + r() * 40;
      for (const dx of [-w, 0, w]) {
        const gr = g.createRadialGradient(x + dx, y, 1, x + dx, y, rad);
        gr.addColorStop(0, `rgba(${cr},${cg},${cb},${state === "dia" ? 0.26 : 0.2})`);
        gr.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
        g.fillStyle = gr;
        g.fillRect(0, 0, w, h);
      }
    }
  };
}

/**
 * O pátio visto pela porta de entrada (às costas de quem entra): o concreto molhado, a outra ala do sanatório em
 * bloco escuro sobre pilotis, janelas apagadas (uma ou outra âmbar, à noite) e o reflexo do sódio no chão.
 */
export function drawPatio(state: WindowLight): Draw {
  return (g, w, h) => {
    const r = mulberry(2721);
    const s = SKY[state];
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, s.top);
    gr.addColorStop(0.5, s.mid);
    gr.addColorStop(1, state === "dia" ? "#4e5452" : "#06080a");
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    // a outra ala: bloco de concreto sobre pilotis
    g.fillStyle = state === "dia" ? "#5a5e5c" : "#07090c";
    g.fillRect(0, h * 0.2, w, h * 0.42);
    g.fillStyle = state === "dia" ? "#2c302e" : "#020304";
    for (let i = 0; i < 9; i++) g.fillRect(i * (w / 9) + 6, h * 0.62, 4, h * 0.2);
    for (let i = 0; i < 12; i++) {
      for (const row of [0.27, 0.43]) {
        const lit = state !== "dia" && r() < 0.12;
        g.fillStyle = lit ? "rgba(255,170,80,.3)" : state === "dia" ? "rgba(30,34,36,.6)" : "rgba(30,40,52,.3)";
        g.fillRect(8 + i * 20, h * row, 9, 11);
      }
    }
    if (s.sodium > 0) {
      const sg = g.createRadialGradient(w * 0.8, h * 0.6, 1, w * 0.8, h * 0.6, 26);
      sg.addColorStop(0, `rgba(255,150,60,${0.55 * s.sodium})`);
      sg.addColorStop(1, "rgba(255,150,60,0)");
      g.fillStyle = sg;
      g.fillRect(0, 0, w, h);
    }
    blotches(g, w, h, r, 12, s.mist, 1.4, 0.16);
    grain(g, w, h, r, 8);
  };
}

/** Concreto molhado do pátio, junto à porta (o chão que se vê pelo vidro). */
export const drawWetConcrete: Draw = (g, w, h) => {
  const r = mulberry(2731);
  g.fillStyle = "#3e3f3e";
  g.fillRect(0, 0, w, h);
  blotches(g, w, h, r, 6, [18, 18, 20], 1.4, 0.4);
  blotches(g, w, h, r, 26, [110, 112, 112], 2.5, 0.13);
  for (let i = 0; i < 14; i++) {
    g.fillStyle = "rgba(24,30,38,.3)";
    jagged(g, r() * w, r() * h, 5 + r() * 16, r, 12, 1.6, 0.6);
    g.fill();
  }
  grain(g, w, h, r, 16);
};

/** Parede do corredor das alas (atrás da porta norte, no escuro): o mesmo verde até meia altura, sem luz. */
export const drawCorridor: Draw = (g, w, h) => {
  const r = mulberry(2741);
  g.fillStyle = "#3d3a32";
  g.fillRect(0, 0, w, h * 0.5);
  g.fillStyle = "#26382c";
  g.fillRect(0, h * 0.5, w, h * 0.5);
  blotches(g, w, h, r, 8, [10, 12, 10], 1.4, 0.45);
  grain(g, w, h, r, 10);
};
