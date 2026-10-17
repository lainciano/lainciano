"use client";

import { useEffect, useState, type RefObject } from "react";
import { INTENT_EVENTS, INTENT_FALLBACK_MS } from "./intent";

/**
 * true na primeira intenção de usar a sala (ponteiro entrou, toque, foco) ou, no mais tardar, depois de
 * INTENT_FALLBACK_MS do `load`. A cena WebGL custa o parse do three e a compilação do shader: criada em
 * idle logo após o load ela caía dentro da janela do TBT (Fase 3 mediu +280 a +580 ms). Quem usa a sala
 * paga uma vez, no primeiro gesto; quem só olha, não paga.
 */
export function useIntentReady(ref: RefObject<Element | null>): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let timer = 0;
    const done = () => {
      if (timer) window.clearTimeout(timer);
      INTENT_EVENTS.forEach((type) => element.removeEventListener(type, done));
      window.removeEventListener("load", arm);
      setReady(true);
    };
    const arm = () => {
      timer = window.setTimeout(done, INTENT_FALLBACK_MS);
    };
    INTENT_EVENTS.forEach((type) => element.addEventListener(type, done, { once: true, passive: true }));
    if (document.readyState === "complete") arm();
    else window.addEventListener("load", arm, { once: true });
    return () => {
      if (timer) window.clearTimeout(timer);
      INTENT_EVENTS.forEach((type) => element.removeEventListener(type, done));
      window.removeEventListener("load", arm);
    };
  }, [ref]);

  return ready;
}
