"use client";

import { useEffect, useState } from "react";

/** Prazo máximo do requestIdleCallback; sem a API, metade disso por setTimeout. */
export const IDLE_TIMEOUT_MS = 2000;

/**
 * true depois do `load` e de um momento ocioso (D2): as cenas WebGL nascem depois do LCP, sem
 * disputar a thread principal com a hidratação (a Fase 2 mediu TBT 282–863 ms criando cedo).
 */
export function useIdleReady(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let idleId: number | null = null;
    let timer: number | null = null;
    const done = () => {
      if (!cancelled) setReady(true);
    };
    const schedule = () => {
      if (typeof window.requestIdleCallback === "function") {
        idleId = window.requestIdleCallback(done, { timeout: IDLE_TIMEOUT_MS });
      } else {
        timer = window.setTimeout(done, IDLE_TIMEOUT_MS / 2);
      }
    };
    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener("load", schedule);
      if (idleId !== null) window.cancelIdleCallback(idleId);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  return ready;
}
