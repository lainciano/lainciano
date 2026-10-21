import { readTimeToken } from "@/lib/css-time";
import { getGsap, prefersReducedMotion } from "@/lib/motion";
import { TIMING, transitionFor } from "./sequence";

type Origin = { x: number; y: number };

/**
 * Saída do ato Som: a porta escolhida cresce, a outra some e a cena apaga até restar a brasa no centro
 * (movimento reduzido: só um fade). Sem GSAP, corte seco com a brasa já no centro.
 */
export function playExit(scene: HTMLElement, ember: HTMLElement, chosen: HTMLElement, other: HTMLElement | null, origin: Origin | null) {
  const lib = getGsap();
  if (!lib) {
    scene.style.opacity = "0";
    ember.style.visibility = "visible";
    ember.style.opacity = "1";
    return { done: Promise.resolve(), kill() {} };
  }
  const { gsap } = lib;
  const reduced = transitionFor("som", { reduced: prefersReducedMotion() }) === "fade";
  let resolve = () => {};
  const done = new Promise<void>((r) => {
    resolve = r;
  });
  const tl = gsap.timeline({ onComplete: () => resolve() });
  if (reduced) {
    tl.to(scene, { autoAlpha: 0, duration: readTimeToken("--motion-fast", 150) / 1000 });
  } else {
    const doorS = TIMING.exitMs[0] / 1000;
    const exitS = TIMING.exitMs[1] / 1000;
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    if (other) tl.to(other, { autoAlpha: 0, scale: 0.9, duration: doorS / 2, ease: "power2.in" });
    tl.to(chosen, { scale: 1.08, duration: doorS, ease: "power2.out" }, 0)
      .set(ember, { x: origin?.x ?? cx, y: origin?.y ?? cy, scale: 0.4, autoAlpha: 1 }, doorS / 2)
      .to(scene, { scale: 0.92, filter: "blur(10px) brightness(0)", autoAlpha: 0, duration: exitS, ease: "power2.in" }, doorS / 2)
      .to(ember, { x: cx, y: cy, scale: 1, duration: exitS, ease: "power2.inOut" }, "<");
  }
  return { done, kill: () => tl.kill() };
}
