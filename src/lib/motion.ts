/** Retorna true quando o usuário prefere menos animação (acessibilidade). */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export type GsapLib = {
  gsap: typeof import("gsap").gsap;
  ScrollTrigger: typeof import("gsap/ScrollTrigger").ScrollTrigger;
};

// GSAP + ScrollTrigger fora do JS inicial (Fase 8): carregam por import() depois do primeiro paint.
// Quem anima por gesto (portal, toast, console) usa `getGsap()` e, se ainda não carregou, pula a animação;
// quem monta efeito contínuo (scroll, cursor, salas) usa `whenGsap()`, que espera o carregamento.
let lib: GsapLib | null = null;
let loading: Promise<GsapLib> | null = null;

export const getGsap = (): GsapLib | null => lib;

export function loadGsap(): Promise<GsapLib> {
  loading ??= Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(([core, trigger]) => {
    core.gsap.registerPlugin(trigger.ScrollTrigger);
    lib = { gsap: core.gsap, ScrollTrigger: trigger.ScrollTrigger };
    return lib;
  });
  loading.catch(() => {
    loading = null; // falha de rede: a próxima tentativa recarrega
  });
  return loading;
}

/** Roda `run` quando o GSAP estiver pronto; o retorno cancela (e chama o cleanup de `run`, se já rodou). */
export function whenGsap(run: (lib: GsapLib) => void | (() => void)): () => void {
  let cancelled = false;
  let cleanup: void | (() => void);
  if (lib) cleanup = run(lib);
  else {
    loadGsap().then(
      (ready) => {
        if (!cancelled) cleanup = run(ready);
      },
      () => {},
    );
  }
  return () => {
    cancelled = true;
    if (typeof cleanup === "function") cleanup();
  };
}

/** Chama `fn` quando o navegador estiver ocioso depois do `load` (com prazo), sem competir com a pintura. */
export function afterLoadIdle(fn: () => void, timeoutMs = 1500): () => void {
  // Safari não tem requestIdleCallback: cai num timeout curto.
  const idle = window as Window & {
    requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  let done = false;
  let handle: number | undefined;
  const run = () => {
    if (done) return;
    done = true;
    fn();
  };
  const schedule = () => {
    handle = idle.requestIdleCallback ? idle.requestIdleCallback(run, { timeout: timeoutMs }) : window.setTimeout(run, 200);
  };
  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
  return () => {
    done = true;
    window.removeEventListener("load", schedule);
    if (handle !== undefined) {
      if (idle.cancelIdleCallback) idle.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    }
  };
}
