/** O que o atalho precisa saber do keydown (puro para testar sem DOM). */
export type ShortcutEvent = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  isComposing: boolean;
  defaultPrevented: boolean;
  target: { tagName?: string; isContentEditable?: boolean } | null;
  /** Já há um <dialog open> (Limiar, gaveta de relíquias, o próprio console). */
  dialogOpen: boolean;
  /**
   * O jogo está aberto (T13): `/` fica com ele. O console modal por cima quebraria a pilha de painéis, o `inert` do
   * site e o travamento do mouse; para o console, sai-se do jogo (botão "Sair do jogo").
   */
  gameOpen: boolean;
};

const TYPING = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/** `/` abre o console só fora de campos de texto e sem modificadores (spec 8.6; WCAG 2.1.4). */
export function shouldOpenConsole(event: ShortcutEvent): boolean {
  if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return false;
  if (event.isComposing || event.defaultPrevented || event.dialogOpen || event.gameOpen) return false;
  const target = event.target;
  return !(target && (TYPING.has(target.tagName ?? "") || target.isContentEditable));
}
