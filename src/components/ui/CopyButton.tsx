"use client";

import { useEffect, useRef, useState } from "react";
import { soundEngine } from "@/interaction/sound/engine";
import { copyText } from "@/lib/clipboard";

/** Spec 8.1: rótulo "copiado" por 1,5 s. */
export const COPIED_MS = 1500;

type CopyButtonProps = {
  /** Texto fixo, ou lido no clique a partir do botão (o código de um bloco, Fase 5). */
  text: string | ((button: HTMLButtonElement) => string);
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

  const feedback = state === "done" ? doneLabel : state === "fail" ? failLabel : null;

  return (
    <>
      <button
        type="button"
        className={`hud-btn focus-ring ${className}`.trim()}
        onClick={async (event) => {
          const value = typeof text === "function" ? text(event.currentTarget) : text;
          const copied = value !== "" && (await copyText(value));
          soundEngine.play(copied ? "copy" : "error");
          setState(copied ? "done" : "fail");
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => setState("idle"), COPIED_MS);
        }}
      >
        {feedback ?? label}
      </button>
      {/* Região viva irmã: o anúncio não depende de o próprio botão trocar de rótulo. */}
      <span role="status" className="sr-only">
        {feedback}
      </span>
    </>
  );
}
