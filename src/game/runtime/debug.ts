import type { SaveV1 } from "../save/schema";
import type { DebugInfo, Engine, PostMode } from "./engine";
import type { QualityLines } from "./quality";

/** Ruling 1: superconjunto do contrato §5. As tarefas seguintes estendem este objeto. */
export type CriptaDebug = {
  readonly layer: string;
  readonly place: string | null;
  readonly camera: { position: [number, number, number]; rotation: [number, number, number]; fov: number };
  readonly fps: { p50: number; p95: number };
  /** `renderer.info` do quadro (cena + pós) e o estado do runtime: qualidade, erros de quadro, perda. */
  readonly renderer: DebugInfo;
  readonly quality: QualityLines;
  readonly save: SaveV1;
  readonly lost: boolean;
  readonly errors: { count: number; last: string | null };
  setPostMode(m: PostMode): void;
  setQuality(q: QualityLines): void;
  /** Gancho de teste: um callback de quadro (ex.: um que lança, para provar que o loop segue e conta). */
  onFrame(fn: (dt: number, t: number) => void): () => void;
  /** Fotos em movimento: posiciona a câmera (metros; yaw/pitch em radianos, ordem YXZ). */
  setCamera(pose: CameraPose): void;
  /** Liga/desliga o tremor e muda a afinidade (teste de nado de textura). Só os campos passados mudam. */
  setPsx(o: { snap?: boolean; affine?: number }): void;
  /** Fotos de perto: mostra/esconde as mãos do jogador. */
  hands(visible: boolean): void;
  /**
   * Varredura de sombra (T8): muda `normalBias`/`bias`/`near` da luz principal da sala (`userData.mainLight`, padrão)
   * ou da lanterna (`light: "flash"`). Devolve os valores em vigor.
   */
  setShadow(o: { light?: "main" | "flash"; normalBias?: number; bias?: number; near?: number }): ShadowInfo | null;
  /** Fotos de contato: esconde/mostra um objeto interativo da camada pelo id. */
  setVisible(id: string, visible: boolean): void;
  /** Estado das mãos (guardada/sacada, lanterna, ociosa, celular). */
  readonly handsState: HandsDebugState | null;
  /** T9: mira, aviso, segurar, brilho, painéis e exame. `null` sem jogador. */
  readonly interact: InteractDebugState | null;
  /** T9: vira o olhar para o objeto (mesmo ponto do ciclo). Devolve se o objeto existe. */
  aimAt(id: string): boolean;
  /** Fotos das poses e testes: solta o `still`, liga/apaga, força ociosa, celular, e avança a animação. */
  handsDebug(o: HandsDebugInput): void;
};

export type InteractDebugState = {
  aimedId: string | null;
  /** Leitura crua do centro da tela: o objeto acertado e se está ao alcance. */
  target: { id: string; inReach: boolean } | null;
  holdId: string | null;
  holdProgress: number;
  glow: string | null;
  glowLevel: number;
  panel: boolean;
  lastCycled: string | null;
  /** Último aviso entregue à casca (null = escondido). */
  prompt: { text: string; key: "press" | "hold"; progress: number | null } | null;
  panels: number;
  mode: string;
  examine: { open: boolean; title: string; text: string; turn: number; tilt: number; distance: number; emissive: number; originalVisible: boolean | null };
  /** Filhos da câmera (mãos, exame): volta ao valor de antes ao fechar o exame. */
  cameraChildren: number;
};

export type HandsDebugState = { mode: string; flashOn: boolean; idle: string; holster: number; light: number; phone: string };
export type HandsDebugInput = {
  still?: boolean;
  toggle?: boolean;
  idle?: "regrip" | "sway" | "adjust";
  phone?: "open" | "close";
  press?: string;
  step?: number;
  view?: { hand: "right" | "left"; angle: "front" | "left" | "right" | "top" } | null;
  input?: Partial<{ moving: boolean; run: boolean; bob: number; crouch: boolean; panel: boolean; aiming: boolean }>;
};

export type ShadowInfo = { normalBias: number; bias: number; near: number };

/** Ganchos do jogador e da camada (T8): o `place` vivo e a câmera do controlador. */
export type DebugHooks = {
  place?(): string | null;
  setCamera?(pose: CameraPose): void;
  hands?(visible: boolean): void;
  objectVisible?(id: string, visible: boolean): void;
  handsState?(): HandsDebugState | null;
  handsDebug?(o: HandsDebugInput): void;
  interact?(): InteractDebugState | null;
  aimAt?(id: string): boolean;
};

export type CameraPose = { x: number; y: number; z: number; yaw: number; pitch: number };

declare global {
  interface Window {
    __cripta?: CriptaDebug;
  }
}

/** Cenas de referência para fotos e comparação visual (`?debug=1&shot=<nome>`), cada uma num chunk próprio. */
const SHOTS = {
  "psx-ref": () => import("../render/shots/psxRef").then((m) => m.buildPsxRef),
} satisfies Record<string, () => Promise<(engine: Engine) => () => void>>;

/**
 * Fotos de referência montadas sobre uma camada de verdade (T8): o shell carrega a camada, põe o jogador no
 * lugar pedido e prende o tempo. `?debug=1&shot=cinza-entrada`.
 */
const LAYER_SHOTS = {
  "cinza-entrada": { place: "entrada" },
} as const;

/** A foto de camada pedida em `?shot=` (só com o debug ligado) ou null. */
export function layerShot(search: string): { place: string } | null {
  if (!debugEnabled(search)) return null;
  const name = new URLSearchParams(search).get("shot");
  return name && Object.hasOwn(LAYER_SHOTS, name) ? LAYER_SHOTS[name as keyof typeof LAYER_SHOTS] : null;
}

/** `?shot=` pede uma cena de referência própria (psx-ref), que substitui a camada. */
export function standaloneShot(search: string): boolean {
  if (!debugEnabled(search)) return false;
  const name = new URLSearchParams(search).get("shot");
  return !!name && Object.hasOwn(SHOTS, name);
}

/** Só em dev ou com `?debug=1` na URL de quando o jogo abriu. */
export function debugEnabled(search: string): boolean {
  return process.env.NODE_ENV !== "production" || new URLSearchParams(search).get("debug") === "1";
}

/**
 * Expõe `window.__cripta` (leituras ao vivo por getters). Devolve a remoção; fora de dev/`?debug=1` não faz nada.
 * Depois da perda de contexto o objeto continua, com `lost: true`, até o jogo fechar.
 */
export function installDebug(engine: Engine, getLayer: () => string, getSave: () => SaveV1, hooks: DebugHooks = {}): () => void {
  if (!debugEnabled(window.location.search)) return () => {};
  const api: CriptaDebug = {
    get layer() {
      return getLayer();
    },
    get place() {
      return hooks.place ? hooks.place() : getSave().place;
    },
    get camera(): CriptaDebug["camera"] {
      const { position: p, rotation: r, fov } = engine.camera;
      return { position: [p.x, p.y, p.z], rotation: [r.x, r.y, r.z], fov };
    },
    get fps() {
      return engine.info().fps;
    },
    get renderer() {
      return engine.info();
    },
    get quality() {
      return engine.info().quality;
    },
    get save() {
      return getSave();
    },
    get lost() {
      return engine.info().lost;
    },
    get errors() {
      const { frameErrors, lastError } = engine.info();
      return { count: frameErrors, last: lastError };
    },
    setPostMode: (m) => engine.setPostMode(m),
    setQuality: (q) => engine.setQuality(q),
    onFrame: (fn) => engine.onFrame(fn),
    setCamera({ x, y, z, yaw, pitch }) {
      if (![x, y, z, yaw, pitch].every(Number.isFinite)) return;
      // Com jogador, a câmera é dele (senão o próximo quadro a devolveria ao lugar).
      if (hooks.setCamera) return hooks.setCamera({ x, y, z, yaw, pitch });
      engine.camera.position.set(x, y, z);
      engine.camera.rotation.set(pitch, yaw, 0, "YXZ");
      engine.camera.updateMatrixWorld();
    },
    setPsx({ snap, affine }) {
      if (snap !== undefined) engine.psx.uSnap.value = snap ? 1 : 0;
      if (affine !== undefined && Number.isFinite(affine)) engine.psx.uAff.value = Math.min(1, Math.max(0, affine));
    },
    hands: (visible) => hooks.hands?.(visible),
    setShadow({ light = "main", normalBias, bias, near }) {
      type Shadowed = { shadow: { normalBias: number; bias: number; camera: { near: number; updateProjectionMatrix(): void } } };
      let found: Shadowed | null = null;
      engine.scene.traverse((o) => {
        const match = light === "flash" ? o.name === "lanterna" : o.userData.mainLight === true;
        if (!found && match && "shadow" in o) found = o as unknown as Shadowed;
      });
      if (!found) return null;
      const { shadow } = found as Shadowed;
      if (normalBias !== undefined && Number.isFinite(normalBias)) shadow.normalBias = normalBias;
      if (bias !== undefined && Number.isFinite(bias)) shadow.bias = bias;
      if (near !== undefined && Number.isFinite(near) && near > 0) {
        shadow.camera.near = near;
        shadow.camera.updateProjectionMatrix();
      }
      return { normalBias: shadow.normalBias, bias: shadow.bias, near: shadow.camera.near };
    },
    setVisible: (id, visible) => hooks.objectVisible?.(id, visible),
    get handsState() {
      return hooks.handsState?.() ?? null;
    },
    handsDebug: (o) => hooks.handsDebug?.(o),
    get interact() {
      return hooks.interact?.() ?? null;
    },
    aimAt: (id) => hooks.aimAt?.(id) ?? false,
  };
  window.__cripta = api;
  return () => {
    if (window.__cripta === api) delete window.__cripta;
  };
}

/**
 * Monta a cena de referência pedida em `?shot=` (só com o debug ligado) antes do `engine.start()`, para o
 * `compileAsync` já pegar os materiais dela. Devolve a remoção (o que a cena criou fora do kit) ou null.
 */
export async function loadShot(engine: Engine, search: string, signal?: AbortSignal): Promise<(() => void) | null> {
  if (!debugEnabled(search)) return null;
  const name = new URLSearchParams(search).get("shot");
  if (!name) return null;
  if (!Object.hasOwn(SHOTS, name)) {
    if (!Object.hasOwn(LAYER_SHOTS, name)) console.warn(`[jogo] cena de referência desconhecida: ${name}`);
    return null;
  }
  const build = await SHOTS[name as keyof typeof SHOTS]();
  // O shell pode ter desmontado (e descartado o engine) enquanto o chunk chegava: não monta nada.
  if (signal?.aborted || engine.info().disposed) return null;
  return build(engine);
}
