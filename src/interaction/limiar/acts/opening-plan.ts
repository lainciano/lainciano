/**
 * Lógica pura do ato Abertura (gravura acendendo, spec Limiar 3.2): quantas linhas, resolução da máscara,
 * tamanho da fonte do wordmark, progresso da varredura e trechos acesos de cada linha.
 */

/** Faixa de linhas da gravura (spec: 90 a 140 conforme a altura). */
export const ENGRAVING_ROWS = [90, 140] as const;
/** Altura alvo de uma faixa (px CSS): 630 px de altura dão 90 linhas, 980 px dão 140. */
const ROW_PX = 7;
/** Teto do devicePixelRatio do canvas (telas 3x desenham como 2x). */
export const MAX_DPR = 2;
/** A máscara do wordmark é rasterizada a 1/3 da resolução CSS (uma coluna de largura a cada 3 px). */
export const MASK_SCALE = 3;
/** Raio (px CSS) em que o ponteiro entorta as linhas. */
export const WAVE_RADIUS_PX = 140;
/** Largura mínima (px CSS) para um trecho de linha contar como aceso. */
export const MIN_LINE_PX = 0.2;
/** A linha mais grossa ocupa esta fração do espaço entre linhas (sobra uma fresta de breu). */
export const LINE_FILL = 0.86;

export function engravingRows(heightPx: number): number {
  const [min, max] = ENGRAVING_ROWS;
  if (!Number.isFinite(heightPx) || heightPx <= 0) return min;
  return Math.min(max, Math.max(min, Math.round(heightPx / ROW_PX)));
}

export function capDpr(dpr: number): number {
  if (!Number.isFinite(dpr) || dpr < 1) return 1;
  return Math.min(MAX_DPR, dpr);
}

/** Tamanho da máscara para um canvas de `width × height` px CSS (no mínimo 1×1). */
export function maskSize(width: number, height: number, scale = MASK_SCALE): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round(width / scale)),
    height: Math.max(1, Math.round(height / scale)),
  };
}

/**
 * Tamanho de fonte para o texto caber na caixa: `measured` é a caixa de tinta medida com a fonte em `refSize`
 * (largura e altura escalam juntas com o tamanho). Sem medida válida, devolve 0.
 */
export function fitFontSize(
  box: { width: number; height: number },
  measured: { width: number; height: number },
  refSize: number,
): number {
  if (measured.width <= 0 || measured.height <= 0 || box.width <= 0 || box.height <= 0) return 0;
  return refSize * Math.min(box.width / measured.width, box.height / measured.height);
}

/** Progresso (0..1) da varredura `--sangue`, suavizado nas pontas; duração ≤ 0 já está pronta. */
export function sweepProgress(elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0) return 1;
  const t = Math.min(1, Math.max(0, elapsedMs / durationMs));
  return t * t * (3 - 2 * t);
}

/** Trechos `[início, fim)` de colunas com largura acima de `min` (o desenho só percorre o que acende). */
export function rowRuns(widths: readonly number[], min = MIN_LINE_PX): [number, number][] {
  const runs: [number, number][] = [];
  let start = -1;
  for (let i = 0; i < widths.length; i++) {
    const on = widths[i] > min;
    if (on && start < 0) start = i;
    else if (!on && start >= 0) {
      runs.push([start, i]);
      start = -1;
    }
  }
  if (start >= 0) runs.push([start, widths.length]);
  return runs;
}
