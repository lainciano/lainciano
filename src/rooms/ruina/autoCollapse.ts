import { RUINA } from "./physics";

/**
 * Depois que o Portal fecha, o nome fica parado por um instante antes de desabar: a queda e o estrondo
 * grave não podem competir com o sino (que dura ~4 s) nem acontecer escondidos atrás da porta.
 */
export const AFTER_PORTAL_MS = 1400;

export type AutoCollapseAction = "none" | "schedule" | "wait-portal";

/** O que fazer quando a arena está ≥ 60% visível: cair já (com o atraso padrão), esperar o Portal ou nada. */
export function autoCollapseAction({ ratio, portalOpen }: { ratio: number; portalOpen: boolean }): AutoCollapseAction {
  if (ratio < RUINA.collapseRatio) return "none";
  return portalOpen ? "wait-portal" : "schedule";
}
