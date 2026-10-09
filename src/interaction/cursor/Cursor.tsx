"use client";

import gsap from "gsap";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { useReadingMode } from "@/interaction/reading-mode/store";
import { soundEngine } from "@/interaction/sound/engine";
import { magnetOffset } from "./magnet";
import { cursorStore } from "./store";

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
  // O GSAP anima este elemento interno, não o popover: ao medir um elemento `position: fixed` (sem offsetParent)
  // ele o remove e reinsere no DOM, e isso fecha o popover da camada superior.
  const moverRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const chargeRef = useRef<SVGCircleElement>(null);
  const active = finePointer && !reading;

  useEffect(() => {
    const root = rootRef.current;
    const mover = moverRef.current;
    if (!active || !root || !mover) return;
    document.documentElement.dataset.cursor = "on";

    // Camada superior (Popover API): o Portal e a gaveta de relíquias são <dialog> modais, que ficam
    // acima de qualquer z-index. Sem isto, com o cursor do sistema oculto, não haveria cursor neles.
    const raise = () => {
      if (typeof root.showPopover !== "function") return;
      try {
        if (root.matches(":popover-open")) root.hidePopover();
        root.showPopover();
      } catch {
        // popover indisponível: o anel fica com o z-index normal
      }
    };
    raise();
    const dialogWatcher = new MutationObserver(() => raise());
    dialogWatcher.observe(document.body, { attributes: true, attributeFilter: ["open"], subtree: true });
    const moveX = gsap.quickTo(mover, "x", { duration: 0.18, ease: "power3" });
    const moveY = gsap.quickTo(mover, "y", { duration: 0.18, ease: "power3" });
    let magnet: Element | null = null;
    let zone: HTMLElement | null = null;

    const onMove = (event: PointerEvent) => {
      root.dataset.hidden = "off";
      if (magnet) {
        const pull = magnetOffset(event.clientX, event.clientY, magnet.getBoundingClientRect());
        moveX(event.clientX + pull.x);
        moveY(event.clientY + pull.y);
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

    const press = () => {
      root.dataset.press = "on";
    };
    const release = () => {
      root.dataset.press = "off";
    };
    window.addEventListener("pointerdown", press);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerover", onOver);
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointerdown", press);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerover", onOver);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      offCharge();
      dialogWatcher.disconnect();
      try {
        if (root.matches(":popover-open")) root.hidePopover();
      } catch {}
      delete document.documentElement.dataset.cursor;
    };
  }, [active]);

  if (!active) return null;

  return (
    <div ref={rootRef} className="cursor-cripta" popover="manual" aria-hidden="true" data-zone="off" data-link="off" data-hidden="on">
      <div ref={moverRef} className="cursor-cripta__mover">
        <span className="cursor-cripta__anel" />
        <svg className="cursor-cripta__carga" viewBox="0 0 74 74">
          <circle ref={chargeRef} cx="37" cy="37" r="34" pathLength={1} strokeDasharray="1" strokeDashoffset="1" />
        </svg>
        <span ref={labelRef} className="cursor-cripta__verbo text-verb" />
      </div>
    </div>
  );
}
