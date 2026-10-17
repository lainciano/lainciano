/** Volume do usuário (0–1), escolhido já no Portal e lembrado entre visitas. */
export const DEFAULT_VOLUME = 0.8;

export function parseVolume(raw: string | null): number {
  if (raw === null || raw.trim() === "") return DEFAULT_VOLUME;
  const value = Number(raw);
  if (!Number.isFinite(value)) return DEFAULT_VOLUME;
  return Math.min(1, Math.max(0, value));
}

/** Curva perceptual (quadrática): o controle é linear, o ganho não — o ouvido é logarítmico. O padrão (0,8) dá ≈ 0,64, o ganho que o site já tinha. */
export function volumeToGain(volume: number): number {
  const v = Math.min(1, Math.max(0, volume));
  return v * v;
}

export function volumeToPercent(volume: number): number {
  return Math.round(Math.min(1, Math.max(0, volume)) * 100);
}
