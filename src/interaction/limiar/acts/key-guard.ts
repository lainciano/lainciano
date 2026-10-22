/**
 * Guarda de teclado dos botões dos atos (Inscrições, Relíquia): um Enter ou espaço que vinha apertado do ato
 * anterior (autorrepetição) não pode avançar uma frase nem pegar a relíquia. Enter ativa o botão no keydown
 * (inclusive nas repetições); espaço ativa no keyup, mesmo que o keydown tenha nascido fora do botão.
 */

export type KeyGuard = { readonly armed: readonly string[] };

export const IDLE_GUARD: KeyGuard = { armed: [] };

const isActivationKey = (key: string) => key === "Enter" || key === " ";

/** Keydown no botão: `allow` falso pede `preventDefault()` (repetição não ativa nada). */
export function guardKeyDown(state: KeyGuard, key: string, repeat: boolean): { state: KeyGuard; allow: boolean } {
  if (!isActivationKey(key)) return { state, allow: true };
  if (repeat) return { state, allow: false };
  return { state: state.armed.includes(key) ? state : { armed: [...state.armed, key] }, allow: true };
}

/** Keyup no botão: espaço só ativa se o keydown (novo) foi aqui. */
export function guardKeyUp(state: KeyGuard, key: string): { state: KeyGuard; allow: boolean } {
  if (!isActivationKey(key)) return { state, allow: true };
  const armed = state.armed.includes(key);
  return { state: armed ? { armed: state.armed.filter((k) => k !== key) } : state, allow: armed };
}

/** Foco saiu do botão: as teclas armadas soltam. */
export function guardBlur(state: KeyGuard): KeyGuard {
  return state.armed.length ? IDLE_GUARD : state;
}

/**
 * Liga a guarda a um botão; devolve a limpeza. As ativações bloqueadas viram `preventDefault()` no evento de
 * teclado, e o botão nunca recebe o clique.
 */
export function attachKeyGuard(button: HTMLElement): () => void {
  let state = IDLE_GUARD;
  const onKeyDown = (event: KeyboardEvent) => {
    const result = guardKeyDown(state, event.key, event.repeat);
    state = result.state;
    if (!result.allow) event.preventDefault();
  };
  const onKeyUp = (event: KeyboardEvent) => {
    const result = guardKeyUp(state, event.key);
    state = result.state;
    if (!result.allow) event.preventDefault();
  };
  const onBlur = () => {
    state = guardBlur(state);
  };
  button.addEventListener("keydown", onKeyDown);
  button.addEventListener("keyup", onKeyUp);
  button.addEventListener("blur", onBlur);
  return () => {
    button.removeEventListener("keydown", onKeyDown);
    button.removeEventListener("keyup", onKeyUp);
    button.removeEventListener("blur", onBlur);
  };
}
