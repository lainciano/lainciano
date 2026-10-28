/**
 * Escolha do alvo mirado com histerese (lógica pura): a leitura do centro da tela chega a cada 100 ms e o alvo só
 * muda depois de `AIM_READS` leituras seguidas iguais. Assim a mão não sobe e desce na borda de um objeto nem
 * alterna entre dois vizinhos a cada leitura.
 */
export const AIM_READS = 3;

export type AimState = { current: string | null; candidate: string | null; count: number };

export const createAim = (): AimState => ({ current: null, candidate: null, count: 0 });

export function stepAim(s: AimState, seen: string | null, reads = AIM_READS): AimState {
  if (seen === s.current) return { current: s.current, candidate: null, count: 0 };
  const count = seen === s.candidate ? s.count + 1 : 1;
  if (count >= reads) return { current: seen, candidate: null, count: 0 };
  return { current: s.current, candidate: seen, count };
}
