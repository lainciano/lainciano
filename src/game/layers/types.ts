import type * as THREE from "three";
import type { GameAudio } from "../audio/types";
import type { MaterialKit } from "../render/materials";
import type { LayerId, SaveV1 } from "../save/schema";
import type { SaveApi } from "../save/store";
import type { Box2 } from "../world/collision";
import type { PlaceGraph } from "../world/places";
import type { SurfaceMaterial, SurfaceZone } from "../world/surfaces";

/** `LayerId` vive no schema do save (uma só definição); reexportado aqui para quem fala de camadas. */
export type { LayerId };

/** O que uma camada devolve ao sair: só o que mudou, no formato que `SaveApi.patch` aceita. */
export type SavePatch = Partial<SaveV1>;

/** Fala/legenda. A T10 reexporta este tipo de `shell/subtitles.ts`. */
export type Line = { text: string; label?: string; kind?: "speech" | "sound" | "system" };

export type AssetRef = { key: string; url: string; bytes: number };

export type Manifest = {
  id: LayerId;
  textures: AssetRef[];
  models: AssetRef[];
  audio: AssetRef[];
  budget: { triangles: number; textureBytes: number };
};

/**
 * O que o motor entrega à camada. `kit` e `audio` são compartilhados e só morrem com o engine: a camada
 * descarta apenas o que ela mesma criou.
 */
export type GameCtx = {
  three: typeof THREE;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  kit: MaterialKit;
  audio: GameAudio;
  say(text: Line): void;
  save: SaveApi;
};

/**
 * O que um objeto pode fazer ao ser acionado. O spec não fixa este tipo; é o mínimo que os objetos da 1A
 * precisam (mexer no save, falar, tocar um som, abrir o exame). A T9 liga as implementações.
 */
export type ActApi = {
  save: SaveApi;
  say(text: Line): void;
  sfx(name: string): void;
  examine(o: { root: THREE.Object3D; distance: number; title: string; text: string }): void;
};

export type InteractiveObject = {
  id: string;
  place: string;
  roots: THREE.Object3D[];
  material: SurfaceMaterial;
  verb(state: SaveV1): string;
  enabled(state: SaveV1): boolean;
  hold?: { seconds: number; verb: string };
  act(api: ActApi): void;
};

export type LayerInstance = {
  places: PlaceGraph;
  colliders: Box2[];
  surfaces: SurfaceZone[];
  objects: InteractiveObject[];
  /** Aplica o estado salvo (portas abertas, itens pegos). */
  enter(save: SaveV1): void;
  update(dt: number, t: number): void;
  /** Devolve o que mudou nesta camada. */
  exit(): SavePatch;
  /** Descarta TUDO o que a camada criou (geometria, material, textura, render target extra, listener). */
  dispose(): void;
};

/**
 * Coletor de posse da carga (emenda aditiva ao contrato §3, Ruling 7). `own(recurso)` registra qualquer coisa
 * com `dispose()` e a devolve; `own.add(fn)` registra uma limpeza qualquer (listener, objectURL…).
 * O carregador drena em ordem reversa, cada item protegido: quando a carga falha ou é abortada (inclusive
 * `load` que ignora o sinal e só termina depois), e, no caminho feliz, depois do `instance.dispose()`.
 * Depois de drenado, um `own()` tardio (callback de TextureLoader, por exemplo) descarta na hora.
 */
export type Own = {
  <T extends { dispose(): void }>(resource: T): T;
  add(cleanup: () => void): void;
};

/**
 * Regras do `load` (emenda ao §3, Ruling 7):
 * - NUNCA toca `ctx.scene`: constrói um `Group` raiz privado; `instance.enter()` o anexa à cena e
 *   `instance.dispose()` o solta e descarta o que criou. Assim uma carga cancelada não deixa rastro na cena.
 * - Tudo o que cria (geometria, material, textura, render target, listener) passa por `own(...)`, para o
 *   carregador limpar se o `load` rejeitar ou for abortado; o que `kit` e `audio` entregam é compartilhado e
 *   NÃO entra em `own`.
 * - Pode parar cedo se `signal` abortar; se ignorar o sinal, o carregador descarta o resultado quando chegar.
 */
export type Layer = {
  id: LayerId;
  manifest: Manifest;
  load(ctx: GameCtx, signal: AbortSignal, own: Own): Promise<LayerInstance>;
};
