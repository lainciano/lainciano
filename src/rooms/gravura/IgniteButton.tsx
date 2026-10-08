"use client";

import { useEffect, useRef, useState } from "react";
import { relicStore } from "@/interaction/relics/store";
import { gravura as copy } from "@/lib/content/copy";
import { INK } from "./ink";

// Modo leitura ou WebGL indisponível: manter o botão pressionado 1,4 s acende o retrato (spec 8.4).
export function IgniteButton() {
  const [done, setDone] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const frameRef = useRef(0);

  // Sair do modo leitura no meio do segurar (ou desmontar) não pode deixar o rAF correndo nem ganhar a relíquia.
  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  const stop = () => {
    cancelAnimationFrame(frameRef.current);
    buttonRef.current?.style.setProperty("--carga", "0");
  };

  const start = () => {
    if (done) return;
    const startedAt = performance.now();
    const step = () => {
      const progress = Math.min((performance.now() - startedAt) / INK.holdRelicMs, 1);
      buttonRef.current?.style.setProperty("--carga", String(progress));
      if (progress >= 1) {
        relicStore.unlock("sangue");
        setDone(true);
        return;
      }
      frameRef.current = requestAnimationFrame(step);
    };
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(step);
  };

  return (
    <button
      ref={buttonRef}
      type="button"
      className="gravura__acender focus-ring"
      data-done={done ? "on" : undefined}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(event) => {
        if ((event.key === " " || event.key === "Enter") && !event.repeat) {
          event.preventDefault();
          start();
        }
      }}
      onKeyUp={(event) => {
        if (event.key === " " || event.key === "Enter") stop();
      }}
    >
      <span>{done ? copy.ignited : copy.ignite}</span>
      {!done && <span className="gravura__acender-dica">{copy.igniteHint}</span>}
    </button>
  );
}
