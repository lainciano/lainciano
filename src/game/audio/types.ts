import type { SurfaceMaterial } from "../world/surfaces";

/** Sons nomeados que o puzzle e os objetos pedem (`ActApi.sfx`); nome desconhecido não toca nada. */
export type GameSfxName = "knock" | "key" | "unlock" | "force";

/**
 * Superfície de áudio que as camadas e a sessão enxergam (contrato §3, completada na T13). Tudo procedural
 * (WebAudio, `game-audio.ts`): o dono, produtor, troca cada som por stems/gravações nos PONTOS DE TROCA marcados lá.
 * Mudo sem escolha de som no site, em modo leitura e antes do primeiro gesto do visitante.
 */
export type GameAudio = {
  /** Um passo sobre `surface`; `scale` (0..2) é o peso do passo (agachado leve, correndo forte). */
  step(surface: SurfaceMaterial, scale?: number): void;
  /** Ruído de objeto (`pick`, `drop`, `knock`) conforme o material. */
  object(material: SurfaceMaterial, kind: "pick" | "drop" | "knock"): void;
  /** Ambiência da sala (zumbido da lâmpada na calma; mais grave e presente na tensão). */
  room(level: "calm" | "tension"): void;
  /** Som nomeado do puzzle (`knock|key|unlock|force`). */
  sfx(name: string): void;
  /** Clique do botão da lanterna. */
  flashClick(): void;
  /** Tecla do celular afundou (`key:<nome>` do rig das mãos). */
  phoneKey(key: string): void;
  /** Papel sendo aberto no leitor. */
  paper(): void;
  /** Volume do jogo (0..1, `settings.volume`), aplicado ao vivo. */
  setVolume(volume: number): void;
  /** Aba escondida / jogo pausado. */
  suspend(): void;
  resume(): void;
  /** Solta nós e escutas (fim da sessão). Idempotente. */
  dispose(): void;
};

/** Áudio que não faz nada (testes, mundos sem som). */
export const silentAudio: GameAudio = {
  step() {},
  object() {},
  room() {},
  sfx() {},
  flashClick() {},
  phoneKey() {},
  paper() {},
  setVolume() {},
  suspend() {},
  resume() {},
  dispose() {},
};
