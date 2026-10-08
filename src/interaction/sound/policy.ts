export type SoundPref = "on" | "off";

export function parseSoundPref(raw: string | null): SoundPref | null {
  return raw === "on" || raw === "off" ? raw : null;
}

/** Som só com escolha explícita "on", fora do modo leitura e depois do primeiro gesto do visitante. */
export function shouldPlay(pref: SoundPref | null, reading: boolean, unlocked: boolean): boolean {
  return pref === "on" && !reading && unlocked;
}
