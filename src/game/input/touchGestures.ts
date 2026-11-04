import type { Action, InputMode } from "./actions";

/**
 * Gestos de ponteiro do palco (toque e arrastar-olha do mouse), tirados de `adapters.ts` (T12):
 * - Arrastar olha (toque: fator `TOUCH_LOOK`); no exame, gira (`rotate`, em pixels). Tocar sem arrastar chama
 *   `onTap` (chão anda, objeto age); dois toques seguidos correm.
 * - Segurar por toque: o dedo pousa (andando) e `onHoldStart` diz se há um objeto de segurar ao alcance sob ele; se
 *   há, o gesto é um segurar (sem olhar, sem toque): levantar o dedo solta (`onHoldEnd(false)`); o dedo andar mais
 *   de `HOLD_SLOP` px, sair do alvo (`onHoldMove` falso), um 2º dedo, `pointercancel` ou perder o foco cancelam
 *   (`onHoldEnd(true)`), e o resto do gesto vira olhar.
 * - Dedo fantasma: um toque PRIMÁRIO novo com um gesto velho aberto quer dizer que o fim do anterior se perdeu (o
 *   navegador engoliu o pointerup): o novo substitui o velho e o segurar velho cai. `reset()` (perder o foco, abrir
 *   painel) também limpa os dedos e a pinça.
 * - Pinça no exame: dois dedos; abrir aproxima (`zoom` −1 a cada `PINCH_STEP` px), fechar afasta; com dois dedos
 *   não se gira.
 * O travamento do mouse e o teclado ficam em `adapters.ts`; aqui só o que decide o que o ponteiro solto faz.
 */

export type TouchHooks = {
  /** Toque/clique sem arrastar no palco, em coordenadas de cliente; `run` = dois toques. */
  onTap?: (clientX: number, clientY: number, run: boolean) => void;
  /** Toque: o dedo pousou no palco andando. `true` = começou a segurar um objeto (o gesto não olha nem vira toque). */
  onHoldStart?: (clientX: number, clientY: number) => boolean;
  /** O dedo andou durante o segurar: `false` = o objeto não está mais sob ele (cancela). */
  onHoldMove?: (clientX: number, clientY: number) => boolean;
  /** Fim do segurar por toque: soltou (`false`) ou cancelou (`true`). */
  onHoldEnd?: (cancelled: boolean) => void;
};

/** Arrastar no toque gira mais que o mouse (o dedo anda pouco): fator do protótipo (0,0055 / 0,0022). */
const TOUCH_LOOK = 2.5;
const TAP_SLOP = 9;
const DOUBLE_TAP_MS = 330;
/** O dedo pode tremer até isto (px) sem cancelar o segurar. */
export const HOLD_SLOP = 28;
/** Pinça: cada tanto de px de variação na distância entre os dedos é um passo de zoom. */
export const PINCH_STEP = 20;

/** O que o adaptador empresta aos gestos. */
export type TouchDeps = TouchHooks & {
  target: HTMLElement;
  /** Ponteiro grosso: todo ponteiro vale como toque. */
  coarse: boolean;
  mode: () => InputMode;
  onAction: (a: Action) => void;
};

/** Só o que os gestos leem do evento (os testes passam objetos simples). */
export type GesturePointer = {
  type: string;
  pointerId: number;
  pointerType: string;
  clientX: number;
  clientY: number;
  isPrimary?: boolean;
};

type Down = { id: number; x: number; y: number; lx: number; ly: number; moved: boolean; touch: boolean; hold: boolean };

export type TouchGestures = {
  /**
   * Primeira etapa do `pointerdown` (botão esquerdo): ressincroniza dedo fantasma, 2º dedo e pinça. `true` = o
   * evento foi consumido (o adaptador não faz mais nada com ele).
   */
  intercept(e: GesturePointer): boolean;
  /** Última etapa do `pointerdown`: abre o gesto (e o segurar, se houver objeto sob o dedo). */
  begin(e: GesturePointer): void;
  /** `pointermove` com o ponteiro solto (não travado). */
  move(e: GesturePointer): void;
  /** `pointerup`/`pointercancel`. */
  end(e: GesturePointer): void;
  /** Descarta o gesto em curso sem avisar (o clique que travou o mouse não vira toque nem arrasto). */
  drop(): void;
  /** Perdeu o foco ou abriu painel: o segurar cai e a pinça e os dedos somem; o gesto de olhar segue. */
  reset(): void;
};

export function createTouchGestures(d: TouchDeps): TouchGestures {
  let down: Down | null = null;
  /** Dedos no palco durante o exame (pinça). */
  const fingers = new Map<number, { x: number; y: number }>();
  let pinch: { dist: number } | null = null;
  let lastTap = { t: 0, x: 0, y: 0 };

  const fingerDistance = () => {
    const [a, b] = [...fingers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };

  /** O segurar por toque cai: o resto do gesto (se o dedo continua) vira olhar. */
  function cancelHold() {
    if (!down?.hold) return;
    down.hold = false;
    down.moved = true;
    d.onHoldEnd?.(true);
  }

  const isTouch = (e: GesturePointer) => e.pointerType !== "mouse" || d.coarse;

  return {
    intercept(e) {
      const m = d.mode();
      const touch = isTouch(e);
      if (touch && down && down.id !== e.pointerId && e.isPrimary !== false) {
        // Dedo fantasma: um toque PRIMÁRIO novo com um `down` velho quer dizer que o fim do anterior se perdeu (o
        // navegador engoliu o pointerup). O novo substitui o velho; o segurar velho cai.
        cancelHold();
        down = null;
      }
      if (touch && down && down.id !== e.pointerId) {
        // 2º dedo de verdade: o segurar cai; no exame, começa a pinça (e o 1º dedo para de girar)
        cancelHold();
        if (m === "examine") {
          fingers.set(down.id, { x: down.lx, y: down.ly });
          fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
          pinch = { dist: fingerDistance() };
          down = null;
        }
        return true;
      }
      if (touch && pinch) {
        fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        return true;
      }
      return false;
    },

    begin(e) {
      const touch = isTouch(e);
      down = { id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, touch, hold: false };
      if (touch && d.mode() === "walk" && d.onHoldStart?.(e.clientX, e.clientY)) down.hold = true;
      try {
        d.target.setPointerCapture(e.pointerId);
      } catch {
        /* captura indisponível: segue sem ela */
      }
    },

    move(e) {
      if (pinch && fingers.has(e.pointerId)) {
        fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (fingers.size < 2 || d.mode() !== "examine") return;
        const dist = fingerDistance();
        while (Math.abs(dist - pinch.dist) >= PINCH_STEP) {
          const opening = dist > pinch.dist;
          // abrir os dedos aproxima (como a roda para cima)
          d.onAction({ type: "zoom", delta: opening ? -1 : 1 });
          pinch.dist += opening ? PINCH_STEP : -PINCH_STEP;
        }
        return;
      }
      if (!down || e.pointerId !== down.id) return;
      if (down.hold) {
        if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > HOLD_SLOP || d.onHoldMove?.(e.clientX, e.clientY) === false) cancelHold();
        down.lx = e.clientX;
        down.ly = e.clientY;
        return;
      }
      if (!down.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) > TAP_SLOP) down.moved = true;
      const m = d.mode();
      if (down.moved && m === "walk") {
        const k = down.touch ? -TOUCH_LOOK : 1;
        d.onAction({ type: "look", dx: (e.clientX - down.lx) * k, dy: (e.clientY - down.ly) * k });
      } else if (down.moved && m === "examine") {
        d.onAction({ type: "rotate", dx: e.clientX - down.lx, dy: e.clientY - down.ly });
      }
      down.lx = e.clientX;
      down.ly = e.clientY;
    },

    end(e) {
      if (fingers.delete(e.pointerId)) {
        if (fingers.size < 2) {
          pinch = null;
          fingers.clear();
        }
        return;
      }
      if (!down || e.pointerId !== down.id) return;
      const gesture = down;
      down = null;
      if (gesture.hold) {
        d.onHoldEnd?.(e.type !== "pointerup");
        return;
      }
      if (e.type !== "pointerup" || gesture.moved || d.mode() !== "walk") return;
      const now = performance.now();
      const run = now - lastTap.t < DOUBLE_TAP_MS && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 44;
      lastTap = { t: now, x: e.clientX, y: e.clientY };
      d.onTap?.(e.clientX, e.clientY, run);
    },

    drop() {
      down = null;
    },

    reset() {
      cancelHold();
      pinch = null;
      fingers.clear();
    },
  };
}
