"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { relicStore } from "@/interaction/relics/store";
import { READER, readingProgress, shouldUnlockReader } from "@/lib/reading";

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
    if (!mounted || !bar || !target) return;
    const startY = window.scrollY;
    const mountedAt = performance.now();
    let scrolled = false;
    let unlocked = false;
    let frame = 0;

    const measure = () => {
      frame = 0;
      const rect = target.getBoundingClientRect();
      const progress = readingProgress(rect.top, rect.height, window.innerHeight);
      bar.style.transform = `scaleX(${progress})`;
      if (unlocked) return;
      const scrollable = document.documentElement.scrollHeight > window.innerHeight + 1;
      if (shouldUnlockReader({ progress, scrolled, scrollable, dwellMs: performance.now() - mountedAt })) {
        unlocked = true;
        relicStore.unlock("leitor");
      }
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    const onScroll = () => {
      if (window.scrollY !== startY) scrolled = true;
      schedule();
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", schedule);
    const dwell = window.setTimeout(schedule, READER.dwellMs);
    schedule();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", schedule);
      window.clearTimeout(dwell);
      window.cancelAnimationFrame(frame);
    };
  }, [mounted, targetId]);

  if (!mounted) return null;
  return createPortal(<div ref={barRef} className="reading-bar" aria-hidden="true" />, document.body);
}
