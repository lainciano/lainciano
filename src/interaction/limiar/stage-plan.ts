/** Lógica pura do palco do Limiar (transições e grão), sem DOM nem GSAP: testada em `stage-plan.test.ts`. */

type Point = { x: number; y: number };

/** Quadros por segundo do grão de filme (spec Limiar 5: ~12 fps). */
export const GRAIN_FPS = 12;

/** Permutação de 0..count-1 (Fisher-Yates com o gerador dado). */
export function shuffledOrder(count: number, random: () => number): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

export type Slice = {
  index: number; // posição vertical (de cima para baixo)
  order: number; // vez de entrar
  side: -1 | 1; // de onde entra: -1 esquerda, 1 direita (sai pelo lado oposto)
  tone: "sangue" | "linha";
};

/**
 * Fatias da transição que sai das Inscrições: 8 a 12 faixas, cores alternadas por posição, entrando em ordem
 * aleatória e de lados alternados nessa ordem.
 */
export function slicePlan(random: () => number): Slice[] {
  const count = 8 + Math.min(4, Math.floor(random() * 5));
  const order = shuffledOrder(count, random);
  return order.map((turn, index) => ({
    index,
    order: turn,
    side: turn % 2 === 0 ? -1 : 1,
    tone: index % 2 === 0 ? "sangue" : "linha",
  }));
}

/** Raio que um círculo nascido em `origin` precisa para cobrir a tela inteira (até o canto mais longe). */
export function irisRadius(origin: Point, width: number, height: number): number {
  const dx = Math.max(origin.x, width - origin.x);
  const dy = Math.max(origin.y, height - origin.y);
  return Math.ceil(Math.hypot(dx, dy)) + 1;
}

/**
 * Acumulador de um loop de quadro fixo sobre o ticker: soma o delta e avisa quando um quadro venceu. Um salto
 * grande (aba que volta) desenha uma vez só, sem fila de atraso.
 */
export function stepAccumulator(acc: number, deltaMs: number, intervalMs: number): { acc: number; due: boolean } {
  const next = acc + Math.max(0, deltaMs);
  if (next < intervalMs) return { acc: next, due: false };
  return { acc: next % intervalMs, due: true };
}
