type LenisControls = {
  stop: () => void;
  start: () => void;
};

let controls: LenisControls | null = null;
// Contador de pausas: vários donos (console, platina, navegação) podem pausar ao mesmo tempo.
let pauses = 0;

/** Registra controles do Lenis (chamado pelo SmoothScroll). */
export function registerLenisControls(next: LenisControls | null) {
  controls = next;
}

export function pauseLenis() {
  pauses += 1;
  if (pauses === 1) controls?.stop();
}

/** Só religa o Lenis quando o último dono libera; nunca fica negativo. */
export function resumeLenis() {
  if (pauses === 0) {
    controls?.start();
    return;
  }
  pauses -= 1;
  if (pauses === 0) controls?.start();
}
