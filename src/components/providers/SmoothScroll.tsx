"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { createBackgroundProgress } from "@/animations/backgroundProgress";
import { useReadingMode } from "@/interaction/reading-mode/store";
import { getLenis, registerLenisControls, releaseNavigationHold, setLenis } from "@/lib/lenis-bridge";
import { afterLoadIdle, loadGsap, whenGsap } from "@/lib/motion";

type SmoothScrollProps = {
  children: React.ReactNode;
};

// Lenis e GSAP/ScrollTrigger nascem depois do primeiro paint (Fase 8): até lá a rolagem é a nativa e o
// conteúdo já está inteiro. O Lenis é recriado ao entrar/sair do modo leitura (smoothWheel).
function useLenisEngine(reading: boolean) {
  useEffect(() => {
    let lenis: import("lenis").default | null = null;
    let detach: (() => void) | undefined;
    let cancelled = false;
    const stopIdle = afterLoadIdle(() => {
      void Promise.all([import("lenis"), loadGsap()]).then(([{ default: Lenis }, { ScrollTrigger }]) => {
        if (cancelled) return;
        lenis = new Lenis({ lerp: 0.1, duration: 1.2, smoothWheel: !reading, autoRaf: true });
        lenis.on("scroll", ScrollTrigger.update);
        setLenis(lenis);
        registerLenisControls({ stop: () => lenis?.stop(), start: () => lenis?.start() });
        const refresh = () => {
          lenis?.resize();
          ScrollTrigger.refresh();
        };
        refresh();
        window.addEventListener("resize", refresh);
        detach = () => window.removeEventListener("resize", refresh);
      });
    });
    return () => {
      cancelled = true;
      stopIdle();
      detach?.();
      registerLenisControls(null);
      setLenis(null);
      lenis?.destroy();
    };
  }, [reading]);
}

function ScrollBridge() {
  const pathname = usePathname();

  // A cada rota: volta ao topo, solta a pausa da navegação e rearma a barra de fundo.
  useEffect(() => {
    getLenis()?.scrollTo(0, { immediate: true });
    releaseNavigationHold();
    return whenGsap((lib) => {
      lib.ScrollTrigger.refresh();
      return createBackgroundProgress(lib);
    });
  }, [pathname]);

  return null;
}

export function SmoothScroll({ children }: SmoothScrollProps) {
  const reading = useReadingMode();
  useLenisEngine(reading);
  return (
    <>
      <ScrollBridge />
      {children}
    </>
  );
}
