const WAVE_AMPLITUDE = 8;
const WAVE_CYCLES = 3;

/**
 * Larguras (0..maxWidth) por coluna de `rows` linhas amostradas de uma máscara
 * de 1 canal (`width * height`, 0..255), uma linha por faixa vertical.
 */
export function lineWidths(
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  rows: number,
  maxWidth: number,
): number[][] {
  return Array.from({ length: rows }, (_, row) => {
    const y = Math.min(height - 1, Math.floor(((row + 0.5) * height) / rows));
    return Array.from({ length: width }, (_, x) => (mask[y * width + x] / 255) * maxWidth);
  });
}

/** Deslocamento vertical da linha perto do ponteiro; 0 fora do raio ou sem ponteiro. */
export function waveOffset(
  x: number,
  y: number,
  pointer: { x: number; y: number } | null,
  radius: number,
): number {
  if (!pointer) return 0;
  const d = Math.hypot(x - pointer.x, y - pointer.y);
  if (d >= radius) return 0;
  const falloff = 1 - d / radius;
  return WAVE_AMPLITUDE * falloff * falloff * Math.sin((d / radius) * Math.PI * WAVE_CYCLES);
}
