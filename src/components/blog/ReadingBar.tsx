"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { relicStore } from "@/interaction/relics/store";
import { READER, readingProgress, shouldUnlockReader } from "@/lib/reading";

// pointerdown cobre também o arrasto da barra de rolagem.
const INPUT_EVENTS = ["wheel", "touchmove", "keydown", "pointerdown"] as const;
// Margem: o timer pode disparar ~1 ms antes de performance.now() - mountedAt >= dwellMs.
const DWELL_TIMER_MS = READER.dwellMs + 50;
const subscribeNothing = () => () => {};

/**
 * Barra de leitura (spec 7.7): linha --sangue de 2 px no topo, acima do HUD, em portal no body (o HUD usa
 * mix-blend-mode: difference e um ancestral com transform quebraria o fixed). Mede o corpo (#targetId),
 * não a página, e dá a relíquia Leitor a quem rolou até 95% (D8). Mede no rAF, depois dos efeitos (lição 6).
 */
export function ReadingBar({ targetId }: { targetId: string }) {
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    const target = document.getElementById(targetId);
    if (mounted && !target && process.env.NODE_ENV !== "production") {
      console.warn(`[ReadingBar] #${targetId} nao encontrado; barra e relíquia Leitor inativas`);
    }
    if (!mounted || !bar || !target) return;
    const startY = window.scrollY;
    let mountedAt = performance.now();
    let interacted = false;
    let scrolled = false;
    let unlocked = false;
    let frame = 0;

    const measure = () => {
      frame = 0;
      const rect = target.getBoundingClientRect();
      const progress = readingProgress(rect.top, rect.height, window.innerHeight);
      bar.style.transform = `scaleX(${progress})`;
      if (unlocked || document.visibilityState !== "visible") return;
      const scrollable = document.documentElement.scrollHeight > window.innerHeight + 1;
      if (shouldUnlockReader({ progress, scrolled, scrollable, dwellMs: performance.now() - mountedAt })) {
        unlocked = true;
        relicStore.unlock("leitor");
      }
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    // Só rolagem que segue um gesto do visitante conta; a restauração de scroll do navegador não (D8).
    const onInput = () => {
      interacted = true;
    };
    const onScroll = () => {
      if (interacted && window.scrollY !== startY) scrolled = true;
      schedule();
    };
    // Tempo parado só conta com a aba visível: ao voltar, recomeça os 15 s.
    let dwell = window.setTimeout(schedule, DWELL_TIMER_MS);
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      mountedAt = performance.now();
      window.clearTimeout(dwell);
      dwell = window.setTimeout(schedule, DWELL_TIMER_MS);
      schedule();
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", schedule);
    for (const type of INPUT_EVENTS) window.addEventListener(type, onInput, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    schedule();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", schedule);
      for (const type of INPUT_EVENTS) window.removeEventListener(type, onInput);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearTimeout(dwell);
      window.cancelAnimationFrame(frame);
    };
  }, [mounted, targetId]);

  if (!mounted) return null;
  return createPortal(<div ref={barRef} className="reading-bar" aria-hidden="true" />, document.body);
}
