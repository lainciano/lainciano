import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

// Título de sala no scroll (spec 7.0): letter-spacing 0.08em → -0.01em e skewX -8° → 0, em scrub.
// O estado final é o do CSS (.text-room-title), então o título é legível em qualquer ponto.
export function createRoomTitleDeform(title: HTMLElement): () => void {
  const tween = gsap.fromTo(
    title,
    { letterSpacing: "0.08em", skewX: -8 },
    {
      letterSpacing: "-0.01em",
      skewX: 0,
      ease: "none",
      scrollTrigger: { trigger: title, start: "top 95%", end: "top 45%", scrub: true },
    },
  );
  return () => {
    tween.scrollTrigger?.kill();
    tween.kill();
    gsap.set(title, { clearProps: "letterSpacing,transform" });
  };
}
