"use client";

import gsap from "gsap";
import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { useReadingMode } from "@/interaction/reading-mode/store";
import { TOAST_HOLD_MS, toastStore } from "./store";

export function Toast() {
  const message = useSyncExternalStore(toastStore.subscribe, toastStore.getSnapshot, () => null);
  const reading = useReadingMode();
  const boxRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!message || !box) return;
    const hide = () => toastStore.clear(message.id);
    if (reading) {
      const timer = window.setTimeout(hide, TOAST_HOLD_MS);
      return () => window.clearTimeout(timer);
    }
    const tl = gsap.timeline({ onComplete: hide });
    tl.fromTo(box, { yPercent: 140, rotate: -3 }, { yPercent: 0, rotate: 0, duration: 0.5, ease: "back.out(2)" }).to(
      box,
      { yPercent: 140, duration: 0.4, ease: "power2.in" },
      `+=${TOAST_HOLD_MS / 1000}`,
    );
    return () => {
      tl.kill();
    };
  }, [message, reading]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+var(--space-md))] z-[var(--z-toast)] flex justify-center px-[var(--space-sm)]"
    >
      {message && (
        <div
          ref={boxRef}
          key={message.id}
          className="shadow-hard flex max-w-full items-center gap-[var(--space-sm)] border-2 border-breu bg-osso px-[var(--space-md)] py-[var(--space-xs)] text-breu"
        >
          <span aria-hidden="true" className="font-gothic text-[2.125rem] font-black leading-none text-sangue">
            {message.sigil}
          </span>
          <span className="flex min-w-0 flex-col">
            <b className="font-mono text-sm uppercase tracking-[0.06em]">{message.title}</b>
            <span className="font-mono text-[0.8125rem]">{message.detail}</span>
          </span>
        </div>
      )}
    </div>
  );
}
