/** Relíquia Lente (spec 7.5/8.4): revelar ≥ 80% de uma captura numa grade de 12×8 células. */
export const COVERAGE = { cols: 12, rows: 8, goal: 0.8 } as const;

export type Coverage = { cols: number; rows: number; cells: Uint8Array; visited: number };

export function createCoverage(cols: number = COVERAGE.cols, rows: number = COVERAGE.rows): Coverage {
  return { cols, rows, cells: new Uint8Array(cols * rows), visited: 0 };
}

/** Frações 0–1 (y de cima para baixo) → índice da célula; fora da captura: null. */
export function cellOf(fx: number, fy: number, cols: number, rows: number): number | null {
  if (!(fx >= 0 && fx <= 1 && fy >= 0 && fy <= 1)) return null;
  const col = Math.min(cols - 1, Math.floor(fx * cols));
  const row = Math.min(rows - 1, Math.floor(fy * rows));
  return row * cols + col;
}

/**
 * Marca as células cujo centro está dentro da lente (centro em px da captura) e a célula sob o centro
 * da lente (D18). Devolve quantas células novas foram marcadas.
 */
export function visitCircle(cov: Coverage, cx: number, cy: number, radius: number, width: number, height: number): number {
  let added = 0;
  const mark = (index: number) => {
    if (cov.cells[index]) return;
    cov.cells[index] = 1;
    cov.visited += 1;
    added += 1;
  };
  const own = cellOf(cx / width, cy / height, cov.cols, cov.rows);
  if (own !== null) mark(own);
  const cellW = width / cov.cols;
  const cellH = height / cov.rows;
  for (let row = 0; row < cov.rows; row += 1) {
    for (let col = 0; col < cov.cols; col += 1) {
      if (Math.hypot((col + 0.5) * cellW - cx, (row + 0.5) * cellH - cy) <= radius) mark(row * cov.cols + col);
    }
  }
  return added;
}

export function coverageRatio(cov: Coverage): number {
  return cov.visited / (cov.cols * cov.rows);
}

export function isRevealed(cov: Coverage, goal: number = COVERAGE.goal): boolean {
  return coverageRatio(cov) >= goal;
}
