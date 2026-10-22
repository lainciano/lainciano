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
};

declare global {
  interface Window {
    __cripta?: CriptaDebug;
  }
}

/** Só em dev ou com `?debug=1` na URL de quando o jogo abriu. */
export function debugEnabled(search: string): boolean {
  return process.env.NODE_ENV !== "production" || new URLSearchParams(search).get("debug") === "1";
}

/**
 * Expõe `window.__cripta` (leituras ao vivo por getters). Devolve a remoção; fora de dev/`?debug=1` não faz nada.
 * Depois da perda de contexto o objeto continua, com `lost: true`, até o jogo fechar.
 */
export function installDebug(engine: Engine, getLayer: () => string, getSave: () => SaveV1): () => void {
  if (!debugEnabled(window.location.search)) return () => {};
  const api: CriptaDebug = {
    get layer() {
      return getLayer();
    },
    get place() {
      return getSave().place;
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
  };
  window.__cripta = api;
  return () => {
    if (window.__cripta === api) delete window.__cripta;
  };
}
