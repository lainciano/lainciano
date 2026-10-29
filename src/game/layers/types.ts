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

/**
 * Documento lido em dois níveis (T10, bíblia 12b): o nível 1 é a imagem do papel pintada em código (letra à mão,
 * pontilhado) e o nível 2 é o texto limpo (`text`), que também é o que o leitor de tela recebe.
 */
export type Doc = {
  id: string;
  title: string;
  /** Texto limpo. Linhas separadas por `\n`; uma linha vazia é um respiro entre parágrafos. */
  text: string;
  /** Aspecto do papel (nível 1). Tudo opcional: o padrão é uma folha de caderno dobrada. */
  look?: DocLook;
};

export type DocLook = {
  /** Cor do papel (CSS). */
  tone?: string;
  /** Cor da tinta (CSS). */
  ink?: string;
  /** Semente das manchas e do tremor da letra: o mesmo papel a cada abertura. */
  seed?: number;
  /** Dobras horizontais (0 = papel liso). */
  folds?: number;
  /** Pauta de caderno e margem vermelha. */
  ruled?: boolean;
  /** Assinatura à mão no fim, se houver. */
  signature?: string;
};

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
  /** Abre o documento no leitor de dois níveis (T10): o bilhete, a carta, o livro. */
  read(doc: Doc): void;
};

/** O segurar de um objeto: quanto tempo e o verbo do aviso ("forçar a porta"). */
export type HoldSpec = { seconds: number; verb: string };

export type InteractiveObject = {
  id: string;
  place: string;
  roots: THREE.Object3D[];
  material: SurfaceMaterial;
  verb(state: SaveV1): string;
  enabled(state: SaveV1): boolean;
  /**
   * Objeto de segurar. Função do estado do save (T12: E na porta usa a chave; "forçar" só depois da 3ª pista):
   * devolver `undefined` quer dizer "agora não é de segurar", e o toque rápido age. O literal `{ seconds, verb }`
   * continua valendo (sempre de segurar). Leia sempre por `holdFor(objeto, save)` (interaction/hold.ts).
   */
  hold?: HoldSpec | ((state: SaveV1) => HoldSpec | undefined);
  /**
   * Objeto que o encobre (emenda 1A/T9): enquanto o objeto com este id estiver habilitado e visível, este não entra
   * no ciclo de alvos (a carta sob o celular). A mira por raio já não o alcança: o outro o tapa.
   */
  hiddenBy?: string;
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
