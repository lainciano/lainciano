export type ReadingPref = "on" | "off" | "auto";

export function parseReadingPref(raw: string | null): ReadingPref {
  return raw === "on" || raw === "off" ? raw : "auto";
}

/** Preferência explícita vence; sem ela, segue prefers-reduced-motion. */
export function resolveReading(pref: ReadingPref, reducedMotion: boolean): boolean {
  return pref === "on" || (pref === "auto" && reducedMotion);
}
