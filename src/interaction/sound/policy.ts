export type SoundPref = "on" | "off";

export function parseSoundPref(raw: string | null): SoundPref | null {
  return raw === "on" || raw === "off" ? raw : null;
}

/** Som só com escolha explícita "on" e fora do modo leitura. */
export function shouldPlay(pref: SoundPref | null, reading: boolean): boolean {
  return pref === "on" && !reading;
}
