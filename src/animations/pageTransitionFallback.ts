import { getGsap, prefersReducedMotion } from "@/lib/motion";

const OVERLAY_CLASS = "page-transition-fallback-overlay";
const DURATION = 0.28;

// Crossfade via overlay para browsers sem View Transitions API.
export function runPageTransitionFallback(navigate: () => void): Promise<void> {
  // GSAP ainda não chegou (1ª interação logo após o load): navega sem o crossfade.
  const lib = getGsap();
  if (prefersReducedMotion() || !lib) {
    navigate();
    return Promise.resolve();
  }

  const { gsap } = lib;
  let overlay = document.querySelector<HTMLElement>(`.${OVERLAY_CLASS}`);
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = OVERLAY_CLASS;
    overlay.setAttribute("aria-hidden", "true");
    document.body.appendChild(overlay);
  }

  gsap.set(overlay, { opacity: 0, pointerEvents: "auto" });

  return new Promise((resolve) => {
    gsap.to(overlay, {
      opacity: 1,
      duration: DURATION,
      ease: "power2.inOut",
      onComplete: () => {
        navigate();
        requestAnimationFrame(() => {
          gsap.to(overlay, {
            opacity: 0,
            duration: DURATION,
            ease: "power2.inOut",
            onComplete: () => {
              gsap.set(overlay, { pointerEvents: "none" });
              resolve();
            },
          });
        });
      },
    });
  });
}
