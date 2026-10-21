import { HOLD_SHAKE_FROM } from "../hold";

/**
 * Lógica pura do ato Gesto (segure para acender, spec Limiar 3.3): quem está segurando (ponteiro e teclas),
 * o degrau anunciado ao leitor de tela, a amplitude do tremor e o ponto de onde a íris nasce.
 */

type Origin = { x: number; y: number };

/** Entrada do segurar: o ponteiro capturado e as teclas de segurar pressionadas. */
export type HoldInput = { readonly pointer: boolean; readonly keys: readonly string[] };

export type HoldEvent =
  /** `repeat`: autorrepetição de uma tecla que já vinha apertada (ex.: o Enter que avançou o ato anterior). */
  | { type: "keydown"; key: string; repeat?: boolean }
  | { type: "keyup"; key: string }
  | { type: "pointerdown" }
  | { type: "pointerup" }
  /** O botão perdeu o foco: as teclas soltam (o keyup não chega mais nele). */
  | { type: "blur" }
  /** A janela perdeu o foco ou a aba sumiu: solta tudo. */
  | { type: "reset" };

export const IDLE_INPUT: HoldInput = { pointer: false, keys: [] };

/** Espaço e Enter seguram (no botão do anel). */
export function isHoldKey(key: string): boolean {
  return key === " " || key === "Enter";
}

export function reduceHoldInput(state: HoldInput, event: HoldEvent): HoldInput {
  switch (event.type) {
    case "keydown":
      // Segurar começa num keydown novo: autorrepetição só mantém o que já estava seguro.
      if (!isHoldKey(event.key) || event.repeat || state.keys.includes(event.key)) return state;
      return { ...state, keys: [...state.keys, event.key] };
    case "keyup":
      if (!state.keys.includes(event.key)) return state;
      return { ...state, keys: state.keys.filter((key) => key !== event.key) };
    case "pointerdown":
      return state.pointer ? state : { ...state, pointer: true };
    case "pointerup":
      return state.pointer ? { ...state, pointer: false } : state;
    case "blur":
      return state.keys.length ? { ...state, keys: [] } : state;
    case "reset":
      return state.pointer || state.keys.length ? IDLE_INPUT : state;
  }
}

export function isHolding(state: HoldInput): boolean {
  return state.pointer || state.keys.length > 0;
}

/** Progresso anunciado (`aria-valuenow`): degraus de 25%, arredondando para baixo (100 só quando acende). */
export function progressStep(progress: number): number {
  const p = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  return Math.floor(p * 4) * 25;
}

/** Tremor máximo (px) no fim da carga. */
export const SHAKE_MAX_PX = 3;

/** Amplitude do tremor: 0 antes de `HOLD_SHAKE_FROM` e com movimento reduzido; cresce até `SHAKE_MAX_PX`. */
export function shakeAmplitude(progress: number, reduced: boolean): number {
  if (reduced || progress < HOLD_SHAKE_FROM) return 0;
  const t = Math.min(1, (progress - HOLD_SHAKE_FROM) / (1 - HOLD_SHAKE_FROM));
  return SHAKE_MAX_PX * t;
}

/** Ponto de onde a íris nasce: onde o ponteiro segurou ou, pelo teclado, o centro do anel. */
export function holdOrigin(
  pointerPoint: Origin | null,
  ring: { left: number; top: number; width: number; height: number },
): Origin {
  return pointerPoint ?? { x: ring.left + ring.width / 2, y: ring.top + ring.height / 2 };
}
