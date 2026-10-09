"use client";

import gsap from "gsap";
import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { createPortal } from "react-dom";
import { soundEngine } from "@/interaction/sound/engine";
import { createRateLimiter } from "@/interaction/sound/limiter";
import { useIntentReady } from "@/rooms/shared/useIntentReady";
import { useWebGL } from "@/rooms/shared/useWebGL";
import type { WebGLSceneContext } from "@/rooms/shared/webgl";
import { createPreviewChannel } from "./channel";
import { PREVIEW, anchorPreview, placePreview, tiltFor } from "./preview";

/** "Risco" de troca de linha: no máximo 8 por segundo (D22). */
const SCRATCH_PER_SECOND = 8;

const subscribeNothing = () => () => {};

type PreviewFollowerProps = {
  listRef: RefObject<HTMLElement | null>;
  previews: Record<string, string>;
};

/**
 * Prévia flutuante (spec 7.4): elemento fixed NORMAL (não popover) num portal em document.body; o GSAP
 * anima só o filho __mover (lição da Fase 2: GSAP reinsere fixed ao medir). Mouse: segue o cursor com
 * atraso e inclina pela velocidade. Teclado: ancora à direita da linha focada. Decorativa (aria-hidden).
 */
export function PreviewFollower({ listRef, previews }: PreviewFollowerProps) {
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const rootRef = useRef<HTMLDivElement>(null);
  const moverRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const [channel] = useState(createPreviewChannel);
  const intent = useIntentReady(listRef);

  useWebGL(layerRef, {
    enabled: intent,
    create: (context: WebGLSceneContext) =>
      import("./scene").then((module) => module.createPreviewScene(context, { channel, sources: previews })),
    canvasClassName: "relicario-previa__canvas",
  });

  useEffect(() => {
    const list = listRef.current;
    const root = rootRef.current;
    const mover = moverRef.current;
    if (!list || !root || !mover) return;
    root.dataset.on = "off";
    const moveX = gsap.quickTo(mover, "x", { duration: PREVIEW.followS, ease: "power3" });
    const moveY = gsap.quickTo(mover, "y", { duration: PREVIEW.followS, ease: "power3" });
    const tilt = gsap.quickTo(mover, "rotation", { duration: PREVIEW.tiltS, ease: "power3" });
    const limiter = createRateLimiter(SCRATCH_PER_SECOND, 1000);
    let active: HTMLElement | null = null;
    let anchored = false;
    let placed = false;
    let last: { x: number; y: number; t: number } | null = null;
    let tiltTimer = 0;
    let scrollFrame = 0;

    const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });
    const rowOf = (target: EventTarget | null) =>
      target instanceof Element ? target.closest<HTMLElement>("[data-slug]") : null;

    const go = (point: { x: number; y: number }) => {
      if (!placed) {
        gsap.set(mover, { x: point.x, y: point.y, rotation: 0 }); // reaparece no lugar, sem voar
        placed = true;
        return;
      }
      moveX(point.x);
      moveY(point.y);
    };

    const setActive = (row: HTMLElement | null) => {
      if (row === active) return;
      active?.removeAttribute("data-active");
      active = row;
      if (row) {
        row.setAttribute("data-active", "on");
        if (limiter.tryHit(performance.now())) soundEngine.noise("scratch");
      } else {
        placed = false;
      }
      root.dataset.on = row ? "on" : "off";
      channel.set(row?.dataset.slug ?? null);
    };

    const anchorTo = (row: HTMLElement) => go(anchorPreview(row.getBoundingClientRect(), viewport()));

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      anchored = false;
      // Nas bordas entre linhas o alvo é o <li>: mantém a linha atual em vez de piscar.
      const row = rowOf(event.target) ?? active;
      if (!row) return;
      setActive(row);
      go(placePreview({ x: event.clientX, y: event.clientY }, viewport()));
      const now = performance.now();
      if (last) tilt(tiltFor((event.clientX - last.x) / Math.max(1, now - last.t)));
      last = { x: event.clientX, y: event.clientY, t: now };
      window.clearTimeout(tiltTimer);
      tiltTimer = window.setTimeout(() => tilt(0), PREVIEW.tiltResetMs);
    };

    const onPointerLeave = () => {
      if (anchored) return;
      last = null;
      setActive(null);
    };

    const onFocusIn = (event: FocusEvent) => {
      const row = rowOf(event.target);
      // Clique também foca o link: só o foco por teclado ancora a prévia.
      if (!row || !row.matches(":focus-visible")) return;
      anchored = true;
      setActive(row);
      tilt(0);
      anchorTo(row);
    };

    const onFocusOut = (event: FocusEvent) => {
      if (event.relatedTarget instanceof Node && list.contains(event.relatedTarget)) return;
      if (!anchored) return;
      anchored = false;
      setActive(null);
    };

    const onScroll = () => {
      if (scrollFrame) return;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0;
        if (anchored && active) {
          anchorTo(active);
          return;
        }
        if (!last) return;
        // A lista andou sob o cursor parado: a linha sob ele passa a ser a ativa.
        const under = document.elementFromPoint(last.x, last.y);
        const row = under && list.contains(under) ? rowOf(under) : null;
        if (!row) {
          last = null;
          setActive(null);
          return;
        }
        setActive(row);
      });
    };

    list.addEventListener("pointermove", onPointerMove);
    list.addEventListener("pointerleave", onPointerLeave);
    list.addEventListener("focusin", onFocusIn);
    list.addEventListener("focusout", onFocusOut);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      list.removeEventListener("pointermove", onPointerMove);
      list.removeEventListener("pointerleave", onPointerLeave);
      list.removeEventListener("focusin", onFocusIn);
      list.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("scroll", onScroll);
      window.clearTimeout(tiltTimer);
      if (scrollFrame) cancelAnimationFrame(scrollFrame);
      active?.removeAttribute("data-active");
      channel.set(null);
      gsap.killTweensOf(mover);
    };
  }, [listRef, channel]);

  if (!mounted) return null;

  return createPortal(
    <div ref={rootRef} className="relicario-previa" aria-hidden="true">
      <div ref={moverRef} className="relicario-previa__mover">
        <div ref={layerRef} className="relicario-previa__camada" />
      </div>
    </div>,
    document.body,
  );
}
