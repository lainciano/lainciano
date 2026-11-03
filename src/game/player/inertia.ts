/**
 * Inércia da mão e da lanterna ao virar a câmera (lógica pura, sem three). A câmera mostra para onde se olha; a mão
 * e o feixe da lanterna chegam um pouco depois e passam levemente do ponto (estilo P.T./RE7).
 *
 * Mola amortecida por eixo (yaw e pitch), alimentada pela VELOCIDADE angular da câmera:
 *   θ'' = −ω²θ − 2ζωθ' − K·v
 * θ é o ângulo da mão em relação à câmera (oposto ao giro: virando para a esquerda, θ < 0 e a mão fica à direita da
 * tela). Parado v = 0 e θ volta a zero sozinho (ζ ≈ 0,6: leve overshoot, assenta em ~0,5 s). A amplitude sai
 * proporcional à velocidade e é suavizada por `tanh` até o máximo (a mão nunca descola do quadro nem deforma).
 *
 * Integração semi-implícita com subpassos de no máximo 1/120 s: estável, sem acumular energia e quase independente
 * da taxa de quadros (o impulso de um quadro é K·v·dt = K·Δângulo). dt não finito, ≤ 0 ou grande é ignorado.
 * Não aloca.
 */
export const INERTIA = {
  /** Frequência natural (rad/s) e razão de amortecimento (< 1: um leve overshoot). */
  omega: 15,
  zeta: 0.6,
  /** Teto da velocidade angular de entrada (rad/s): picos do mouse com travamento e arraste de toque. */
  maxRate: 9,
  /** Atraso em regime (rad) por rad/s de giro: yaw 2°/(rad/s), pitch 1,4°/(rad/s). */
  yawGain: 0.035,
  pitchGain: 0.025,
  /** Amplitude máxima (rad): 7° no yaw e 5° no pitch. */
  yawMax: 0.122,
  pitchMax: 0.087,
  /** Correndo a amplitude cresce até este fator. */
  runBoost: 1.3,
  /** Passo máximo de integração e dt acima do qual o quadro é ignorado (aba escondida, travada). */
  sub: 1 / 120,
  maxDt: 0.25,
} as const;

const finite = (v: number) => (Number.isFinite(v) ? v : 0);
const limit = (v: number, max: number) => Math.min(max, Math.max(-max, v));

export function createInertia() {
  const K = INERTIA.omega * INERTIA.omega;
  const C = 2 * INERTIA.zeta * INERTIA.omega;
  let yaw = 0;
  let yawV = 0;
  let pitch = 0;
  let pitchV = 0;
  return {
    /** Avança `dt` com a câmera girando a `yawRate`/`pitchRate` (rad/s, mesmo sinal dos ângulos da câmera). */
    step(dt: number, yawRate: number, pitchRate: number) {
      if (!Number.isFinite(dt) || dt <= 0 || dt > INERTIA.maxDt) return;
      const fy = -K * INERTIA.yawGain * limit(finite(yawRate), INERTIA.maxRate);
      const fp = -K * INERTIA.pitchGain * limit(finite(pitchRate), INERTIA.maxRate);
      const n = Math.ceil(dt / INERTIA.sub - 1e-9);
      const h = dt / n;
      for (let i = 0; i < n; i++) {
        yawV += (-K * yaw - C * yawV + fy) * h;
        yaw += yawV * h;
        pitchV += (-K * pitch - C * pitchV + fp) * h;
        pitch += pitchV * h;
      }
    },
    /** Ângulo da mão em relação à câmera (rad), já com o teto suave. */
    get yaw() {
      return INERTIA.yawMax * Math.tanh(yaw / INERTIA.yawMax);
    },
    get pitch() {
      return INERTIA.pitchMax * Math.tanh(pitch / INERTIA.pitchMax);
    },
    reset() {
      yaw = yawV = pitch = pitchV = 0;
    },
  };
}

export type Inertia = ReturnType<typeof createInertia>;
