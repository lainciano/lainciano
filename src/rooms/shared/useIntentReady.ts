"use client";

import { useEffect, useState, type RefObject } from "react";
import { limiarStore } from "@/interaction/limiar/store";
import { INTENT_EVENTS, armIntentFallback } from "./intent";

/**
 * true na primeira intenção de usar a sala (ponteiro entrou, toque, foco) ou, no mais tardar, depois de
 * INTENT_FALLBACK_MS do `load`. A cena WebGL custa o parse do three e a compilação do shader: criada em
 * idle logo após o load ela caía dentro da janela do TBT (Fase 3 mediu +280 a +580 ms). Quem usa a sala
 * paga uma vez, no primeiro gesto; quem só olha, não paga. Com o Limiar aberto o prazo só conta depois que
 * ele fecha; os eventos de intenção no próprio elemento continuam valendo.
 */
export function useIntentReady(ref: RefObject<Element | null>): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let cancelFallback = () => {};
    const done = () => {
      cancelFallback();
      INTENT_EVENTS.forEach((type) => element.removeEventListener(type, done));
      window.removeEventListener("load", arm);
      setReady(true);
    };
    const arm = () => {
      cancelFallback = armIntentFallback(limiarStore, done);
    };
    INTENT_EVENTS.forEach((type) => element.addEventListener(type, done, { once: true, passive: true }));
    if (document.readyState === "complete") arm();
    else window.addEventListener("load", arm, { once: true });
    return () => {
      cancelFallback();
      INTENT_EVENTS.forEach((type) => element.removeEventListener(type, done));
      window.removeEventListener("load", arm);
    };
  }, [ref]);

  return ready;
}
