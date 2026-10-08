"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ReactLenis, useLenis } from "lenis/react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { createBackgroundProgress } from "@/animations/backgroundProgress";
import { useReadingMode } from "@/interaction/reading-mode/store";
import { registerLenisControls, resumeLenis } from "@/lib/lenis-bridge";

gsap.registerPlugin(useGSAP, ScrollTrigger);

type SmoothScrollProps = {
  children: React.ReactNode;
};

function ScrollBridge() {
  const pathname = usePathname();
  const lenis = useLenis(() => ScrollTrigger.update());

  useEffect(() => {
    if (!lenis) {
      registerLenisControls(null);
      return;
    }

    registerLenisControls({
      stop: () => lenis.stop(),
      start: () => lenis.start(),
    });

    return () => registerLenisControls(null);
  }, [lenis]);

  useGSAP(() => {
    lenis?.scrollTo(0, { immediate: true });
    resumeLenis();
    ScrollTrigger.refresh();
    return createBackgroundProgress();
  }, [pathname, lenis]);

  useEffect(() => {
    const refresh = () => {
      lenis?.resize();
      ScrollTrigger.refresh();
    };

    refresh();
    window.addEventListener("load", refresh);
    window.addEventListener("resize", refresh);

    return () => {
      window.removeEventListener("load", refresh);
      window.removeEventListener("resize", refresh);
    };
  }, [lenis]);

  return null;
}

export function SmoothScroll({ children }: SmoothScrollProps) {
  const reading = useReadingMode();
  return (
    <ReactLenis root options={{ lerp: 0.1, duration: 1.2, smoothWheel: !reading }}>
      <ScrollBridge />
      {children}
    </ReactLenis>
  );
}
