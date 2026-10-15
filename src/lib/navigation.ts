import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { runPageTransitionFallback } from "@/animations/pageTransitionFallback";
import { pauseLenis, resumeLenis } from "@/lib/lenis-bridge";
import { prefersReducedMotion } from "@/lib/motion";

export type TransitionDirection = "forward" | "back";

export function supportsViewTransitions(): boolean {
  return typeof document !== "undefined" && "startViewTransition" in document;
}

const NAV_HOLD = "navigation"; // dono idempotente: N navegações seguidas contam como uma pausa
const NAV_HOLD_MAX_MS = 3000;

/** Navega com View Transitions API ou fallback GSAP crossfade. */
export function navigateWithTransition(
  router: AppRouterInstance,
  href: string,
  direction: TransitionDirection = "forward",
) {
  const transitionTypes = direction === "back" ? ["nav-back"] : ["nav-forward"];

  pauseLenis(NAV_HOLD);
  // Rota igual ou transição abortada não muda o pathname: o prazo garante que o Lenis volta.
  window.setTimeout(() => resumeLenis(NAV_HOLD), NAV_HOLD_MAX_MS);

  const resume = () => resumeLenis(NAV_HOLD);

  if (supportsViewTransitions() && !prefersReducedMotion()) {
    router.push(href, { transitionTypes });
    // Lenis retoma no ScrollBridge após pathname mudar.
    return;
  }

  void runPageTransitionFallback(() => {
    router.push(href);
  }).finally(resume);
}
