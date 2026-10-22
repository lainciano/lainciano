import { TIMING } from "./sequence";

/** A partir daqui a carga do segurar treme. */
export const HOLD_SHAKE_FROM = 0.8;

/** Avança a carga do segurar (0..1): sobe segurando, desce soltando. */
export function stepHold(progress: number, dtMs: number, holding: boolean): number {
  const next = holding
    ? progress + dtMs / TIMING.holdFillMs
    : progress - dtMs / TIMING.holdDrainMs;
  return Math.min(1, Math.max(0, next));
}
