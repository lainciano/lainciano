/** O que o atalho precisa saber do keydown (puro para testar sem DOM). */
export type ShortcutEvent = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  isComposing: boolean;
  defaultPrevented: boolean;
  target: { tagName?: string; isContentEditable?: boolean } | null;
  /** Já há um <dialog open> (Portal, gaveta de relíquias, o próprio console). */
  dialogOpen: boolean;
};

const TYPING = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/** `/` abre o console só fora de campos de texto e sem modificadores (spec 8.6; WCAG 2.1.4). */
export function shouldOpenConsole(event: ShortcutEvent): boolean {
  if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return false;
  if (event.isComposing || event.defaultPrevented || event.dialogOpen) return false;
  const target = event.target;
  return !(target && (TYPING.has(target.tagName ?? "") || target.isContentEditable));
}
