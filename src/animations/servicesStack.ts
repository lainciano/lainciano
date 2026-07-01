import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

// Desktop: espalhamento horizontal (cartas jogadas lateralmente) → grid alinhado.
const DESKTOP_SCATTER = [
  { xPercent: 55, yPercent: 60, rotation: -16 },
  { xPercent: 0, yPercent: 90, rotation: 12 },
  { xPercent: -55, yPercent: 60, rotation: -8 },
];

function stackCardsDesktop(
  section: HTMLElement,
  cards: HTMLElement[],
  restingRotations: number[],
) {
  const scrollConfig = {
    trigger: section,
    start: "top 85%",
    end: "center 55%",
    scrub: 0.6,
  };

  cards.forEach((card, index) => {
    const from = DESKTOP_SCATTER[index % DESKTOP_SCATTER.length];
    gsap.fromTo(
      card,
      {
        xPercent: from.xPercent,
        yPercent: from.yPercent,
        rotation: from.rotation,
        scale: 0.88,
        autoAlpha: 0.45,
      },
      {
        xPercent: 0,
        yPercent: 0,
        rotation: restingRotations[index] ?? 0,
        scale: 1,
        autoAlpha: 1,
        ease: "none",
        scrollTrigger: scrollConfig,
      },
    );
  });
}

// Anima os cards de serviço "se juntando como cartas" conforme o usuário rola — DESKTOP apenas.
//
// No mobile a metáfora de baralho empilhado (marginTop negativo colapsando o fluxo) deixava os
// cards fisicamente sobrepostos e opacos, com texto sobre texto e ilegível. Por isso o mobile
// não recebe animação de layout: os cards seguem o fluxo natural do grid `grid-cols-1`
// (legível, sem rotação — a rotação de repouso é `md:` no CSS do ServiceCard).
//
// Desativado em prefers-reduced-motion.
export function createServicesStack(
  section: HTMLElement,
  cards: HTMLElement[],
  restingRotations: number[],
): () => void {
  const mm = gsap.matchMedia();

  mm.add("(min-width: 768px) and (prefers-reduced-motion: no-preference)", () => {
    stackCardsDesktop(section, cards, restingRotations);
  });

  return () => mm.revert();
}
