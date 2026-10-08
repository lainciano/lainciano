"use client";

import gsap from "gsap";
import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { chapters as copy } from "@/lib/content/copy";
import { CHAPTERS } from "./chapters";
import { roomCardStore } from "./store";

/** Tempos do cartão (s): entrada das letras, parada para ler e saída em cortina. Total ≈ 2,3 s; qualquer gesto pula. */
const CARD = { letters: 0.9, stagger: 0.055, hold: 0.55, exit: 0.7, skipTo: 0.22 } as const;

// Cartão cinematográfico de entrada de sala: numeral do capítulo, título gótico que se fecha de letras
// espaçadas e desfocadas, linha em --sangue, epígrafe e saída em cortina. Decorativo (aria-hidden):
// a página já tem o próprio título; nunca aparece em modo leitura nem na primeira carga.
export function RoomCard() {
  const chapter = useSyncExternalStore(roomCardStore.subscribe, roomCardStore.getSnapshot, () => null);
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!chapter || !root) return;
    const letters = root.querySelectorAll(".room-card__letra");
    const title = root.querySelector(".room-card__titulo");
    const tl = gsap.timeline({ onComplete: () => roomCardStore.clear() });
    tl.from(root.querySelector(".room-card__numeral"), { opacity: 0, scale: 1.25, duration: 1.2, ease: "expo.out" }, 0)
      .from(root.querySelector(".room-card__capitulo"), { opacity: 0, y: 14, duration: 0.6, ease: "power3.out" }, 0.1)
      .from(title, { letterSpacing: "0.32em", duration: CARD.letters + 0.3, ease: "expo.out" }, 0.1)
      .from(
        letters,
        { yPercent: 70, opacity: 0, skewX: -14, filter: "blur(14px)", duration: CARD.letters, stagger: CARD.stagger, ease: "expo.out" },
        0.1,
      )
      .from(root.querySelector(".room-card__linha"), { scaleX: 0, duration: 0.8, ease: "expo.inOut" }, 0.35)
      .from(root.querySelector(".room-card__epigrafe"), { opacity: 0, y: 12, duration: 0.7, ease: "power3.out" }, 0.7)
      .addLabel("exit", `+=${CARD.hold}`)
      .to(title, { scale: 1.06, opacity: 0, duration: CARD.exit * 0.8, ease: "power2.in" }, "exit")
      .to(root, { clipPath: "inset(0 0 100% 0)", duration: CARD.exit, ease: "expo.inOut" }, "exit");

    // Qualquer gesto leva direto à saída (rápido); durante a saída não faz nada.
    const skip = () => {
      if (tl.time() < (tl.labels.exit ?? 0)) {
        // tweenTo pausa a timeline ao começar: é preciso retomá-la ao chegar na saída, senão a cortina nunca roda.
        tl.tweenTo("exit", { duration: CARD.skipTo, ease: "power2.out", onComplete: () => void tl.play() });
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab") skip();
    };
    const block = (event: Event) => {
      event.preventDefault();
      skip();
    };
    root.addEventListener("pointerdown", skip);
    root.addEventListener("wheel", block, { passive: false });
    root.addEventListener("touchmove", block, { passive: false });
    window.addEventListener("keydown", onKey);
    return () => {
      tl.kill();
      root.removeEventListener("pointerdown", skip);
      root.removeEventListener("wheel", block);
      root.removeEventListener("touchmove", block);
      window.removeEventListener("keydown", onKey);
    };
  }, [chapter]);

  if (!chapter) return null;

  return (
    <div ref={rootRef} className="room-card" aria-hidden="true" data-lenis-prevent>
      <span className="room-card__numeral">{chapter.numeral}</span>
      <p className="room-card__capitulo text-verb">{copy.label(chapter.numeral, CHAPTERS[CHAPTERS.length - 1].numeral)}</p>
      <p className="room-card__titulo">
        {Array.from(chapter.title).map((letter, index) => (
          <span key={index} className="room-card__letra">
            {letter}
          </span>
        ))}
      </p>
      <span className="room-card__linha" />
      <p className="room-card__epigrafe">{chapter.epigraph}</p>
      <span className="room-card__pular text-verb">{copy.skip}</span>
    </div>
  );
}
