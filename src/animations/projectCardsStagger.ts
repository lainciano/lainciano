import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

// Entrada staggered dos cards de projeto (rotate + opacity).
export function createProjectCardsStagger(
  section: HTMLElement,
  cards: HTMLElement[],
): () => void {
  const mm = gsap.matchMedia();

  mm.add("(prefers-reduced-motion: no-preference)", () => {
    gsap.from(cards, {
      opacity: 0,
      rotation: 3,
      y: 24,
      duration: 0.7,
      stagger: 0.12,
      ease: "power2.out",
      scrollTrigger: {
        trigger: section,
        start: "top 85%",
        // Revela uma vez e mantém visível — não esconde o conteúdo ao rolar de volta (anti-FOIC).
        toggleActions: "play none none none",
      },
    });
  });

  return () => mm.revert();
}
