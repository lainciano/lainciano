/**
 * Contrato das cenas WebGL das salas. Este arquivo NÃO importa three: as ilhas e os hooks usam só
 * estes tipos, e o módulo que cria a cena (com three) entra por import() dinâmico.
 */
export type WebGLScene = {
  /** Desenha um quadro. true = ainda há animação; false = o loop dorme até wake(). */
  frame(nowMs: number, deltaMs: number): boolean;
  /** Tamanho CSS da camada e DPR já limitado. */
  resize(width: number, height: number, dpr: number): void;
  dispose(): void;
};

export type WebGLSceneContext = {
  canvas: HTMLCanvasElement;
  /** Camada que contém o canvas (recebe os listeners de ponteiro e teclado da sala). */
  host: HTMLElement;
  dpr: number;
  coarse: boolean;
  /** Reacorda o loop depois de uma interação. */
  wake: () => void;
};

/** Spec 9.3: no máximo 2 contextos WebGL vivos no site. */
export const MAX_WEBGL_CONTEXTS = 2;

/** Spec 6.5/9.3: DPR máx. 2 no desktop e 1,5 no toque. */
export function capDpr(devicePixelRatio: number, coarse: boolean): number {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.min(dpr, coarse ? 1.5 : 2);
}

export function createContextBudget(max: number) {
  let live = 0;
  return {
    acquire(): boolean {
      if (live >= max) return false;
      live += 1;
      return true;
    },
    release() {
      live = Math.max(0, live - 1);
    },
    live: () => live,
  };
}

/** Orçamento global de contextos (uma instância por aba). */
export const webglBudget = createContextBudget(MAX_WEBGL_CONTEXTS);

/** Spec 10: abaixo de ~45 fps sustentados, a sala cai para menos resolução (uma vez). */
export function createFpsGuard(thresholdMs = 22, frames = 90) {
  let average = 1000 / 60;
  let streak = 0;
  let fired = false;
  return {
    sample(deltaMs: number): boolean {
      if (fired || deltaMs > 250) return false; // aba em segundo plano / retomada
      average += (deltaMs - average) * 0.1;
      streak = average > thresholdMs ? streak + 1 : 0;
      if (streak < frames) return false;
      fired = true;
      return true;
    },
  };
}
