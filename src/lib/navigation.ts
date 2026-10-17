import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { runPageTransitionFallback } from "@/animations/pageTransitionFallback";
import { holdNavigation, releaseNavigationHold } from "@/lib/lenis-bridge";
import { prefersReducedMotion } from "@/lib/motion";

export type TransitionDirection = "forward" | "back";

export function supportsViewTransitions(): boolean {
  return typeof document !== "undefined" && "startViewTransition" in document;
}

const NAV_HOLD_MAX_MS = 3000;

/** Navega com View Transitions API ou fallback GSAP crossfade. */
export function navigateWithTransition(
  router: AppRouterInstance,
  href: string,
  direction: TransitionDirection = "forward",
) {
  const transitionTypes = direction === "back" ? ["nav-back"] : ["nav-forward"];

  // Idempotente e com prazo: rota igual ou transição abortada não muda o pathname.
  holdNavigation(NAV_HOLD_MAX_MS);

  if (supportsViewTransitions() && !prefersReducedMotion()) {
    try {
      router.push(href, { transitionTypes });
    } catch (error) {
      releaseNavigationHold();
      throw error;
    }
    // Lenis retoma no ScrollBridge após pathname mudar.
    return;
  }

  void runPageTransitionFallback(() => {
    router.push(href);
  }).finally(releaseNavigationHold);
}
