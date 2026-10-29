import type { Settings } from "../save/schema";

/**
 * Aplica os ajustes do celular na hora, mas só o que mudou (revisão I1): trocar o balanço não pode refazer a
 * qualidade (em "auto" isso voltaria ao degrau caro e jogaria fora a descida do FpsGuard), nem mexer no FOV.
 * O jogador recebe sempre os ajustes inteiros (balanço e sensibilidade são baratos).
 */
export type SettingsTarget = {
  fov(v: number): void;
  quality(q: Settings["quality"]): void;
  /** Volume do jogo (0..1): barato, mas só quando muda (o nó de ganho recebe um alvo novo). */
  volume(v: number): void;
  player(s: Settings): void;
};

export function createSettingsApplier(target: SettingsTarget, initial: Settings): (s: Settings) => void {
  let last = initial;
  return (s) => {
    if (s.fov !== last.fov) target.fov(s.fov);
    if (s.quality !== last.quality) target.quality(s.quality);
    if (s.volume !== last.volume) target.volume(s.volume);
    target.player(s);
    last = s;
  };
}
