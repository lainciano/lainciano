/**
 * Pincéis de textura de canvas compartilhados (técnica do protótipo 7): PRNG determinístico, manchas de baixa
 * frequência, grão, contornos irregulares e bordas gastas. Puros sobre um `CanvasRenderingContext2D`; nenhuma
 * textura é redesenhada por quadro (contratos 4b): tudo aqui roda uma vez, dentro de `kit.texture`.
 */

export type Rng = () => number;
export type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;
export type Rgb = readonly [number, number, number];

/** PRNG do protótipo (mulberry32): mesmas texturas a cada abertura. */
export function mulberry(seed: number): Rng {
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
export function blotches(g: CanvasRenderingContext2D, w: number, h: number, r: Rng, cells: number, rgb: Rgb, pow: number, amax: number) {
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
  // O rascunho já foi copiado: zera para o navegador soltar o buffer na hora (o leitor abre e fecha à vontade).
  c.width = 0;
  c.height = 0;
}

export function grain(g: CanvasRenderingContext2D, w: number, h: number, r: Rng, amp: number) {
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
export function jagged(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, rng: Rng, n: number, sx = 1, sy = 1) {
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
export function edgeWear(g: CanvasRenderingContext2D, w: number, h: number, r: Rng, rgb: Rgb, width: number, amax: number) {
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
