/** Ambiência de cada área: Ruína (Home), Gravura (Sobre), vela (Projetos e cases), biblioteca (Blog) e terminal (Contato). */
export type AmbienceName = "ruina" | "gravura" | "vela" | "biblioteca" | "terminal";

/** Crossfade entre ambiências (spec 8.2). */
export const AMBIENCE_FADE_S = 1.2;

export type AmbiencePlan = { stop: AmbienceName | null; start: AmbienceName | null };

/** O que parar e o que começar, dado o que toca, o que a sala pede e se o som pode tocar. */
export function resolveAmbience(
  playing: AmbienceName | null,
  requested: AmbienceName | null,
  allowed: boolean,
): AmbiencePlan {
  const target = allowed ? requested : null;
  if (playing === target) return { stop: null, start: null };
  return { stop: playing, start: target };
}

/** Volume mínimo de uma ambiência quando a área dela sai da tela: baixa, mas não some de repente. */
export const AMBIENCE_FLOOR = 0.3;

/** Volume (0–1) pela fração visível da área: sobe e desce com o scroll entre as áreas. */
export function ambienceLevel(visibleRatio: number): number {
  const ratio = Math.min(1, Math.max(0, visibleRatio));
  return AMBIENCE_FLOOR + (1 - AMBIENCE_FLOOR) * ratio;
}
