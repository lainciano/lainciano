import { isPanel, type Action, type InputMode } from "./actions";
import { isBrowserChord, keyToAction, TURN_KEYS } from "./keymap";

/**
 * Adaptadores de entrada (contrato §3): teclado, mouse travado e toque viram as mesmas `Action`.
 * - Teclado: `keyToAction` por `code`; o adaptador guarda o que está segurado (soma o `move`, solta tudo quando a
 *   janela perde o foco ou quando um painel abre) e gira o olhar continuamente com as setas laterais/PageUp/Down.
 *   Enter e espaço num botão ficam com o botão; nada é lido dentro de campos de texto.
 * - Mouse (ponteiro fino): o clique na cena trava o ponteiro (`requestPointerLock`); travado, mover olha, o
 *   botão esquerdo é `interact` e o direito, num painel, é `back`. Cada clique tenta travar de novo; só depois de
 *   3 falhas seguidas (ou de uma falha sem nunca ter travado: navegador sem pointer lock) arrastar também olha, e
 *   o "pausado" sai da tela (`onPause(false)`). Travar de novo volta ao normal.
 *   Abrir um painel com o mouse travado solta o mouse e lembra; fechar (E, ⌫, L ou botão direito) trava de novo
 *   no MESMO gesto (bíblia 12b.5). Painel fechado fora do adaptador (clique num botão da lista): o shell chama
 *   `panelClosed()` dentro do próprio handler do clique, que também é gesto. Toda entrada ressincroniza o modo:
 *   um "travar de novo" pendente não sobrevive a uma troca de modo que o adaptador não viu.
 *   Perder o travamento sem pedir (Esc do navegador) chama `onPause(true)`.
 *   Painel aberto POR FORA de uma entrada (um segurar que completa no quadro): o shell chama `panelOpened()`, que
 *   solta o mouse e lembra, como se o adaptador tivesse visto a abertura.
 * - Exame: arrastar com o botão esquerdo (ou o dedo) vira `rotate` em pixels, a roda vira `zoom` (sem rolar a
 *   página) e as setas/+/− repetem enquanto seguradas (ver keymap).
 * - Atalhos com Ctrl, ⌘ ou Alt são do navegador: nem ação, nem `preventDefault`.
 * - Toque: arrastar olha; tocar (sem arrastar) chama `onTap` (chão anda, objeto age); dois toques correm.
 * - Tela cheia: prende o Esc (`navigator.keyboard.lock`) enquanto dura; solta ao sair.
 */

export type BindOptions = {
  coarse: boolean;
  /** Modo atual (quem manda é o shell). Sem ele, tudo é `walk`. */
  mode?: () => InputMode;
  /** Toque/clique sem arrastar no palco, em coordenadas de cliente; `run` = dois toques. */
  onTap?: (clientX: number, clientY: number, run: boolean) => void;
  /** Travamento do mouse perdido sem pedir (`true`) ou retomado (`false`). */
  onPause?: (paused: boolean) => void;
};

/** Pixels de mouse equivalentes por segundo ao girar com as setas (≈ 1,9 rad/s com a sensibilidade 1). */
const TURN_PX_PER_S = 1.9 / 0.0022;
/** Arrastar no toque gira mais que o mouse (o dedo anda pouco): fator do protótipo (0,0055 / 0,0022). */
const TOUCH_LOOK = 2.5;
const TAP_SLOP = 9;
const DOUBLE_TAP_MS = 330;

/** Falhas seguidas de `requestPointerLock` (depois de já ter travado) antes de arrastar também olhar. */
const LOCK_FAILURES_TO_DRAG = 3;

type KeyboardLock = { lock?(keys?: string[]): Promise<void>; unlock?(): void };

/** Elemento do DOM (falso fora do navegador: os testes rodam sobre EventTarget). */
const isElement = (el: EventTarget | null): el is HTMLElement => typeof HTMLElement !== "undefined" && el instanceof HTMLElement;
const isTextField = (el: EventTarget | null) =>
  isElement(el) && (el.isContentEditable || el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement);
const isControl = (el: EventTarget | null) => isElement(el) && !!el.closest("button, a[href], [role='button'], summary");

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
  const heldTurn = new Map<string, { yaw: number; pitch: number }>();
  let held = { run: false, crouch: false, peek: 0 as -1 | 0 | 1, interact: false };
  let lastMode: InputMode = mode();

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
    heldTurn.clear();
    if (held.run) onAction({ type: "run", on: false });
    if (held.peek !== 0) onAction({ type: "peek", dir: 0 });
    if (held.crouch) onAction({ type: "crouch", on: false });
    if (held.interact) onAction({ type: "interact", down: false });
    held = { run: false, crouch: false, peek: 0, interact: false };
  };

  /* ------------------------------------------------ ponteiro travado */
  let locked = false;
  let expectUnlock = false;
  let relock = false;
  let everLocked = false;
  let lockFailures = 0;
  /** Um pedido em voo: a falha conta uma vez (a promessa rejeitada e o `pointerlockerror` são o mesmo pedido). */
  let lockPending = false;
  let dragLook = false;
  /** O pedido em voo é um "travar de novo" (fechar painel): se falhar, o mouse fica solto e o aviso aparece. */
  let relockRequest = false;
  const canLock = () => !opts.coarse && typeof target.requestPointerLock === "function";
  const lockFailed = () => {
    if (!lockPending) return;
    lockPending = false;
    lockFailures += 1;
    const wasRelock = relockRequest;
    relockRequest = false;
    if (!dragLook && (lockFailures >= LOCK_FAILURES_TO_DRAG || !everLocked)) {
      dragLook = true;
      // arrastar olha: nada de "clique na cena para continuar" preso na tela
      opts.onPause?.(false);
    } else if (wasRelock && !dragLook && mode() === "walk") {
      // fechar a lista com Esc (sem ativação) ou o navegador recusou: "pausado · clique na cena para continuar"
      opts.onPause?.(true);
    }
  };
  const requestLock = (relocking = false) => {
    if (!canLock() || locked) return;
    lockPending = true;
    relockRequest = relocking;
    try {
      const r = target.requestPointerLock() as unknown;
      if (r instanceof Promise) r.catch(lockFailed);
    } catch {
      lockFailed();
    }
  };
  const releaseLock = () => {
    if (doc.pointerLockElement !== target) return;
    expectUnlock = true;
    doc.exitPointerLock();
  };

  /** Depois de cada ação: abrir painel solta o mouse (e lembra), fechar trava de novo no mesmo gesto. */
  const afterAction = (closingGesture: boolean) => {
    const now = mode();
    if (now === lastMode) return;
    const was = lastMode;
    lastMode = now;
    if (!isPanel(was) && isPanel(now)) {
      releaseAll();
      if (locked) {
        relock = true;
        releaseLock();
      }
    } else if (isPanel(was) && !isPanel(now)) {
      if (relock && closingGesture) requestLock(true);
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
  let turnRaf = 0;
  let turnLast = 0;
  const turnLoop = (now: number) => {
    turnRaf = 0;
    if (heldTurn.size === 0 || mode() !== "walk") return;
    const dt = turnLast ? Math.min(0.05, (now - turnLast) / 1000) : 0;
    turnLast = now;
    let yaw = 0;
    let pitch = 0;
    for (const v of heldTurn.values()) {
      yaw += v.yaw;
      pitch += v.pitch;
    }
    if (dt > 0) onAction({ type: "look", dx: -yaw * TURN_PX_PER_S * dt, dy: -pitch * TURN_PX_PER_S * dt * 0.6 });
    turnRaf = win.requestAnimationFrame(turnLoop);
  };

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
      if (!heldTurn.has(e.code)) {
        heldTurn.set(e.code, turn);
        turnLast = 0;
        if (!turnRaf) turnRaf = win.requestAnimationFrame(turnLoop);
      }
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
    if (heldTurn.delete(e.code)) return;
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
  type Down = { id: number; x: number; y: number; lx: number; ly: number; moved: boolean; touch: boolean };
  let down: Down | null = null;
  let lastTap = { t: 0, x: 0, y: 0 };

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
    if (!touch && m === "walk" && canLock()) {
      if (locked) {
        held.interact = true;
        dispatch({ type: "interact", down: true });
        return;
      }
      // todo clique tenta travar; no modo arrastar, o mesmo gesto também começa a arrastar
      requestLock();
      if (locked || !dragLook) return;
    }
    down = { id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, touch };
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      /* captura indisponível: segue sem ela */
    }
  });

  on(doc, "pointermove", (ev) => {
    const e = ev as PointerEvent;
    if (locked) {
      if (mode() === "walk" && (e.movementX || e.movementY)) onAction({ type: "look", dx: e.movementX, dy: e.movementY });
      return;
    }
    if (!down || e.pointerId !== down.id) return;
    if (!down.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) > TAP_SLOP) down.moved = true;
    if (down.moved && mode() === "walk") {
      const k = down.touch ? -TOUCH_LOOK : 1;
      onAction({ type: "look", dx: (e.clientX - down.lx) * k, dy: (e.clientY - down.ly) * k });
    } else if (down.moved && mode() === "examine") {
      onAction({ type: "rotate", dx: e.clientX - down.lx, dy: e.clientY - down.ly });
    }
    down.lx = e.clientX;
    down.ly = e.clientY;
  });

  const endDown = (ev: Event) => {
    const e = ev as PointerEvent;
    if (locked && e.type === "pointerup" && e.button === 0 && held.interact) {
      held.interact = false;
      onAction({ type: "interact", down: false });
      return;
    }
    if (!down || e.pointerId !== down.id) return;
    const d = down;
    down = null;
    if (e.type !== "pointerup" || d.moved || mode() !== "walk") return;
    const now = performance.now();
    const run = now - lastTap.t < DOUBLE_TAP_MS && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 44;
    lastTap = { t: now, x: e.clientX, y: e.clientY };
    opts.onTap?.(e.clientX, e.clientY, run);
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

  on(doc, "pointerlockchange", () => {
    const now = doc.pointerLockElement === target;
    if (now) {
      locked = true;
      everLocked = true;
      lockPending = false;
      relockRequest = false;
      // o clique que pediu o lock (no modo arrastar) não vira toque nem arrasto
      down = null;
      lockFailures = 0;
      dragLook = false;
      opts.onPause?.(false);
      return;
    }
    if (!locked) return;
    locked = false;
    releaseAll();
    if (expectUnlock) {
      expectUnlock = false;
      return;
    }
    // Esc do navegador (ou a aba perdeu o foco): "pausado · clique na cena para continuar"
    if (mode() === "walk") opts.onPause?.(true);
  });
  on(doc, "pointerlockerror", lockFailed);

  /* ------------------------------------------------ tela cheia: prende o Esc */
  const keyboard = (win.navigator as Navigator & { keyboard?: KeyboardLock }).keyboard;
  const syncKeyboardLock = () => {
    try {
      if (doc.fullscreenElement) void keyboard?.lock?.(["Escape"])?.catch(() => {});
      else keyboard?.unlock?.();
    } catch {
      /* sem Keyboard Lock: o Esc segue do navegador */
    }
  };
  on(doc, "fullscreenchange", syncKeyboardLock);
  syncKeyboardLock();

  const dispose = () => {
    releaseAll();
    if (turnRaf) win.cancelAnimationFrame(turnRaf);
    for (const off of listeners.splice(0)) off();
    if (doc.pointerLockElement === target) {
      expectUnlock = true;
      doc.exitPointerLock();
    }
    try {
      keyboard?.unlock?.();
    } catch {
      /* nada a soltar */
    }
  };
  return Object.assign(dispose, {
    dispose,
    panelOpened() {
      const now = mode();
      if (isPanel(lastMode) || !isPanel(now)) return;
      lastMode = now;
      releaseAll();
      if (locked) {
        relock = true;
        releaseLock();
      }
    },
    panelClosed() {
      const was = lastMode;
      const now = mode();
      lastMode = now;
      if (isPanel(was) && !isPanel(now) && relock) requestLock(true);
      relock = false;
    },
  });
}
