/**
 * Travamento do mouse (`requestPointerLock`), tirado de `adapters.ts`. Cada clique tenta travar de novo; só depois
 * de `LOCK_FAILURES_TO_DRAG` falhas seguidas (ou de uma falha sem nunca ter travado: navegador sem pointer lock)
 * arrastar também olha, e o "pausado" sai da tela (`onPause(false)`). Travar de novo volta ao normal. Perder o
 * travamento sem pedir (Esc do navegador) chama `onPause(true)`.
 */

/** Falhas seguidas de `requestPointerLock` (depois de já ter travado) antes de arrastar também olhar. */
const LOCK_FAILURES_TO_DRAG = 3;

export type PointerLockDeps = {
  target: HTMLElement;
  doc: Document;
  coarse: boolean;
  /** Só pergunta se está andando (o "pausado" só faz sentido ali). */
  walking: () => boolean;
  onPause?: (paused: boolean) => void;
  /** O travamento chegou (o clique que o pediu não vira toque nem arrasto). */
  onGrab: () => void;
  /** O travamento se foi (pedido ou não): solta o que estava segurado. */
  onLost: () => void;
  on: (el: EventTarget, type: string, fn: () => void) => void;
};

export type PointerLock = {
  locked(): boolean;
  /** Sem pointer lock utilizável: arrastar também olha. */
  dragLook(): boolean;
  canLock(): boolean;
  /** Pede o travamento; `relocking` = é um "travar de novo" (fechar painel): se falhar, o aviso aparece. */
  request(relocking?: boolean): void;
  /** Solta o mouse de propósito (abrir painel, desligar): não vira "pausado". */
  release(): void;
};

export function createPointerLock(d: PointerLockDeps): PointerLock {
  const { target, doc } = d;
  let locked = false;
  let expectUnlock = false;
  let everLocked = false;
  let failures = 0;
  /** Um pedido em voo: a falha conta uma vez (a promessa rejeitada e o `pointerlockerror` são o mesmo pedido). */
  let pending = false;
  let dragLook = false;
  /** O pedido em voo é um "travar de novo" (fechar painel): se falhar, o mouse fica solto e o aviso aparece. */
  let relockRequest = false;
  const canLock = () => !d.coarse && typeof target.requestPointerLock === "function";
  const failed = () => {
    if (!pending) return;
    pending = false;
    failures += 1;
    const wasRelock = relockRequest;
    relockRequest = false;
    if (!dragLook && (failures >= LOCK_FAILURES_TO_DRAG || !everLocked)) {
      dragLook = true;
      // arrastar olha: nada de "clique na cena para continuar" preso na tela
      d.onPause?.(false);
    } else if (wasRelock && !dragLook && d.walking()) {
      // fechar a lista com Esc (sem ativação) ou o navegador recusou: "pausado · clique na cena para continuar"
      d.onPause?.(true);
    }
  };

  d.on(doc, "pointerlockchange", () => {
    if (doc.pointerLockElement === target) {
      locked = true;
      everLocked = true;
      pending = false;
      relockRequest = false;
      failures = 0;
      dragLook = false;
      d.onGrab();
      d.onPause?.(false);
      return;
    }
    if (!locked) return;
    locked = false;
    d.onLost();
    if (expectUnlock) {
      expectUnlock = false;
      return;
    }
    // Esc do navegador (ou a aba perdeu o foco): "pausado · clique na cena para continuar"
    if (d.walking()) d.onPause?.(true);
  });
  d.on(doc, "pointerlockerror", failed);

  return {
    locked: () => locked,
    dragLook: () => dragLook,
    canLock,
    request(relocking = false) {
      if (!canLock() || locked) return;
      pending = true;
      relockRequest = relocking;
      try {
        const r = target.requestPointerLock() as unknown;
        if (r instanceof Promise) r.catch(failed);
      } catch {
        failed();
      }
    },
    release() {
      if (doc.pointerLockElement !== target) return;
      expectUnlock = true;
      doc.exitPointerLock();
    },
  };
}
