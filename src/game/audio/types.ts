import type { SurfaceMaterial } from "../world/surfaces";

/**
 * Superfície de áudio que as camadas enxergam (contrato §3). Mínima de propósito: a T13 implementa
 * (`createGameAudio`), e o que a camada pode pedir cresce lá, nunca aqui sem a implementação.
 */
export type GameAudio = {
  /** Um passo sobre `surface`. */
  step(surface: SurfaceMaterial): void;
  /** Ruído de objeto (`pick`, `drop`, `knock`) conforme o material. */
  object(material: SurfaceMaterial, kind: "pick" | "drop" | "knock"): void;
  /** Ambiência da sala. */
  room(level: "calm" | "tension"): void;
  /** Aba escondida / jogo pausado. */
  suspend(): void;
  resume(): void;
};
