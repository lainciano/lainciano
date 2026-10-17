import type { UvCrop } from "@/rooms/gravura/crop";

const FULL: UvCrop = { x0: 0, x1: 1, y0: 0, y1: 1 };

/**
 * Recorte "cover" em UV (y para cima) para uma imagem numa moldura de outra proporção: corta as
 * laterais centrado, ou corta embaixo mantendo o topo (o cabeçalho de uma captura de site importa
 * mais que o rodapé). Mesmo resultado que object-fit: cover + object-position: top center.
 */
export function coverCrop(imageAspect: number, frameAspect: number): UvCrop {
  if (!(imageAspect > 0) || !(frameAspect > 0)) return FULL;
  if (imageAspect > frameAspect) {
    const width = frameAspect / imageAspect;
    const x0 = (1 - width) / 2;
    return { x0, x1: x0 + width, y0: 0, y1: 1 };
  }
  if (imageAspect < frameAspect) {
    const height = imageAspect / frameAspect;
    return { x0: 0, x1: 1, y0: 1 - height, y1: 1 };
  }
  return FULL;
}
