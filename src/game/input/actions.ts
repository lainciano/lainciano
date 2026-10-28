/**
 * Ações semânticas do jogo (contrato §3): teclado, mouse travado e toque produzem as mesmas ações, e as regras do
 * jogo só leem isto, nunca `KeyboardEvent`.
 *
 * - `move`: contribuição de movimento em eixos de tela (x direita, z para trás: W = z −1). O adaptador soma as
 *   teclas seguradas e manda o vetor já somado; quem recebe trata o último `move` como o estado atual.
 * - `look`: delta em pixels de mouse (a sensibilidade é do controlador).
 * - `interact`: apertar/soltar (ações de segurar).
 * - `run`, `crouch`, `peek`: estado enquanto a tecla é segurada.
 * - `back`: fecha painéis (E, ⌫ ou botão direito; Esc só por tolerância, bíblia 12b.5).
 */
export type Action =
  | { type: "move"; x: number; z: number }
  | { type: "look"; dx: number; dy: number }
  | { type: "interact"; down: boolean }
  | { type: "cycle" }
  | { type: "places" }
  | { type: "phone" }
  | { type: "run"; on: boolean }
  | { type: "crouch"; on: boolean }
  | { type: "peek"; dir: -1 | 0 | 1 }
  | { type: "flash" }
  | { type: "back" }
  | { type: "read" };

/** Em que o jogo está: andar, um dos painéis (exame, leitura, celular) ou um menu (lista de lugares). */
export type InputMode = "walk" | "examine" | "read" | "phone" | "menu";


export const isPanel = (mode: InputMode): boolean => mode !== "walk";

/**
 * Ação que só SOLTA algo segurado (parar de andar, de correr, de agachar, de espiar, soltar a interação). Chega ao
 * jogador mesmo com um painel aberto: abrir a lista com W segurado não pode deixar o jogador andando sozinho.
 */
export function isRelease(a: Action): boolean {
  switch (a.type) {
    case "move":
      return a.x === 0 && a.z === 0;
    case "run":
    case "crouch":
      return !a.on;
    case "peek":
      return a.dir === 0;
    case "interact":
      return !a.down;
    default:
      return false;
  }
}
