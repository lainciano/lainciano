/** Salas com ambiência nesta fase; as Fases 3–5 acrescentam vela, terminal e biblioteca. */
export type AmbienceName = "ruina" | "gravura";

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
