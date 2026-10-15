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
