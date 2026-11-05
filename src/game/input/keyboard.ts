import type { Action, InputMode } from "./actions";

/**
 * Peças do teclado tiradas de `adapters.ts`: o que é campo de texto ou botão, o giro contínuo do olhar com as setas
 * (`createKeyTurn`) e o Esc preso em tela cheia (`bindEscapeLock`).
 */

/** Pixels de mouse equivalentes por segundo ao girar com as setas (≈ 1,9 rad/s com a sensibilidade 1). */
const TURN_PX_PER_S = 1.9 / 0.0022;

/** Elemento do DOM (falso fora do navegador: os testes rodam sobre EventTarget). */
const isElement = (el: EventTarget | null): el is HTMLElement => typeof HTMLElement !== "undefined" && el instanceof HTMLElement;
export const isTextField = (el: EventTarget | null) =>
  isElement(el) && (el.isContentEditable || el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement);
export const isControl = (el: EventTarget | null) => isElement(el) && !!el.closest("button, a[href], [role='button'], summary");

export type KeyTurn = {
  /** A tecla de giro foi apertada (andando): o olhar gira a cada quadro até soltar. */
  press(code: string, turn: { yaw: number; pitch: number }): void;
  /** A tecla soltou: `true` se ela estava girando. */
  release(code: string): boolean;
  /** Solta tudo (perdeu o foco, abriu painel). */
  clear(): void;
  dispose(): void;
};

export function createKeyTurn(win: Window, mode: () => InputMode, onAction: (a: Action) => void): KeyTurn {
  const held = new Map<string, { yaw: number; pitch: number }>();
  let raf = 0;
  let last = 0;
  const loop = (now: number) => {
    raf = 0;
    if (held.size === 0 || mode() !== "walk") return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    let yaw = 0;
    let pitch = 0;
    for (const v of held.values()) {
      yaw += v.yaw;
      pitch += v.pitch;
    }
    if (dt > 0) onAction({ type: "look", dx: -yaw * TURN_PX_PER_S * dt, dy: -pitch * TURN_PX_PER_S * dt * 0.6 });
    raf = win.requestAnimationFrame(loop);
  };
  return {
    press(code, turn) {
      if (held.has(code)) return;
      held.set(code, turn);
      last = 0;
      if (!raf) raf = win.requestAnimationFrame(loop);
    },
    release: (code) => held.delete(code),
    clear: () => held.clear(),
    dispose() {
      if (raf) win.cancelAnimationFrame(raf);
    },
  };
}

type KeyboardLock = { lock?(keys?: string[]): Promise<void>; unlock?(): void };

/** Tela cheia prende o Esc (`navigator.keyboard.lock`) enquanto dura; solta ao sair. Devolve o `unlock` final. */
export function bindEscapeLock(win: Window, doc: Document, on: (el: EventTarget, type: string, fn: () => void) => void): () => void {
  const keyboard = (win.navigator as Navigator & { keyboard?: KeyboardLock }).keyboard;
  const sync = () => {
    try {
      if (doc.fullscreenElement) void keyboard?.lock?.(["Escape"])?.catch(() => {});
      else keyboard?.unlock?.();
    } catch {
      /* sem Keyboard Lock: o Esc segue do navegador */
    }
  };
  on(doc, "fullscreenchange", sync);
  sync();
  return () => {
    try {
      keyboard?.unlock?.();
    } catch {
      /* nada a soltar */
    }
  };
}
