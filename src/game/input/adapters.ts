import { isPanel, type Action, type InputMode } from "./actions";
import { bindEscapeLock, createKeyTurn, isControl, isTextField } from "./keyboard";
import { isBrowserChord, keyToAction, TURN_KEYS } from "./keymap";
import { createPointerLock } from "./pointerLock";
import { createTouchGestures, type TouchHooks } from "./touchGestures";

/**
 * Adaptadores de entrada (contrato §3): teclado, mouse travado e toque viram as mesmas `Action`.
 * - Teclado: `keyToAction` por `code`; o adaptador guarda o que está segurado (soma o `move`, solta tudo quando a
 *   janela perde o foco ou um painel abre). Enter e espaço num botão ficam com o botão; nada é lido em campos de
 *   texto; atalhos com Ctrl, ⌘ ou Alt são do navegador (nem ação, nem `preventDefault`). Giro com as setas e Esc
 *   preso em tela cheia: `keyboard.ts`.
 * - Mouse (ponteiro fino): o clique na cena trava o ponteiro (`requestPointerLock`); travado, mover olha, o botão
 *   esquerdo é `interact` e o direito, num painel, é `back`. Cada clique tenta travar de novo; só depois de 3
 *   falhas seguidas (ou de uma falha sem nunca ter travado) arrastar também olha, e o "pausado" sai da tela
 *   (`onPause(false)`). Perder o travamento sem pedir (Esc do navegador) chama `onPause(true)`.
 *   Abrir um painel com o mouse travado solta o mouse e lembra; fechar (E, ⌫, L ou botão direito) trava de novo no
 *   MESMO gesto (bíblia 12b.5). Painel fechado ou aberto fora de uma entrada (clique na lista; um segurar que
 *   completa no quadro): o shell chama `panelClosed()`/`panelOpened()` no próprio gesto. Toda entrada ressincroniza
 *   o modo: um "travar de novo" pendente não sobrevive a uma troca de modo que o adaptador não viu.
 * - Exame: arrastar com o botão esquerdo (ou o dedo) vira `rotate` em pixels, a roda vira `zoom` (sem rolar a
 *   página) e as setas/+/− repetem enquanto seguradas (ver keymap).
 * - Toque (tocar, correr, segurar, pinça, dedo fantasma): `touchGestures.ts`.
 */

export type BindOptions = TouchHooks & {
  coarse: boolean;
  /** Modo atual (quem manda é o shell). Sem ele, tudo é `walk`. */
  mode?: () => InputMode;
  /** Travamento do mouse perdido sem pedir (`true`) ou retomado (`false`). */
  onPause?: (paused: boolean) => void;
};

export { HOLD_SLOP, PINCH_STEP } from "./touchGestures";

/** Chamar a binding desliga tudo (como antes); `panelClosed` é o aviso do shell de que fechou um painel por fora. */
export type InputBinding = {
  (): void;
  dispose(): void;
  /** O shell fechou um painel fora do adaptador (clique/Enter num botão da lista): trava de novo se estava travado. */
  panelClosed(): void;
  /** O jogo abriu um painel fora de uma entrada (um segurar que completou no quadro): solta o mouse e lembra. */
  panelOpened(): void;
};

export function bindInput(target: HTMLElement, onAction: (a: Action) => void, opts: BindOptions): InputBinding {
  const mode = opts.mode ?? (() => "walk" as InputMode);
  const doc = target.ownerDocument;
  const win = doc.defaultView ?? window;
  const listeners: (() => void)[] = [];
  const on = <K extends string>(el: EventTarget, type: K, fn: (e: Event) => void, o?: AddEventListenerOptions) => {
    el.addEventListener(type, fn, o);
    listeners.push(() => el.removeEventListener(type, fn, o));
  };

  /* ------------------------------------------------ estado segurado */
  const heldMove = new Map<string, { x: number; z: number }>();
  let held = { run: false, crouch: false, peek: 0 as -1 | 0 | 1, interact: false };
  let lastMode: InputMode = mode();
  const turning = createKeyTurn(win, mode, onAction);

  const emitMove = () => {
    let x = 0;
    let z = 0;
    for (const v of heldMove.values()) {
      x += v.x;
      z += v.z;
    }
    onAction({ type: "move", x: Math.max(-1, Math.min(1, x)), z: Math.max(-1, Math.min(1, z)) });
  };

  /** Solta tudo o que estava segurado (perdeu o foco, abriu painel). */
  const releaseAll = () => {
    if (heldMove.size) {
      heldMove.clear();
      emitMove();
    }
    turning.clear();
    if (held.run) onAction({ type: "run", on: false });
    if (held.peek !== 0) onAction({ type: "peek", dir: 0 });
    if (held.crouch) onAction({ type: "crouch", on: false });
    if (held.interact) onAction({ type: "interact", down: false });
    held = { run: false, crouch: false, peek: 0, interact: false };
    gestures.reset();
  };

  /* ------------------------------------------------ gestos do ponteiro solto (declarado antes: releaseAll limpa) */
  const gestures = createTouchGestures({ target, coarse: opts.coarse, mode, onAction, onTap: opts.onTap, onHoldStart: opts.onHoldStart, onHoldMove: opts.onHoldMove, onHoldEnd: opts.onHoldEnd });

  /* ------------------------------------------------ ponteiro travado */
  let relock = false;
  const lock = createPointerLock({ target, doc, coarse: opts.coarse, walking: () => mode() === "walk", onPause: opts.onPause, onGrab: () => gestures.drop(), onLost: () => releaseAll(), on });

  /** Depois de cada ação: abrir painel solta o mouse (e lembra), fechar trava de novo no mesmo gesto. */
  const afterAction = (closingGesture: boolean) => {
    const now = mode();
    if (now === lastMode) return;
    const was = lastMode;
    lastMode = now;
    if (!isPanel(was) && isPanel(now)) {
      releaseAll();
      if (lock.locked()) {
        relock = true;
        lock.release();
      }
    } else if (isPanel(was) && !isPanel(now)) {
      if (relock && closingGesture) lock.request(true);
      relock = false;
    }
  };

  /** O modo mudou sem o adaptador ver (o shell fechou algo): alinha e esquece um "travar de novo" velho. */
  const sync = () => {
    const now = mode();
    if (now === lastMode) return;
    if (isPanel(lastMode) && !isPanel(now)) relock = false;
    if (!isPanel(lastMode) && isPanel(now)) releaseAll();
    lastMode = now;
  };

  const dispatch = (a: Action, closingGesture = false) => {
    sync();
    onAction(a);
    afterAction(closingGesture);
  };

  /* ------------------------------------------------ teclado */
  on(win, "keydown", (ev) => {
    const e = ev as KeyboardEvent;
    if (isBrowserChord(e)) return;
    if (isTextField(e.target)) return;
    sync();
    if (isControl(e.target) && (e.code === "Enter" || e.code === "NumpadEnter" || e.code === "Space")) return;
    const m = mode();
    const turn = TURN_KEYS[e.code];
    if (turn && m === "walk") {
      e.preventDefault();
      turning.press(e.code, turn);
      return;
    }
    const a = keyToAction(e.code, true, m);
    if (!a) return;
    // Tab abre/fecha o celular (T11): o foco do navegador não anda junto.
    e.preventDefault();
    // girar e ampliar o exame repetem enquanto a tecla está segurada; o resto só conta a primeira batida
    if (a.type === "rotate" || a.type === "zoom") {
      onAction(a);
      return;
    }
    if (e.repeat) return;
    switch (a.type) {
      case "move":
        heldMove.set(e.code, { x: a.x, z: a.z });
        emitMove();
        return;
      case "run":
        held.run = true;
        break;
      case "crouch":
        held.crouch = true;
        break;
      case "peek":
        held.peek = a.dir;
        break;
      case "interact":
        held.interact = a.down;
        break;
    }
    dispatch(a, a.type === "back" || a.type === "places" || a.type === "phone" || a.type === "read");
  });

  on(win, "keyup", (ev) => {
    const e = ev as KeyboardEvent;
    if (turning.release(e.code)) return;
    if (heldMove.delete(e.code)) {
      emitMove();
      return;
    }
    // Soltar vale em qualquer modo (a tecla foi apertada andando): o mapa de "andar" diz o que ela segurava.
    const a = keyToAction(e.code, false, "walk");
    if (!a || a.type === "move") return;
    if (a.type === "run") {
      if (!held.run) return;
      held.run = false;
    } else if (a.type === "crouch") {
      if (!held.crouch) return;
      held.crouch = false;
    } else if (a.type === "peek") {
      // soltar Z com X ainda apertado não volta ao centro
      const dir = e.code === "KeyZ" ? -1 : 1;
      if (held.peek !== dir) return;
      held.peek = 0;
    } else if (a.type === "interact") {
      if (!held.interact) return;
      held.interact = false;
    }
    onAction(a);
  });

  on(win, "blur", releaseAll);

  /* ------------------------------------------------ mouse e toque */
  on(target, "pointerdown", (ev) => {
    const e = ev as PointerEvent;
    sync();
    const m = mode();
    const touch = e.pointerType !== "mouse" || opts.coarse;
    if (e.button === 2) {
      if (isPanel(m)) dispatch({ type: "back" }, true);
      return;
    }
    if (e.button !== 0) return;
    if (gestures.intercept(e)) return;
    if (!touch && m === "walk" && lock.canLock()) {
      if (lock.locked()) {
        held.interact = true;
        dispatch({ type: "interact", down: true });
        return;
      }
      // todo clique tenta travar; no modo arrastar, o mesmo gesto também começa a arrastar
      lock.request();
      if (lock.locked() || !lock.dragLook()) return;
    }
    gestures.begin(e);
  });

  on(doc, "pointermove", (ev) => {
    const e = ev as PointerEvent;
    if (lock.locked()) {
      if (mode() === "walk" && (e.movementX || e.movementY)) onAction({ type: "look", dx: e.movementX, dy: e.movementY });
      return;
    }
    gestures.move(e);
  });

  const endDown = (ev: Event) => {
    const e = ev as PointerEvent;
    if (lock.locked() && e.type === "pointerup" && e.button === 0 && held.interact) {
      held.interact = false;
      onAction({ type: "interact", down: false });
      return;
    }
    gestures.end(e);
  };
  on(doc, "pointerup", endDown);
  on(doc, "pointercancel", endDown);
  on(target, "contextmenu", (e) => e.preventDefault());
  // Exame: a roda amplia e a página atrás não rola.
  on(
    target,
    "wheel",
    (ev) => {
      sync();
      if (mode() !== "examine") return;
      const delta = (ev as WheelEvent).deltaY;
      if (delta === 0) return;
      ev.preventDefault();
      onAction({ type: "zoom", delta: Math.sign(delta) });
    },
    { passive: false },
  );

  /* ------------------------------------------------ tela cheia: prende o Esc */
  const unlockEscape = bindEscapeLock(win, doc, on);

  const dispose = () => {
    releaseAll();
    turning.dispose();
    for (const off of listeners.splice(0)) off();
    lock.release();
    unlockEscape();
  };
  return Object.assign(dispose, {
    dispose,
    panelOpened() {
      const now = mode();
      if (isPanel(lastMode) || !isPanel(now)) return;
      lastMode = now;
      releaseAll();
      if (lock.locked()) {
        relock = true;
        lock.release();
      }
    },
    panelClosed() {
      const was = lastMode;
      const now = mode();
      lastMode = now;
      if (isPanel(was) && !isPanel(now) && relock) lock.request(true);
      relock = false;
    },
  });
}
