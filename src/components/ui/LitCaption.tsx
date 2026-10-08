"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Fragment, useEffect, useRef } from "react";
import { useReadingMode } from "@/interaction/reading-mode/store";
import type { RelicId } from "@/interaction/relics/catalog";
import { relicStore } from "@/interaction/relics/store";
import { isCaptionComplete, litCount, splitCaption } from "./lit-caption";

gsap.registerPlugin(ScrollTrigger);

type LitCaptionProps = {
  paragraphs: readonly string[];
  keywords?: readonly string[];
  /** Relíquia ganha quando a legenda acende inteira (em modo leitura: ao chegar ao fim dela). */
  relic?: RelicId;
  className?: string;
};

// Legenda que acende palavra por palavra no scroll (spec 7.0; protótipo leitura()).
// O HTML do servidor já vem todo aceso: sem JS e em modo leitura nada se apaga.
export function LitCaption({ paragraphs, keywords = [], relic, className = "" }: LitCaptionProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const reading = useReadingMode();
  const lines = splitCaption(paragraphs, keywords);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const complete = () => {
      if (relic) relicStore.unlock(relic);
    };

    if (reading) {
      // Alternativa da relíquia Leitura: o fim da legenda passar dos 45% de cima da viewport.
      const end = root.querySelector("[data-lit-end]");
      if (!end) return;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry?.isIntersecting) complete();
        },
        { rootMargin: "0px 0px -55% 0px" },
      );
      observer.observe(end);
      return () => observer.disconnect();
    }

    const words = Array.from(root.querySelectorAll<HTMLElement>("[data-lit-word]"));
    const apply = (progress: number) => {
      const lit = litCount(progress, words.length);
      words.forEach((word, index) => word.toggleAttribute("data-on", index < lit));
      if (isCaptionComplete(progress)) complete();
    };
    root.dataset.lit = "armed";
    const trigger = ScrollTrigger.create({
      trigger: root,
      start: "top 80%",
      end: "bottom 45%",
      scrub: true,
      onUpdate: (self) => apply(self.progress),
    });
    apply(trigger.progress);
    return () => {
      trigger.kill();
      delete root.dataset.lit;
      words.forEach((word) => word.removeAttribute("data-on"));
    };
  }, [reading, relic]);

  return (
    <div ref={rootRef} className={`lit-caption ${className}`.trim()}>
      {lines.map((words, line) => (
        <p key={line}>
          {words.map((word, index) => (
            <Fragment key={index}>
              <span data-lit-word className={word.key ? "lit-word lit-word--key" : "lit-word"}>
                {word.text}
              </span>{" "}
            </Fragment>
          ))}
          {line === lines.length - 1 && <span data-lit-end aria-hidden="true" />}
        </p>
      ))}
    </div>
  );
}
