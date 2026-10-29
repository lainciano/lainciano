/**
 * Segurar (E ou clique): o gesto só conta se durar. Soltar antes de `HOLD_MIN` é "curto demais" (o jogo diz como
 * fazer); soltar depois, sem completar, deixa o anel recuar ao dobro da velocidade (o protótipo 7). Completar
 * dispara UMA vez, no `update`. Lógica pura: o tempo só anda por `update(dt)`.
 */
import type { HoldSpec, InteractiveObject } from "../layers/types";
import type { SaveV1 } from "../save/schema";

export const HOLD_MIN = 0.22;

/** O segurar do objeto no estado atual (literal ou função do save), ou `undefined` se agora não é de segurar. */
export function holdFor(o: InteractiveObject, state: SaveV1): HoldSpec | undefined {
  return typeof o.hold === "function" ? o.hold(state) : o.hold;
}
/** O anel recua a esta vezes a velocidade com que subia. */
const DECAY = 2;

export type HoldResult = { progress: number; done: boolean };
export type HoldRelease = { done: boolean; tooShort: boolean };

export type Hold = {
  press(): void;
  /** `done`: o aperto já tinha completado (o ato saiu pelo `update`). `tooShort`: soltou antes de 0,22 s. */
  release(): HoldRelease;
  update(dt: number): HoldResult;
  /** Alvo perdido ou painel aberto: zera sem acusar "curto". */
  cancel(): void;
  readonly pressed: boolean;
  readonly progress: number;
};

export function createHold(seconds: number): Hold {
  const total = Math.max(seconds, 1e-6);
  let held = 0;
  let pressed = false;
  let finished = false;
  return {
    press() {
      pressed = true;
      finished = false;
      held = 0;
    },
    release() {
      const wasPressed = pressed;
      pressed = false;
      if (!wasPressed) return { done: false, tooShort: false };
      if (finished) {
        finished = false;
        held = 0;
        return { done: true, tooShort: false };
      }
      return { done: false, tooShort: held < HOLD_MIN };
    },
    update(dt) {
      if (pressed && !finished) {
        held = Math.min(total, held + Math.max(0, dt));
        if (held >= total) {
          finished = true;
          return { progress: 1, done: true };
        }
      } else if (!pressed) {
        held = Math.max(0, held - Math.max(0, dt) * DECAY);
      }
      return { progress: held / total, done: false };
    },
    cancel() {
      pressed = false;
      finished = false;
      held = 0;
    },
    get pressed() {
      return pressed;
    },
    get progress() {
      return held / total;
    },
  };
}
