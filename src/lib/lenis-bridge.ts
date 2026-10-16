type LenisControls = {
  stop: () => void;
  start: () => void;
};

let controls: LenisControls | null = null;
// Pausas de diálogos contam (aninham); pausas com dono (ex.: "navigation") são idempotentes por dono.
let pauses = 0;
const owners = new Set<string>();
const held = () => pauses + owners.size;

/** Registra controles do Lenis (chamado pelo SmoothScroll). */
export function registerLenisControls(next: LenisControls | null) {
  controls = next;
  // Instância recriada com pausa ativa (lenis/react refaz ao mudar opções): já nasce parada.
  if (next && held() > 0) next.stop();
}

export function pauseLenis(owner?: string) {
  const before = held();
  if (owner) owners.add(owner);
  else pauses += 1;
  if (before === 0 && held() > 0) controls?.stop();
}

/** Só religa o Lenis quando o último dono libera; nunca fica negativo. Sem pausa ativa, ainda chama start. */
export function resumeLenis(owner?: string) {
  if (owner) owners.delete(owner);
  else if (pauses > 0) pauses -= 1;
  if (held() === 0) controls?.start();
}

const NAV_HOLD = "navigation";
let navTimer: ReturnType<typeof setTimeout> | null = null;

/** Libera a pausa da navegação e cancela o prazo dela (idempotente). */
export function releaseNavigationHold() {
  if (navTimer !== null) {
    clearTimeout(navTimer);
    navTimer = null;
  }
  resumeLenis(NAV_HOLD);
}

/** Pausa por navegação, com prazo: rota igual ou transição abortada não muda o pathname. Um timer só. */
export function holdNavigation(maxMs: number) {
  if (navTimer !== null) clearTimeout(navTimer);
  pauseLenis(NAV_HOLD);
  navTimer = setTimeout(releaseNavigationHold, maxMs);
}
