import type { Action, InputMode } from "./actions";

/**
 * Mapa de teclas puro (por `KeyboardEvent.code`, independente do layout). Sem estado: o adaptador guarda o que
 * está segurado. Regras:
 * - andando, Esc e ⌫ não fazem nada (o Esc é do navegador: solta o mouse e sai da tela cheia, bíblia 12b.5);
 * - nos painéis (exame, leitura, celular), E e ⌫ voltam; Esc também, por tolerância, sem rótulo na tela;
 * - no exame, as setas giram o objeto e +/− ampliam;
 * - no menu (lista de lugares), Tab, setas, Enter e espaço ficam com o foco e os botões nativos; L fecha como abriu;
 * - agachar é segurar C (Ctrl é do navegador: ver `isBrowserChord`).
 */

const MOVE: Record<string, { x: number; z: number }> = {
  KeyW: { x: 0, z: -1 },
  ArrowUp: { x: 0, z: -1 },
  KeyS: { x: 0, z: 1 },
  ArrowDown: { x: 0, z: 1 },
  KeyA: { x: -1, z: 0 },
  KeyD: { x: 1, z: 0 },
};

/**
 * Teclas que giram o olhar de forma contínua (yaw +1 = para a esquerda, pitch +1 = para cima). Não viram uma
 * `Action` por tecla: o adaptador as converte em `look` a cada quadro enquanto seguradas.
 */
export const TURN_KEYS: Readonly<Record<string, { yaw: -1 | 0 | 1; pitch: -1 | 0 | 1 }>> = {
  ArrowLeft: { yaw: 1, pitch: 0 },
  ArrowRight: { yaw: -1, pitch: 0 },
  PageUp: { yaw: 0, pitch: 1 },
  PageDown: { yaw: 0, pitch: -1 },
};

const BACK_KEYS = new Set(["KeyE", "Backspace", "Escape"]);

/** Exame: uma seta gira 24 px de arrasto equivalentes (~15°); a repetição do teclado gira contínuo. */
const EXAMINE_STEP = 24;
const EXAMINE_KEYS: Record<string, Action> = {
  ArrowLeft: { type: "rotate", dx: -EXAMINE_STEP, dy: 0 },
  ArrowRight: { type: "rotate", dx: EXAMINE_STEP, dy: 0 },
  ArrowUp: { type: "rotate", dx: 0, dy: -EXAMINE_STEP },
  ArrowDown: { type: "rotate", dx: 0, dy: EXAMINE_STEP },
  Equal: { type: "zoom", delta: -1 },
  NumpadAdd: { type: "zoom", delta: -1 },
  Minus: { type: "zoom", delta: 1 },
  NumpadSubtract: { type: "zoom", delta: 1 },
};

/**
 * Atalho do navegador ou do sistema (Ctrl, ⌘ ou Alt junto): o jogo não lê nem impede (Ctrl+W, Ctrl+L, Ctrl+F
 * seguem funcionando). Shift sozinho é do jogo (correr).
 */
export function isBrowserChord(e: { ctrlKey: boolean; metaKey: boolean; altKey: boolean }): boolean {
  return e.ctrlKey || e.metaKey || e.altKey;
}

function walkKey(code: string, down: boolean): Action | null {
  const move = MOVE[code];
  if (move) return down ? { type: "move", ...move } : { type: "move", x: 0, z: 0 };
  switch (code) {
    case "KeyE":
    case "Enter":
      return { type: "interact", down };
    case "ShiftLeft":
    case "ShiftRight":
      return { type: "run", on: down };
    case "KeyC":
      return { type: "crouch", on: down };
    case "KeyZ":
      return { type: "peek", dir: down ? -1 : 0 };
    case "KeyX":
      return { type: "peek", dir: down ? 1 : 0 };
  }
  if (!down) return null;
  switch (code) {
    case "Tab":
    case "KeyI":
      return { type: "phone" };
    case "KeyL":
      return { type: "places" };
    case "KeyQ":
      return { type: "cycle" };
    case "KeyF":
      return { type: "flash" };
  }
  return null;
}

export function keyToAction(code: string, down: boolean, mode: InputMode): Action | null {
  if (mode === "walk") return walkKey(code, down);
  if (!down) return null;
  if (mode === "menu") {
    if (code === "KeyL") return { type: "places" };
    if (code === "Backspace" || code === "Escape") return { type: "back" };
    return null;
  }
  if (BACK_KEYS.has(code)) return { type: "back" };
  if (mode === "examine" && Object.hasOwn(EXAMINE_KEYS, code)) return { ...EXAMINE_KEYS[code] };
  if (mode === "read" && code === "KeyR") return { type: "read" };
  if (mode === "phone" && code === "Tab") return { type: "phone" };
  return null;
}
