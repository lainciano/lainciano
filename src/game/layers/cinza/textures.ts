import { blotches, edgeWear, grain, jagged, mulberry, type Draw, type Rng } from "../../render/paint";
import { DOOR, DOOR_LEAF, RUG, ROOM, TABLE } from "./places";

/**
 * Texturas de canvas da sala cinza (desenhadas uma vez, dentro do `kit.texture`; nenhuma é redesenhada por quadro).
 * Cores na convenção do protótipo 7 (hex/CSS lidos como lineares, ver render/materials.ts).
 *
 * Quase todo desenho trabalha em METROS da peça que cobre (`meters`): o canvas é quadrado (teto de 256 px do kit),
 * a peça não; com a transformação, um círculo desenhado sai redondo depois de esticado.
 */

/** Coordenadas em metros: (0,0) no canto de baixo à esquerda da peça, y para cima. */
function meters(g: CanvasRenderingContext2D, w: number, h: number, W: number, H: number) {
  g.setTransform(w / W, 0, 0, -h / H, 0, h);
}
function reset(g: CanvasRenderingContext2D) {
  g.setTransform(1, 0, 0, 1, 0, 0);
}

/** Traço de madeira (veio) ondulado ao longo de x, em pixels. */
function grainLines(g: CanvasRenderingContext2D, w: number, h: number, r: Rng, count: number, dark: string, light: string, vertical = false) {
  for (let i = 0; i < count; i++) {
    g.strokeStyle = r() < 0.55 ? dark.replace("A", (0.12 + r() * 0.28).toFixed(2)) : light.replace("A", (0.06 + r() * 0.12).toFixed(2));
    g.lineWidth = 0.5 + r() * 1.3;
    let p = r() * (vertical ? w : h);
    const phase = r() * 6;
    const freq = 0.02 + r() * 0.04;
    g.beginPath();
    for (let t = 0; t <= (vertical ? h : w); t += 6) {
      p += (r() - 0.5) * 1.4;
      const o = Math.sin(t * freq + phase) * (2 + r() * 0.6);
      if (vertical) {
        if (t === 0) g.moveTo(p + o, t);
        else g.lineTo(p + o, t);
      } else if (t === 0) g.moveTo(t, p + o);
      else g.lineTo(t, p + o);
    }
    g.stroke();
  }
}

/** Nó da madeira: elipses concêntricas escuras com o veio desviando em volta. */
function knot(g: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, r: Rng) {
  for (let k = 5; k >= 1; k--) {
    g.strokeStyle = `rgba(22,10,4,${0.12 + (5 - k) * 0.08})`;
    g.lineWidth = 0.8;
    g.beginPath();
    g.ellipse(cx + (r() - 0.5), cy, rx * (k / 5) * 1.8, ry * (k / 5), 0, 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = "rgba(20,9,3,.75)";
  g.beginPath();
  g.ellipse(cx, cy, rx * 0.5, ry * 0.45, 0, 0, Math.PI * 2);
  g.fill();
}

/* ------------------------------------------------------------------ piso */

/**
 * Granilite cinza moldado no lugar, em painéis de 1 m com junta plástica escura (o piso de repartição antiga):
 * matriz de cimento cinza-claro, grãos de mármore preto, branco e cinza, um pouco de ocre. Meia junta em cada
 * borda (o vizinho completa), então o ladrilho pode girar. Quatro variantes, cada uma com um defeito próprio.
 */
export function drawGranilite(variant: number): Draw {
  return (g, w, h) => {
    const r = mulberry(501 + variant * 131);
    const base = ["#8b8a85", "#83827e", "#908e88", "#878580"][variant] ?? "#8b8a85";
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    blotches(g, w, h, r, 3 + variant, [52, 52, 50], 1.6, 0.28 + variant * 0.03);
    blotches(g, w, h, r, 9 + variant * 2, [196, 194, 186], 2, 0.13);
    blotches(g, w, h, r, 28 + variant * 4, [44, 44, 42], 2.4, 0.14);
    const img = g.getImageData(0, 0, w, h);
    const d = img.data;
    const speck = [0.075, 0.09, 0.065, 0.08][variant] ?? 0.075;
    for (let i = 0; i < w * h; i++) {
      const t = r();
      if (t >= speck) continue;
      const c = t < speck * 0.45 ? [28, 28, 28] : t < speck * 0.8 ? [226, 224, 216] : t < speck * 0.93 ? [120, 118, 112] : [150, 120, 70];
      const j = (r() - 0.5) * 20;
      d[i * 4] = c[0] + j;
      d[i * 4 + 1] = c[1] + j;
      d[i * 4 + 2] = c[2] + j;
    }
    g.putImageData(img, 0, 0);
    const stones = ["#1c1c1b", "#e4e2da", "#6e6d68", "#a2804a"];
    const count = [480, 620, 400, 540][variant] ?? 480;
    for (let i = 0; i < count; i++) {
      const t = r();
      g.fillStyle = stones[t < 0.42 ? 0 : t < 0.74 ? 1 : t < 0.95 ? 2 : 3];
      jagged(g, r() * w, r() * h, 0.7 + r() * (variant === 1 ? 2.1 : 1.4), r, 5);
      g.fill();
    }
    if (variant === 1) {
      // trinca fina que atravessa o painel
      g.strokeStyle = "rgba(30,30,28,.55)";
      g.lineWidth = 0.7;
      g.beginPath();
      let x = w * 0.1;
      let y = h * (0.3 + r() * 0.3);
      let a = -0.3;
      g.moveTo(x, y);
      for (let i = 0; i < 44; i++) {
        a += (r() - 0.5) * 0.6;
        x += Math.cos(a) * 4;
        y += Math.sin(a) * 4;
        g.lineTo(x, y);
      }
      g.stroke();
    } else if (variant === 2) {
      // mancha antiga de óleo/ferrugem absorvida pelo cimento
      const cx = w * (0.3 + r() * 0.4);
      const cy = h * (0.3 + r() * 0.4);
      const stain = g.createRadialGradient(cx, cy, 2, cx, cy, 40);
      stain.addColorStop(0, "rgba(70,56,36,.38)");
      stain.addColorStop(1, "rgba(70,56,36,0)");
      g.fillStyle = stain;
      jagged(g, cx, cy, 44, r, 14, 1.3, 0.9);
      g.fill();
    } else if (variant === 3) {
      // remendo de cimento liso num canto (consertaram mal)
      g.fillStyle = "rgba(118,116,110,.85)";
      g.beginPath();
      g.moveTo(w, h);
      g.lineTo(w - 34 - r() * 8, h);
      g.quadraticCurveTo(w - 30, h - 26, w, h - 38 - r() * 6);
      g.closePath();
      g.fill();
      g.strokeStyle = "rgba(40,40,38,.4)";
      g.lineWidth = 0.8;
      g.stroke();
    }
    // meia junta: plástico escuro com um fio de pó claro por dentro
    g.fillStyle = "rgba(30,30,29,.92)";
    g.fillRect(0, 0, 1.2, h);
    g.fillRect(w - 1.2, 0, 1.2, h);
    g.fillRect(0, 0, w, 1.2);
    g.fillRect(0, h - 1.2, w, 1.2);
    g.fillStyle = "rgba(190,188,180,.18)";
    g.fillRect(1.2, 0, 0.7, h);
    g.fillRect(0, 1.2, w, 0.7);
    grain(g, w, h, r, 10);
  };
}

/** Sala inteira (4 × 4 m) num canvas, vista de cima: x → direita, z → baixo do canvas. */
const fx = (x: number, w: number) => ((x - ROOM.minX) / (ROOM.maxX - ROOM.minX)) * w;
const fz = (z: number, h: number) => ((z - ROOM.minZ) / (ROOM.maxZ - ROOM.minZ)) * h;

/**
 * Decalque de desgaste de baixa frequência sobre o piso: o caminho entrada → porta (o mais gasto), os ramos até
 * a mesa e o armário, sujeira nas bordas, a marca limpa de um móvel que já não está (estante na parede oeste) e
 * os arcos riscados de uma cadeira que também sumiu, diante da mesa.
 */
export const drawFloorWear: Draw = (g, w, h) => {
  const r = mulberry(612);
  g.clearRect(0, 0, w, h);
  const paths: { pts: [number, number][]; k: number }[] = [
    { pts: [[0.2, 2.0], [0.25, 1.35], [0.5, 0.2], [0.78, -1.0], [0.8, -1.95]], k: 1 },
    { pts: [[0.25, 1.35], [-0.4, 0.6], [-1.05, -0.4]], k: 0.6 },
    { pts: [[0.4, 0.6], [0.95, 0.15], [1.35, 0.13]], k: 0.5 },
  ];
  g.lineCap = "round";
  g.lineJoin = "round";
  for (const { pts, k } of paths) {
    for (let n = 0; n < 10; n++) {
      g.strokeStyle = `rgba(44,42,38,${(0.02 + r() * 0.025) * k})`;
      g.lineWidth = w * (0.035 + r() * 0.05);
      g.beginPath();
      pts.forEach(([x, z], i) => {
        const px = fx(x, w) + (r() - 0.5) * 4;
        const pz = fz(z, h) + (r() - 0.5) * 4;
        if (i === 0) g.moveTo(px, pz);
        else g.lineTo(px, pz);
      });
      g.stroke();
    }
  }
  // cera gasta: o meio do caminho principal fica mais fosco e claro
  g.strokeStyle = "rgba(240,238,230,.045)";
  g.lineWidth = w * 0.014;
  g.beginPath();
  paths[0].pts.forEach(([x, z], i) => (i === 0 ? g.moveTo(fx(x, w), fz(z, h)) : g.lineTo(fx(x, w), fz(z, h))));
  g.stroke();
  // sujeira junto às paredes (a vassoura não chega no canto)
  const edge = (x0: number, y0: number, x1: number, y1: number) => {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, "rgba(26,24,20,.42)");
    gr.addColorStop(1, "rgba(26,24,20,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  };
  edge(0, 0, 0, 12);
  edge(0, h, 0, h - 12);
  edge(0, 0, 12, 0);
  edge(w, 0, w - 12, 0);
  // marca de estante removida: retângulo mais limpo, com a borda de pó em volta
  const [sx0, sx1, sz0, sz1] = [fx(-1.98, w), fx(-1.62, w), fz(0.7, h), fz(1.75, h)];
  g.fillStyle = "rgba(205,203,196,.07)";
  g.fillRect(sx0, sz0, sx1 - sx0, sz1 - sz0);
  g.strokeStyle = "rgba(30,28,24,.28)";
  g.lineWidth = 1.6;
  g.strokeRect(sx0, sz0, sx1 - sx0, sz1 - sz0);
  // arcos da cadeira que arrastavam diante da mesa
  const cx = fx((TABLE.x0 + TABLE.x1) / 2, w);
  const cz = fz(TABLE.z1 + 0.35, h);
  for (let i = 0; i < 7; i++) {
    g.strokeStyle = `rgba(36,34,30,${0.12 + r() * 0.12})`;
    g.lineWidth = 0.5;
    g.beginPath();
    const rad = 6 + r() * 6;
    const a = -0.4 + r() * 0.8;
    g.arc(cx + (r() - 0.5) * 8, cz + (r() - 0.5) * 4, rad, a, a + 0.9 + r() * 0.6);
    g.stroke();
  }
  // respingos de tinta perto da porta (alguém pintou a porta e não forrou o chão)
  for (let i = 0; i < 9; i++) {
    g.fillStyle = `rgba(58,84,74,${0.35 + r() * 0.3})`;
    jagged(g, fx(DOOR.x0 + r() * (DOOR.x1 - DOOR.x0), w), fz(-1.92 + r() * 0.25, h), 0.5 + r() * 0.7, r, 6);
    g.fill();
  }
};

/** Rodapé de granilite escuro (mesma família do piso, mais grosso e encardido). */
export const drawSkirting: Draw = (g, w, h) => {
  const r = mulberry(640);
  g.fillStyle = "#4b4a46";
  g.fillRect(0, 0, w, h);
  blotches(g, w, h, r, 12, [20, 20, 18], 1.5, 0.35);
  for (let i = 0; i < 300; i++) {
    g.fillStyle = r() < 0.5 ? "#1a1a19" : r() < 0.8 ? "#a9a69c" : "#6a6862";
    g.fillRect(r() * w, r() * h, 1 + r(), 1 + r());
  }
  grain(g, w, h, r, 10);
};

/** Soleira de pedra (granito cinza) com o meio polido pelo uso. */
export const drawThreshold: Draw = (g, w, h) => {
  const r = mulberry(650);
  g.fillStyle = "#6c6a66";
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) {
    const t = r();
    g.fillStyle = t < 0.4 ? "rgba(20,20,20,.7)" : t < 0.75 ? "rgba(210,206,198,.55)" : "rgba(120,96,80,.5)";
    g.fillRect(r() * w, r() * h, 1 + r() * 1.5, 1 + r() * 1.5);
  }
  const shine = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w * 0.45);
  shine.addColorStop(0, "rgba(230,226,216,.16)");
  shine.addColorStop(1, "rgba(230,226,216,0)");
  g.fillStyle = shine;
  g.fillRect(0, 0, w, h);
  edgeWear(g, w, h, r, [40, 40, 38], 8, 0.5);
  grain(g, w, h, r, 8);
};

/* ------------------------------------------------------------------ paredes e teto */

/** Lasca de reboco: borda irregular, sombra embaixo, fundo de outra tinta e o fio claro da borda. */
function plasterChip(g: CanvasRenderingContext2D, cx: number, cy: number, rad: number, r: Rng, under: string) {
  const seed = (r() * 1e6) | 0;
  g.fillStyle = "rgba(22,18,12,.35)";
  jagged(g, cx + 0.8, cy + 1, rad, mulberry(seed), 11, 1.4, 0.8);
  g.fill();
  g.fillStyle = under;
  jagged(g, cx, cy, rad, mulberry(seed), 11, 1.4, 0.8);
  g.fill();
  g.strokeStyle = "rgba(255,250,236,.28)";
  g.lineWidth = 0.6;
  jagged(g, cx - 0.4, cy - 0.4, rad, mulberry(seed), 11, 1.4, 0.8);
  g.stroke();
}

export type WallFeature =
  | { t: "door"; x0: number; x1: number; top: number }
  | { t: "outline"; x0: number; x1: number; y0: number; y1: number }
  | { t: "tide"; x: number; w: number; h: number }
  | { t: "switch"; x: number; y: number }
  | { t: "nail"; x: number; y: number; hole: boolean };

/** Altura da barra cinza-escura (tinta a óleo lavável) na parte de baixo da parede. */
export const WALL_BAND = 1.1;

/**
 * Parede da sala cinza: cal cinza-quente em cima, barra de óleo cinza até 1,10 m com um filete escuro, encardido
 * no rodapé e perto do teto, lascas de reboco, mancha de umidade subindo do chão, e as marcas próprias de cada
 * parede (`feats`): sujeira de mão em volta da porta, contorno de um quadro que foi tirado, interruptor, prego.
 */
export function drawWall(seed: number, width: number, feats: readonly WallFeature[]): Draw {
  return (g, w, h) => {
    const r = mulberry(seed);
    const H = ROOM.h;
    const py = (m: number) => h - (m / H) * h;
    const px = (m: number) => (m / width) * w;
    const split = py(WALL_BAND);
    g.fillStyle = "#a9a59b";
    g.fillRect(0, 0, w, split);
    g.fillStyle = "#666865";
    g.fillRect(0, split, w, h - split);
    g.save();
    g.beginPath();
    g.rect(0, 0, w, split);
    g.clip();
    blotches(g, w, h, r, 6, [86, 80, 66], 1.6, 0.3);
    blotches(g, w, h, r, 22, [226, 222, 210], 2.6, 0.14);
    g.restore();
    g.save();
    g.beginPath();
    g.rect(0, split, w, h - split);
    g.clip();
    blotches(g, w, h, r, 6, [24, 26, 24], 1.5, 0.34);
    blotches(g, w, h, r, 26, [150, 154, 148], 3, 0.12);
    // riscos horizontais na barra (cadeiras, malas encostadas)
    for (let i = 0; i < 26; i++) {
      g.strokeStyle = `rgba(200,198,190,${0.08 + r() * 0.12})`;
      g.lineWidth = 0.6;
      const x = r() * w;
      const y = py(0.35 + r() * 0.6);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + 6 + r() * 20, y + (r() - 0.5) * 2);
      g.stroke();
    }
    g.restore();
    g.fillStyle = "#30322f";
    g.fillRect(0, split - 1.2, w, 2.4);
    let gr = g.createLinearGradient(0, h, 0, py(0.35));
    gr.addColorStop(0, "rgba(22,20,16,.75)");
    gr.addColorStop(0.3, "rgba(22,20,16,.3)");
    gr.addColorStop(1, "rgba(22,20,16,0)");
    g.fillStyle = gr;
    g.fillRect(0, py(0.35), w, h);
    gr = g.createLinearGradient(0, 0, 0, py(H - 0.4));
    gr.addColorStop(0, "rgba(40,36,28,.45)");
    gr.addColorStop(1, "rgba(40,36,28,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, w, py(H - 0.4));
    for (const f of feats) {
      if (f.t === "door") {
        // encardido de mão nas bordas do vão e um halo em volta da maçaneta (lado direito)
        for (const x of [f.x0, f.x1]) {
          const hg = g.createLinearGradient(px(x - 0.25), 0, px(x + 0.25), 0);
          hg.addColorStop(0, "rgba(40,34,26,0)");
          hg.addColorStop(0.5, "rgba(40,34,26,.22)");
          hg.addColorStop(1, "rgba(40,34,26,0)");
          g.fillStyle = hg;
          g.fillRect(px(x - 0.25), py(1.6), px(0.5), py(0.7) - py(1.6));
        }
      } else if (f.t === "outline") {
        // quadro tirado: retângulo mais claro (a tinta que o sol não pegou) e o prego no alto
        g.fillStyle = "rgba(214,210,198,.22)";
        g.fillRect(px(f.x0), py(f.y1), px(f.x1 - f.x0), py(f.y0) - py(f.y1));
        g.strokeStyle = "rgba(60,54,44,.25)";
        g.lineWidth = 1;
        g.strokeRect(px(f.x0), py(f.y1), px(f.x1 - f.x0), py(f.y0) - py(f.y1));
      } else if (f.t === "tide") {
        // umidade subindo do chão: franja marrom irregular
        g.fillStyle = "rgba(92,74,48,.3)";
        g.beginPath();
        g.moveTo(px(f.x - f.w / 2), h);
        for (let i = 0; i <= 12; i++) {
          const x = f.x - f.w / 2 + (f.w * i) / 12;
          g.lineTo(px(x), py(f.h * (0.6 + r() * 0.4) * Math.sin((Math.PI * i) / 12)));
        }
        g.lineTo(px(f.x + f.w / 2), h);
        g.closePath();
        g.fill();
        g.strokeStyle = "rgba(70,52,30,.35)";
        g.lineWidth = 1;
        g.stroke();
      } else if (f.t === "switch") {
        g.fillStyle = "rgba(30,28,24,.2)";
        g.fillRect(px(f.x) - 5, py(f.y) - 8, 10, 16);
      } else if (f.t === "nail") {
        g.fillStyle = f.hole ? "rgba(20,18,14,.85)" : "rgba(70,62,50,.9)";
        g.beginPath();
        g.arc(px(f.x), py(f.y), 1.1, 0, Math.PI * 2);
        g.fill();
        if (f.hole) {
          g.fillStyle = "rgba(180,170,150,.5)";
          g.beginPath();
          g.arc(px(f.x) + 0.6, py(f.y) + 1.4, 1.6, 0, Math.PI);
          g.fill();
        }
      }
    }
    for (let i = 0; i < 6; i++) {
      const up = r() < 0.6;
      const cy = up ? 18 + r() * (split - 30) : split + 6 + r() * (h - split) * 0.6;
      plasterChip(g, r() * w, cy, 2.2 + r() * 4, r, up ? (r() < 0.5 ? "#8f8b82" : "#c3bfb3") : r() < 0.6 ? "#9a9b96" : "#b9b4a6");
    }
    for (let i = 0; i < 5; i++) plasterChip(g, r() * w, split + (r() - 0.3) * 4, 1.1 + r() * 1.5, r, "#a39f95");
    grain(g, w, h, r, 12);
  };
}

/** Teto de cal com uma mancha de infiltração antiga num canto (anel marrom com borda mais escura). */
export const drawCeiling: Draw = (g, w, h) => {
  const r = mulberry(660);
  g.fillStyle = "#a6a398";
  g.fillRect(0, 0, w, h);
  blotches(g, w, h, r, 6, [100, 92, 72], 1.4, 0.3);
  blotches(g, w, h, r, 20, [58, 54, 44], 2.5, 0.14);
  const cx = w * 0.84;
  const cy = h * 0.82;
  for (let k = 0; k < 3; k++) {
    g.strokeStyle = `rgba(110,82,44,${0.22 - k * 0.05})`;
    g.lineWidth = 2.2 - k * 0.5;
    jagged(g, cx, cy, 26 + k * 9, mulberry(661 + k), 18, 1.25, 0.9);
    g.stroke();
  }
  g.fillStyle = "rgba(120,96,58,.12)";
  jagged(g, cx, cy, 24, mulberry(661), 18, 1.25, 0.9);
  g.fill();
  grain(g, w, h, r, 9);
};

/* ------------------------------------------------------------------ mesa */

/**
 * Tampo da mesa visto de cima (1,2 × 0,68 m): três tábuas de canela ao longo de x, com a fresta escura entre
 * elas, veio e um nó; o verniz gasto em meia-lua na frente (onde os braços apoiam), anéis de copo, um borrão de
 * tinta, riscos de caneta, uma queimadura e um "S" riscado a ponta de compasso num canto.
 */
export const drawTableTop: Draw = (g, w, h) => {
  const r = mulberry(701);
  const W = TABLE.x1 - TABLE.x0;
  const D = TABLE.z1 - TABLE.z0;
  g.fillStyle = "#5a3721";
  g.fillRect(0, 0, w, h);
  const boards = 3;
  for (let b = 0; b < boards; b++) {
    const y0 = (b * h) / boards;
    g.fillStyle = ["rgba(255,220,180,.04)", "rgba(0,0,0,.08)", "rgba(255,210,170,.02)"][b];
    g.fillRect(0, y0, w, h / boards);
    g.save();
    g.beginPath();
    g.rect(0, y0, w, h / boards);
    g.clip();
    grainLines(g, w, h, r, 40, "rgba(22,10,4,A)", "rgba(150,100,60,A)");
    g.restore();
  }
  knot(g, w * 0.7, h * 0.18, 4, 2.4, r);
  for (let b = 1; b < boards; b++) {
    g.fillStyle = "rgba(14,7,3,.85)";
    g.fillRect(0, (b * h) / boards - 0.8, w, 1.6);
    g.fillStyle = "rgba(170,120,80,.18)";
    g.fillRect(0, (b * h) / boards + 0.8, w, 0.8);
  }
  meters(g, w, h, W, D);
  // meia-lua gasta na frente (o lado de z1 é o de baixo do canvas, y = 0 em metros)
  const wearG = g.createRadialGradient(W * 0.55, -0.02, 0.02, W * 0.55, -0.02, 0.42);
  wearG.addColorStop(0, "rgba(170,128,88,.35)");
  wearG.addColorStop(1, "rgba(170,128,88,0)");
  g.fillStyle = wearG;
  g.fillRect(0, 0, W, D);
  // anéis de copo
  for (const [x, y, rad] of [[0.95, 0.46, 0.038], [1.0, 0.5, 0.036], [0.2, 0.52, 0.042]] as const) {
    g.strokeStyle = "rgba(30,16,8,.35)";
    g.lineWidth = 0.004;
    g.beginPath();
    g.arc(x, y, rad, 0.3, 0.3 + Math.PI * (1.4 + r() * 0.5));
    g.stroke();
  }
  reset(g);
  // borrão de tinta azul-preta e respingos
  const ix = w * 0.33;
  const iy = h * 0.4;
  g.fillStyle = "rgba(14,16,30,.7)";
  jagged(g, ix, iy, 5, r, 12, 1.4, 1);
  g.fill();
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    g.arc(ix + (r() - 0.5) * 22, iy + (r() - 0.5) * 12, 0.6 + r(), 0, Math.PI * 2);
    g.fill();
  }
  // queimadura de cigarro na borda de trás
  const bx = w * 0.12;
  const by = h * 0.1;
  const burn = g.createRadialGradient(bx, by, 0.5, bx, by, 7);
  burn.addColorStop(0, "#0e0703");
  burn.addColorStop(0.5, "rgba(60,30,12,.85)");
  burn.addColorStop(1, "rgba(100,60,30,0)");
  g.fillStyle = burn;
  g.beginPath();
  g.ellipse(bx, by, 9, 4, 0.1, 0, Math.PI * 2);
  g.fill();
  // riscos claros (caneta, chave) e o "S" gravado
  for (let i = 0; i < 46; i++) {
    g.strokeStyle = `rgba(200,160,120,${0.14 + r() * 0.2})`;
    g.lineWidth = 0.5;
    const x = r() * w;
    const y = h * 0.35 + r() * h * 0.6;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 26, y + (r() - 0.5) * 6);
    g.stroke();
  }
  g.strokeStyle = "rgba(205,165,120,.5)";
  g.lineWidth = 0.9;
  g.beginPath();
  g.moveTo(w * 0.93, h * 0.82);
  g.bezierCurveTo(w * 0.88, h * 0.78, w * 0.88, h * 0.86, w * 0.91, h * 0.87);
  g.bezierCurveTo(w * 0.95, h * 0.88, w * 0.94, h * 0.95, w * 0.88, h * 0.93);
  g.stroke();
  grain(g, w, h, r, 9);
};

/** Madeira das pernas, saia e gaveta da mesa: mesmo tom do tampo, veio vertical e quinas mais claras. */
export function drawWood(seed: number, base: string, vertical: boolean): Draw {
  return (g, w, h) => {
    const r = mulberry(seed);
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    grainLines(g, w, h, r, 46, "rgba(18,8,3,A)", "rgba(140,92,56,A)", vertical);
    blotches(g, w, h, r, 6, [20, 10, 4], 1.6, 0.26);
    grain(g, w, h, r, 10);
  };
}

/** Chanfro gasto: a madeira crua aparece por baixo do verniz nas quinas. */
export function drawWornEdge(seed: number, base: string): Draw {
  return (g, w, h) => {
    const r = mulberry(seed);
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 140; i++) {
      g.fillStyle = `rgba(30,16,8,${0.1 + r() * 0.3})`;
      g.fillRect(r() * w, r() * h, 2 + r() * 10, 1 + r() * 2);
    }
    grain(g, w, h, r, 14);
  };
}

/* ------------------------------------------------------------------ guarda-roupa */

/** Imbuia escura em folha (veio largo, "flamejado"), com sujeira de mão em volta dos puxadores. */
export const drawVeneer: Draw = (g, w, h) => {
  const r = mulberry(720);
  g.fillStyle = "#3a2416";
  g.fillRect(0, 0, w, h);
  // veio flamejado: arcos encaixados que sobem
  for (let i = 0; i < 34; i++) {
    const cx = w * (0.5 + (r() - 0.5) * 0.3);
    const ry = h * (0.15 + i * 0.03);
    g.strokeStyle = `rgba(${r() < 0.5 ? "16,8,3" : "120,78,44"},${0.12 + r() * 0.2})`;
    g.lineWidth = 0.6 + r() * 1.4;
    g.beginPath();
    g.ellipse(cx, h * 1.05, w * (0.12 + i * 0.012), ry, 0, Math.PI, Math.PI * 2);
    g.stroke();
  }
  grainLines(g, w, h, r, 26, "rgba(14,6,2,A)", "rgba(110,70,40,A)", true);
  blotches(g, w, h, r, 5, [12, 6, 2], 1.4, 0.3);
  grain(g, w, h, r, 9);
};

/**
 * Folha da porta do guarda-roupa em metros (0,465 × 1,58 m, sem a moldura): veio, o encardido de mão em volta
 * do puxador, riscos de pé embaixo e o pó acumulado na moldura de cima. `left` espelha o lado do puxador.
 */
export function drawWardrobeDoor(seed: number, left: boolean): Draw {
  return (g, w, h) => {
    drawVeneer(g, w, h);
    const r = mulberry(seed);
    const W = 0.465;
    const H = 1.58;
    meters(g, w, h, W, H);
    const hx = left ? W - 0.05 : 0.05;
    const grime = g.createRadialGradient(hx, 0.98, 0.01, hx, 0.98, 0.2);
    grime.addColorStop(0, "rgba(10,6,3,.55)");
    grime.addColorStop(1, "rgba(10,6,3,0)");
    g.fillStyle = grime;
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 22; i++) {
      g.strokeStyle = `rgba(150,110,70,${0.12 + r() * 0.2})`;
      g.lineWidth = 0.002;
      const x = r() * W;
      const y = 0.02 + r() * 0.22;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 0.08, y + (r() - 0.5) * 0.02);
      g.stroke();
    }
    reset(g);
    edgeWear(g, w, h, r, [120, 84, 52], 5, 0.4);
  };
}

/** Espelho de latão da fechadura: chapa gasta com o buraco da chave e dois parafusos. */
export const drawEscutcheon: Draw = (g, w, h) => {
  const r = mulberry(730);
  const gr = g.createLinearGradient(0, 0, w, h);
  gr.addColorStop(0, "#9c8048");
  gr.addColorStop(0.5, "#c4a464");
  gr.addColorStop(1, "#7a6236");
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  blotches(g, w, h, r, 6, [40, 32, 14], 1.4, 0.45);
  // buraco da chave: círculo + trapézio
  g.fillStyle = "#0c0a06";
  g.beginPath();
  g.arc(w / 2, h * 0.42, w * 0.13, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(w * 0.45, h * 0.44);
  g.lineTo(w * 0.55, h * 0.44);
  g.lineTo(w * 0.6, h * 0.72);
  g.lineTo(w * 0.4, h * 0.72);
  g.closePath();
  g.fill();
  for (const y of [0.12, 0.9]) {
    g.fillStyle = "#4e3e1e";
    g.beginPath();
    g.arc(w / 2, h * y, w * 0.07, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#1c150a";
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(w / 2 - w * 0.06, h * y);
    g.lineTo(w / 2 + w * 0.06, h * y);
    g.stroke();
  }
  edgeWear(g, w, h, r, [60, 46, 20], 4, 0.6);
};

/* ------------------------------------------------------------------ porta */

/**
 * Pintura da folha da porta em metros (`DOOR_LEAF`): esmalte verde-acinzentado velho, escorrido em fios, lascado
 * nas quinas e no pé (mostra o primer ocre e a madeira), encardido de mão em volta da fechadura e do batente,
 * marcas de chute embaixo, um número 7 em decalque meio arrancado e fita crepe velha que segurou um aviso.
 */
export const drawDoorPaint: Draw = (g, w, h) => {
  const r = mulberry(740);
  const W = DOOR_LEAF.w;
  const H = DOOR_LEAF.h;
  g.fillStyle = "#3f5249";
  g.fillRect(0, 0, w, h);
  blotches(g, w, h, r, 6, [20, 30, 26], 1.5, 0.35);
  blotches(g, w, h, r, 20, [130, 150, 138], 2.5, 0.12);
  // pinceladas verticais e escorridos
  for (let i = 0; i < 70; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? "0,0,0" : "160,180,168"},${0.03 + r() * 0.04})`;
    g.fillRect(r() * w, 0, 1 + r() * 2, h);
  }
  for (let i = 0; i < 9; i++) {
    const x = r() * w;
    const y = r() * h * 0.6;
    g.fillStyle = "rgba(40,56,48,.6)";
    g.fillRect(x, y, 1.2, 6 + r() * 16);
    g.beginPath();
    g.arc(x + 0.6, y + 6 + r() * 16, 1.3, 0, Math.PI * 2);
    g.fill();
  }
  meters(g, w, h, W, H);
  // encardido da mão em volta da fechadura (lado direito, a ~1,02 m) e na borda onde se empurra
  const grime = g.createRadialGradient(W - 0.09, 1.0, 0.02, W - 0.09, 1.0, 0.26);
  grime.addColorStop(0, "rgba(16,16,12,.55)");
  grime.addColorStop(1, "rgba(16,16,12,0)");
  g.fillStyle = grime;
  g.fillRect(0, 0, W, H);
  const push = g.createLinearGradient(W, 0, W - 0.18, 0);
  push.addColorStop(0, "rgba(18,18,14,.35)");
  push.addColorStop(1, "rgba(18,18,14,0)");
  g.fillStyle = push;
  g.fillRect(W - 0.18, 0.8, 0.18, 0.7);
  // chutes e solado no pé da porta
  for (let i = 0; i < 18; i++) {
    g.fillStyle = `rgba(20,18,14,${0.15 + r() * 0.25})`;
    g.save();
    g.translate(0.15 + r() * 0.5, 0.05 + r() * 0.22);
    g.rotate((r() - 0.5) * 0.8);
    g.fillRect(-0.03, -0.006, 0.05 + r() * 0.05, 0.012 + r() * 0.01);
    g.restore();
  }
  // número 7 de decalque, metade arrancada
  g.save();
  g.translate(W / 2, 1.62);
  g.fillStyle = "rgba(200,190,160,.75)";
  g.beginPath();
  g.moveTo(-0.045, 0.06);
  g.lineTo(0.05, 0.06);
  g.lineTo(0.0, -0.07);
  g.lineTo(-0.025, -0.07);
  g.lineTo(0.018, 0.035);
  g.lineTo(-0.045, 0.035);
  g.closePath();
  g.fill();
  g.restore();
  // fita crepe velha (dois pedaços) no alto
  for (const [x, y, a] of [[0.24, 1.86, 0.2], [0.58, 1.84, -0.15]] as const) {
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.fillStyle = "rgba(178,160,112,.8)";
    g.fillRect(-0.03, -0.009, 0.06, 0.018);
    g.fillStyle = "rgba(90,74,40,.35)";
    g.fillRect(-0.03, -0.009, 0.06, 0.003);
    g.restore();
  }
  reset(g);
  // lascas: primer ocre por baixo e, no fundo de algumas, a madeira
  for (let i = 0; i < 22; i++) {
    const nearEdge = r() < 0.7;
    const x = nearEdge ? (r() < 0.5 ? r() * 10 : w - r() * 10) : r() * w;
    const y = r() < 0.4 ? h - r() * 24 : r() * h;
    const rad = 1.2 + r() * 3.5;
    g.fillStyle = "rgba(20,26,22,.5)";
    jagged(g, x + 0.6, y + 0.8, rad, mulberry(i + 900), 9);
    g.fill();
    g.fillStyle = "#9a7a46";
    jagged(g, x, y, rad, mulberry(i + 900), 9);
    g.fill();
    if (rad > 3) {
      g.fillStyle = "#4a2e18";
      jagged(g, x, y, rad * 0.5, mulberry(i + 950), 7);
      g.fill();
    }
  }
  grain(g, w, h, r, 10);
};

/** Batente e alisar: a mesma tinta, mais gasta e com marcas de pancada. */
export const drawFramePaint: Draw = (g, w, h) => {
  const r = mulberry(750);
  g.fillStyle = "#43554c";
  g.fillRect(0, 0, w, h);
  blotches(g, w, h, r, 8, [20, 28, 24], 1.5, 0.35);
  for (let i = 0; i < 20; i++) {
    g.fillStyle = r() < 0.6 ? "#a08050" : "#3c2614";
    jagged(g, r() * w, r() * h, 1 + r() * 2.5, r, 7);
    g.fill();
  }
  grain(g, w, h, r, 12);
};

/* ------------------------------------------------------------------ tapete */

/**
 * Tapete de lã de 1,6 × 1,1 m (desenhado em metros): campo vinho com faixas de borda azul-noite e mostarda,
 * gregas em losango, medalhão central, a trama visível, o caminho mais gasto e desbotado onde se pisa (da
 * entrada até a mesa), uma mancha de café e a borda puída num canto.
 */
export const drawRug: Draw = (g, w, h) => {
  const r = mulberry(800);
  const W = RUG.x1 - RUG.x0;
  const H = RUG.z1 - RUG.z0;
  meters(g, w, h, W, H);
  g.fillStyle = "#5e2a1d";
  g.fillRect(0, 0, W, H);
  const band = (ins: number, col: string, lw: number) => {
    g.strokeStyle = col;
    g.lineWidth = lw;
    g.strokeRect(ins, ins, W - ins * 2, H - ins * 2);
  };
  band(0.035, "#1f2534", 0.06);
  band(0.08, "#9a7638", 0.018);
  band(0.125, "#2a2f3e", 0.045);
  band(0.165, "#9a7638", 0.008);
  // gregas na faixa escura: losangos mostarda
  const step = 0.06;
  g.fillStyle = "#b08c46";
  const diamond = (x: number, y: number, s: number) => {
    g.beginPath();
    g.moveTo(x, y - s);
    g.lineTo(x + s, y);
    g.lineTo(x, y + s);
    g.lineTo(x - s, y);
    g.closePath();
    g.fill();
  };
  for (let x = 0.07; x < W - 0.05; x += step) {
    diamond(x, 0.035, 0.012);
    diamond(x, H - 0.035, 0.012);
  }
  for (let y = 0.07; y < H - 0.05; y += step) {
    diamond(0.035, y, 0.012);
    diamond(W - 0.035, y, 0.012);
  }
  // medalhão: losangos concêntricos e um anel de pontas
  const cx = W / 2;
  const cy = H / 2;
  for (const [s, col] of [[0.38, "#20283a"], [0.32, "#9a7638"], [0.27, "#6e3222"], [0.17, "#cfbf98"], [0.1, "#20283a"], [0.045, "#9a7638"]] as const) {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(cx, cy - s * 0.72);
    g.lineTo(cx + s, cy);
    g.lineTo(cx, cy + s * 0.72);
    g.lineTo(cx - s, cy);
    g.closePath();
    g.fill();
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    g.fillStyle = i % 2 ? "#cfbf98" : "#2a3242";
    diamond(cx + Math.cos(a) * 0.46, cy + Math.sin(a) * 0.3, 0.014);
  }
  // cantos: quartos de medalhão
  for (const [x, y] of [[0.17, 0.17], [W - 0.17, 0.17], [0.17, H - 0.17], [W - 0.17, H - 0.17]] as const) {
    g.fillStyle = "#20283a";
    g.beginPath();
    g.arc(x, y, 0.09, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#9a7638";
    g.beginPath();
    g.arc(x, y, 0.045, 0, Math.PI * 2);
    g.fill();
  }
  // caminho gasto e desbotado (diagonal: do canto sudeste, por onde se chega, até a frente da mesa)
  g.lineCap = "round";
  for (let k = 0; k < 8; k++) {
    g.strokeStyle = `rgba(196,176,150,${0.04 + r() * 0.04})`;
    g.lineWidth = 0.22 + r() * 0.18;
    g.beginPath();
    g.moveTo(W + 0.05, 0.05);
    g.quadraticCurveTo(W * 0.62, H * 0.42, W * 0.5 + (r() - 0.5) * 0.1, H * 0.95);
    g.stroke();
  }
  // mancha de café
  g.fillStyle = "rgba(40,22,10,.38)";
  g.beginPath();
  g.ellipse(W * 0.3, H * 0.68, 0.07, 0.05, 0.4, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "rgba(30,16,6,.35)";
  g.lineWidth = 0.006;
  g.stroke();
  reset(g);
  // trama: linhas finas nas duas direções (lã), mais o felpo
  for (let y = 0; y < h; y += 2) {
    g.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.06})`;
    g.fillRect(0, y, w, 1);
  }
  for (let x = 0; x < w; x += 3) {
    g.fillStyle = `rgba(255,240,220,${0.015 + r() * 0.02})`;
    g.fillRect(x, 0, 1, h);
  }
  blotches(g, w, h, r, 10, [24, 16, 10], 1.8, 0.28);
  // borda puída no canto noroeste do tapete (topo esquerdo do canvas)
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(150,120,90,${0.2 + r() * 0.3})`;
    g.fillRect(r() * 26, r() * 8, 1, 2 + r() * 4);
  }
  grain(g, w, h, r, 18);
};

/** Lateral do tapete (a espessura): trama crua, mais clara, com o ponto da costura. */
export const drawRugSide: Draw = (g, w, h) => {
  const r = mulberry(810);
  g.fillStyle = "#3a2018";
  g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 4) {
    g.fillStyle = `rgba(200,170,130,${0.15 + r() * 0.15})`;
    g.fillRect(x, 0, 2, h);
  }
  grain(g, w, h, r, 14);
};

/**
 * Franja (com alfa): fios de algodão cru amarrados em tufos, uns retos, uns tortos, alguns arrancados.
 * A textura cobre a franja de uma ponta (largura do tapete × 7 cm); `alphaTest` recorta os fios.
 */
export const drawFringe: Draw = (g, w, h) => {
  const r = mulberry(820);
  g.clearRect(0, 0, w, h);
  const tufts = 34;
  for (let t = 0; t < tufts; t++) {
    if (r() < 0.06) continue;
    const x0 = ((t + 0.5) / tufts) * w;
    // nó
    g.fillStyle = "#cfc3a6";
    g.fillRect(x0 - 2, 0, 4, h * 0.16);
    const strands = 4 + Math.floor(r() * 3);
    for (let s = 0; s < strands; s++) {
      g.strokeStyle = r() < 0.3 ? "#a89878" : "#d8ccb0";
      g.lineWidth = 1.1;
      const len = h * (0.6 + r() * 0.38);
      const bend = (r() - 0.5) * 10;
      g.beginPath();
      g.moveTo(x0 + (s - strands / 2) * 0.9, h * 0.15);
      g.quadraticCurveTo(x0 + bend * 0.5, h * 0.15 + len * 0.5, x0 + bend + (s - strands / 2) * 1.6, h * 0.15 + len * 0.84);
      g.stroke();
    }
  }
};

/* ------------------------------------------------------------------ objetos pequenos */

/**
 * Bilhete: folha pautada arrancada de caderno (picote na borda de cima), dobrada ao meio, com letra à mão em
 * tinta azul que borrou um pouco e um círculo de caneca na ponta. Desenhado em pixels (folha inteira).
 */
export const drawNote: Draw = (g, w, h) => {
  const r = mulberry(830);
  g.fillStyle = "#ddd5bf";
  g.fillRect(0, 0, w, h);
  blotches(g, w, h, r, 6, [170, 150, 110], 1.6, 0.25);
  for (let y = h * 0.14; y < h; y += h / 18) {
    g.fillStyle = "rgba(90,120,160,.35)";
    g.fillRect(0, y, w, 0.8);
  }
  g.fillStyle = "rgba(170,60,60,.4)";
  g.fillRect(w * 0.12, 0, 0.8, h);
  // picote: bolinhas faltando na borda de cima
  for (let x = 4; x < w; x += 8) {
    g.clearRect(x - 1.5, 0, 3, 2.5);
  }
  // dobra no meio
  g.fillStyle = "rgba(90,80,60,.25)";
  g.fillRect(0, h / 2 - 0.6, w, 1.2);
  // letra cursiva: palavras feitas de laços
  g.strokeStyle = "rgba(24,34,90,.85)";
  g.lineCap = "round";
  for (let line = 0; line < 6; line++) {
    let x = w * 0.16;
    const y = h * 0.14 + (line + 1) * (h / 18) - 2;
    const words = 2 + Math.floor(r() * 3);
    for (let k = 0; k < words && x < w * 0.92; k++) {
      const letters = 3 + Math.floor(r() * 5);
      g.lineWidth = 0.9 + r() * 0.3;
      g.beginPath();
      g.moveTo(x, y);
      for (let l = 0; l < letters; l++) {
        const up = r() < 0.25 ? 7 : 3.5;
        g.bezierCurveTo(x + 1, y - up, x + 3.5, y - up, x + 3.5, y);
        x += 3.6 + r();
      }
      g.stroke();
      x += 5 + r() * 4;
    }
  }
  // assinatura: um traço e um ponto
  g.beginPath();
  g.moveTo(w * 0.62, h * 0.86);
  g.bezierCurveTo(w * 0.7, h * 0.8, w * 0.74, h * 0.92, w * 0.84, h * 0.84);
  g.stroke();
  // borrão de tinta e círculo de caneca
  g.fillStyle = "rgba(24,34,90,.35)";
  jagged(g, w * 0.7, h * 0.33, 2.2, r, 9);
  g.fill();
  g.strokeStyle = "rgba(110,70,30,.35)";
  g.lineWidth = 1.4;
  g.beginPath();
  g.arc(w * 0.92, h * 0.94, w * 0.18, Math.PI * 1.05, Math.PI * 1.6);
  g.stroke();
  edgeWear(g, w, h, r, [150, 132, 96], 4, 0.4);
  grain(g, w, h, r, 8);
};

/** Capa do caderno: percalina preta gasta, cantos esbranquiçados, uma etiqueta com o número escrito à mão. */
export const drawNotebookCover: Draw = (g, w, h) => {
  const r = mulberry(840);
  g.fillStyle = "#1d1c1a";
  g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 2) {
    g.fillStyle = `rgba(255,255,255,${0.012 + r() * 0.02})`;
    g.fillRect(0, y, w, 1);
  }
  blotches(g, w, h, r, 6, [70, 66, 58], 1.5, 0.3);
  g.fillStyle = "#cfc6ae";
  g.fillRect(w * 0.3, h * 0.36, w * 0.4, h * 0.16);
  g.strokeStyle = "rgba(60,40,20,.6)";
  g.lineWidth = 1;
  g.strokeRect(w * 0.3 + 2, h * 0.36 + 2, w * 0.4 - 4, h * 0.16 - 4);
  g.strokeStyle = "rgba(24,30,80,.8)";
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(w * 0.42, h * 0.48);
  g.lineTo(w * 0.47, h * 0.4);
  g.lineTo(w * 0.47, h * 0.49);
  g.moveTo(w * 0.52, h * 0.41);
  g.bezierCurveTo(w * 0.6, h * 0.38, w * 0.6, h * 0.46, w * 0.52, h * 0.49);
  g.lineTo(w * 0.6, h * 0.49);
  g.stroke();
  edgeWear(g, w, h, r, [120, 114, 100], 7, 0.75);
  grain(g, w, h, r, 10);
};

/** Miolo visto de lado: folhas creme com as linhas e um marcador de fita vermelha escapando. */
export const drawPages: Draw = (g, w, h) => {
  const r = mulberry(850);
  g.fillStyle = "#d6cdb4";
  g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 1.5) {
    g.fillStyle = `rgba(110,92,64,${0.08 + r() * 0.12})`;
    g.fillRect(0, y, w, 0.6);
  }
  g.fillStyle = "#7a1c14";
  g.fillRect(w * 0.7, 0, 3, h);
  edgeWear(g, w, h, r, [140, 120, 86], 5, 0.5);
};

/** Lápis amarelo sextavado com o nome gravado em dourado gasto. */
export const drawPencil: Draw = (g, w, h) => {
  const r = mulberry(860);
  g.fillStyle = "#c79a24";
  g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 2) {
    g.fillStyle = `rgba(0,0,0,${0.02 + r() * 0.05})`;
    g.fillRect(x, 0, 1, h);
  }
  g.fillStyle = "rgba(60,44,10,.6)";
  for (let i = 0; i < 9; i++) g.fillRect(w * 0.3 + i * 4, h * 0.45, 2.5, h * 0.1);
  grain(g, w, h, r, 10);
};

/* ------------------------------------------------------------------ luminária */

/** Esmalte da cúpula: verde-garrafa por fora, lascado na borda até o ferro preto; ferrugem escorrida. */
export const drawEnamelOut: Draw = (g, w, h) => {
  const r = mulberry(870);
  g.fillStyle = "#24392e";
  g.fillRect(0, 0, w, h);
  blotches(g, w, h, r, 6, [10, 18, 14], 1.5, 0.35);
  // brilho vertical do esmalte
  for (let x = 0; x < w; x += 16) {
    g.fillStyle = "rgba(170,200,180,.05)";
    g.fillRect(x, 0, 4, h);
  }
  // lascas na borda (o v alto da lathe é a borda de baixo)
  for (let i = 0; i < 16; i++) {
    const x = r() * w;
    const y = h - r() * 14;
    g.fillStyle = "#0d0d0c";
    jagged(g, x, y, 1.5 + r() * 3, r, 8);
    g.fill();
    g.fillStyle = "rgba(110,60,24,.6)";
    g.fillRect(x - 0.5, y - 10 - r() * 10, 1, 10 + r() * 6);
  }
  grain(g, w, h, r, 8);
};

/** Esmalte de dentro: branco amarelado, encardido em cima pelo calor da lâmpada. */
export const drawEnamelIn: Draw = (g, w, h) => {
  const r = mulberry(880);
  g.fillStyle = "#d8d0bc";
  g.fillRect(0, 0, w, h);
  const heat = g.createLinearGradient(0, 0, 0, h * 0.6);
  heat.addColorStop(0, "rgba(110,80,40,.6)");
  heat.addColorStop(1, "rgba(110,80,40,0)");
  g.fillStyle = heat;
  g.fillRect(0, 0, w, h);
  grain(g, w, h, r, 8);
};

/* ------------------------------------------------------------------ mãos */

/** Manga do casaco: sarja cinza-escura com trama diagonal e punho mais gasto. */
export const drawSleeve: Draw = (g, w, h) => {
  const r = mulberry(890);
  g.fillStyle = "#2b2c28";
  g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const k = ((x >> 1) + (y >> 1)) % 4 < 2 ? 1 : -1;
      g.fillStyle = k > 0 ? "rgba(255,255,255,.035)" : "rgba(0,0,0,.08)";
      g.fillRect(x, y, 2, 2);
    }
  }
  blotches(g, w, h, r, 6, [0, 0, 0], 1.5, 0.3);
  edgeWear(g, w, h, r, [86, 84, 78], 4, 0.35);
  grain(g, w, h, r, 14);
};

/** Pele: tom quente com as dobras dos nós mais escuras (a textura corre ao longo do dedo). */
export const drawSkin: Draw = (g, w, h) => {
  const r = mulberry(900);
  g.fillStyle = "#8c6652";
  g.fillRect(0, 0, w, h);
  blotches(g, w, h, r, 5, [120, 70, 56], 1.4, 0.3);
  for (const y of [0.3, 0.62]) {
    g.fillStyle = "rgba(70,40,30,.3)";
    g.fillRect(0, h * y, w, 1.5);
  }
  grain(g, w, h, r, 8);
};

/** Corpo da lanterna: alumínio preto anodizado, com o recartilhado da empunhadura. */
export const drawKnurl: Draw = (g, w, h) => {
  g.fillStyle = "#1c1c1e";
  g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 3) {
    for (let x = (y / 3) % 2 ? 0 : 1.5; x < w; x += 3) {
      g.fillStyle = "rgba(120,120,126,.25)";
      g.fillRect(x, y, 1, 1);
    }
  }
  g.fillStyle = "rgba(200,200,206,.18)";
  g.fillRect(0, 0, w, 1);
};
