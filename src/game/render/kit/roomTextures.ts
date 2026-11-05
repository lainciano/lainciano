import { blotches, grain, jagged, mulberry, type Draw } from "../paint";

/**
 * Desenhos de canvas das peças de sala do kit (piso, rodapé, teto), movidos de `layers/cinza/textures.ts` sem
 * mudar um traço: a cinza os reexporta. Cores na convenção do protótipo 7 (hex/CSS lidos como lineares).
 */

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
