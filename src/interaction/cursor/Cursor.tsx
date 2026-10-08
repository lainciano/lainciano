"use client";

import gsap from "gsap";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { useReadingMode } from "@/interaction/reading-mode/store";
import { soundEngine } from "@/interaction/sound/engine";
import { cursorStore } from "./store";

const MAGNET = 0.3;

function subscribeFinePointer(callback: () => void) {
  const mq = window.matchMedia("(pointer: fine)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

// Anel que segue o ponteiro, mostra o verbo de zonas [data-verbo], puxa para links (ímã) e desenha a carga.
export function Cursor() {
  const reading = useReadingMode();
  const finePointer = useSyncExternalStore(
    subscribeFinePointer,
    () => window.matchMedia("(pointer: fine)").matches,
    () => false,
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const chargeRef = useRef<SVGCircleElement>(null);
  const active = finePointer && !reading;

  useEffect(() => {
    const root = rootRef.current;
    if (!active || !root) return;
    document.documentElement.dataset.cursor = "on";
    const moveX = gsap.quickTo(root, "x", { duration: 0.18, ease: "power3" });
    const moveY = gsap.quickTo(root, "y", { duration: 0.18, ease: "power3" });
    let magnet: Element | null = null;
    let zone: HTMLElement | null = null;

    const onMove = (event: PointerEvent) => {
      root.dataset.hidden = "off";
      if (magnet) {
        const r = magnet.getBoundingClientRect();
        moveX(event.clientX + (r.left + r.width / 2 - event.clientX) * MAGNET);
        moveY(event.clientY + (r.top + r.height / 2 - event.clientY) * MAGNET);
      } else {
        moveX(event.clientX);
        moveY(event.clientY);
      }
    };
    const onOver = (event: PointerEvent) => {
      const target = event.target as Element | null;
      const nextZone = target?.closest<HTMLElement>("[data-verbo]") ?? null;
      if (nextZone !== zone && nextZone) soundEngine.play("tick");
      zone = nextZone;
      root.dataset.zone = zone ? "on" : "off";
      if (zone && labelRef.current) labelRef.current.textContent = zone.dataset.verbo ?? "";
      magnet = zone ? null : (target?.closest("a, button, [role='button'], summary, label") ?? null);
      root.dataset.link = magnet ? "on" : "off";
    };
    const onLeave = () => {
      root.dataset.hidden = "on";
    };
    const offCharge = cursorStore.onCharge((value) => {
      root.dataset.charging = value > 0 ? "on" : "off";
      chargeRef.current?.setAttribute("stroke-dashoffset", String(1 - value));
    });

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerover", onOver);
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerover", onOver);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      offCharge();
      delete document.documentElement.dataset.cursor;
    };
  }, [active]);

  if (!active) return null;

  return (
    <div ref={rootRef} className="cursor-cripta" aria-hidden="true" data-zone="off" data-link="off" data-hidden="on">
      <span className="cursor-cripta__anel" />
      <svg className="cursor-cripta__carga" viewBox="0 0 74 74">
        <circle ref={chargeRef} cx="37" cy="37" r="34" pathLength={1} strokeDasharray="1" strokeDashoffset="1" />
      </svg>
      <span ref={labelRef} className="cursor-cripta__verbo text-verb" />
    </div>
  );
}
