/** Números do protótipo (salas.html, gravura()). O teste confere que `points` = ENGRAVING_TRAIL_POINTS. */
export const INK = {
  points: 24,
  hoverStrength: 0.32,
  holdStartForce: 0.3,
  holdForceStep: 0.035,
  holdMaxForce: 1.5,
  decayFree: 0.962,
  decayHolding: 0.992,
  epsilon: 0.002,
  jitter: 0.02,
  holdRelicMs: 1400,
  keyboardPoint: [0.5, 0.55] as const,
  frameMs: 1000 / 60,
  /**
   * Escorrer ao soltar (decisão do dono, 8 out 2026; spec 7.3 "ao soltar, o sangue escorre"):
   * cada ponto desce `drip × força` em UV por quadro de 60 Hz, enquanto desvanece. Valor novo, não é
   * do protótipo: ajustar olhando a gravura, não de ouvido.
   */
  drip: 0.004,
} as const;

/** "Rasgo" ao mover rápido sobre o retrato: velocidade do ponteiro em px/ms, no máx. 8 por segundo. */
export const TEAR = { minSpeed: 1.2, fullSpeed: 4, maxPerSecond: 8 } as const;

export type InkState = {
  /** Anel de 24 pontos (x, y, força) no espaço UV. */
  trail: Float32Array;
  /** 1 = ponto de sangue derramado segurando (escorre ao soltar); 0 = corte de passagem (fica estático). */
  blood: Uint8Array;
  next: number;
  holding: boolean;
  force: number;
  holdStartedAt: number;
  last: [number, number];
  inside: boolean;
};

export type InkStep = { active: boolean; holdProgress: number };

export function createInk(): InkState {
  const trail = new Float32Array(INK.points * 3);
  for (let i = 0; i < INK.points; i += 1) {
    trail[i * 3] = -1;
    trail[i * 3 + 1] = -1;
  }
  return { trail, blood: new Uint8Array(INK.points), next: 0, holding: false, force: 0, holdStartedAt: 0, last: [0.5, 0.5], inside: false };
}

export function pushInk(state: InkState, x: number, y: number, strength: number, blood = false) {
  const i = state.next * 3;
  state.blood[state.next] = blood ? 1 : 0;
  state.trail[i] = x;
  state.trail[i + 1] = y;
  state.trail[i + 2] = strength;
  state.next = (state.next + 1) % INK.points;
}

/** Mouse passando: corta as linhas (ponto fraco); segurando, só move o alvo da tinta. */
export function hoverInk(state: InkState, x: number, y: number) {
  state.last = [x, y];
  state.inside = true;
  if (!state.holding) pushInk(state, x, y, INK.hoverStrength);
}

export function beginHold(state: InkState, x: number, y: number, now: number) {
  state.last = [x, y];
  state.holding = true;
  state.holdStartedAt = now;
  state.force = INK.holdStartForce;
}

/** Solta; devolve true se havia algo segurado (para zerar o anel de carga). */
export function endHold(state: InkState): boolean {
  const was = state.holding;
  state.holding = false;
  return was;
}

/** Um quadro: segurando, a força cresce e derrama no alvo; todo ponto decai (0,962 solto, 0,992 segurando); solto, escorre. */
export function stepInk(state: InkState, now: number, deltaMs: number, random: () => number = Math.random): InkStep {
  const frames = Math.max(0, deltaMs) / INK.frameMs;
  let active = false;
  let holdProgress = 0;
  if (state.holding) {
    state.force = Math.min(state.force + INK.holdForceStep * frames, INK.holdMaxForce);
    pushInk(
      state,
      state.last[0] + (random() - 0.5) * INK.jitter,
      state.last[1] + (random() - 0.5) * INK.jitter,
      state.force,
      true,
    );
    holdProgress = Math.min((now - state.holdStartedAt) / INK.holdRelicMs, 1);
    active = true;
  }
  const decay = (state.holding ? INK.decayHolding : INK.decayFree) ** frames;
  for (let i = 2; i < state.trail.length; i += 3) {
    if (state.trail[i] > INK.epsilon) {
      if (!state.holding && state.blood[(i - 2) / 3]) state.trail[i - 1] -= INK.drip * state.trail[i] * frames;
      state.trail[i] *= decay;
      active = true;
    } else {
      state.trail[i] = 0;
    }
  }
  return { active, holdProgress };
}

/** Volume do rasgo: 0 devagar; de 0,1 no limiar a 1 na velocidade cheia. */
export function tearGain(speed: number): number {
  if (speed < TEAR.minSpeed) return 0;
  const t = (speed - TEAR.minSpeed) / (TEAR.fullSpeed - TEAR.minSpeed);
  return Math.min(1, 0.1 + 0.9 * t);
}
