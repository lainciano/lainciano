"use client";

import { useEffect, useRef, useState } from "react";
import { soundEngine } from "@/interaction/sound/engine";
import { copyText } from "@/lib/clipboard";

/** Spec 8.1: rótulo "copiado" por 1,5 s. */
export const COPIED_MS = 1500;

type CopyButtonProps = {
  text: string;
  label: string;
  doneLabel: string;
  failLabel: string;
  className?: string;
};

// Copiar para a área de transferência com rótulo de retorno e bip duplo (spec 8.1). Reutilizável (Fase 5).
export function CopyButton({ text, label, doneLabel, failLabel, className = "" }: CopyButtonProps) {
  const [state, setState] = useState<"idle" | "done" | "fail">("idle");
  const timer = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <button
      type="button"
      className={`hud-btn focus-ring ${className}`.trim()}
      aria-live="polite"
      onClick={async () => {
        const copied = await copyText(text);
        soundEngine.play(copied ? "copy" : "error");
        setState(copied ? "done" : "fail");
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setState("idle"), COPIED_MS);
      }}
    >
      {state === "done" ? doneLabel : state === "fail" ? failLabel : label}
    </button>
  );
}
