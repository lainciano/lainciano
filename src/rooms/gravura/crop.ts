/** Recorte em coordenadas UV da textura (origem embaixo, como no WebGL). */
export type UvCrop = { x0: number; x1: number; y0: number; y1: number };

const PORTRAIT_CROP: UvCrop = { x0: 0.29, x1: 0.615, y0: 0.07, y1: 0.88 };

/**
 * Retrato do Sobre. A foto tem outra pessoa à direita: o recorte isola o Luciano (spec 7.3) até
 * existir foto só dele (pendência 14). Trocar a foto = trocar só este objeto e o recorte acima.
 */
export const PORTRAIT = {
  src: "/foto-lain.jpeg",
  width: 1296,
  height: 864,
  crop: PORTRAIT_CROP,
} as const;

/** uCrop do shader: (x0, y0, largura, altura). */
export function cropToUniform(crop: UvCrop): [number, number, number, number] {
  return [crop.x0, crop.y0, crop.x1 - crop.x0, crop.y1 - crop.y0];
}

/** Caixa (% da moldura) que mostra na <img> estática exatamente o mesmo recorte do shader. */
export function cropToCssBox(crop: UvCrop): { width: string; height: string; left: string; top: string } {
  const w = crop.x1 - crop.x0;
  const h = crop.y1 - crop.y0;
  const pct = (n: number) => `${(n * 100).toFixed(3)}%`;
  return { width: pct(1 / w), height: pct(1 / h), left: pct(-crop.x0 / w), top: pct(-(1 - crop.y1) / h) };
}

/** Ponto do ponteiro → UV do plano (y para cima). */
export function pointToUv(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): [number, number] {
  return [(clientX - rect.left) / rect.width, 1 - (clientY - rect.top) / rect.height];
}
