"use client";

import { useRef, type ReactNode } from "react";
import { useReadingMode } from "@/interaction/reading-mode/store";
import { contact as copy } from "@/lib/content/copy";
import { useIntentReady } from "@/rooms/shared/useIntentReady";
import { useWebGL } from "@/rooms/shared/useWebGL";
import type { WebGLSceneContext } from "@/rooms/shared/webgl";

// Altar do Terminal (spec 7.8): o quadro ASCII estático (children, do servidor) fica até a cena nascer na
// primeira intenção de uso (lição 2); sem JS, em modo leitura e em webglcontextlost, ele é o que se vê.
export function AsciiRelic({ children }: { children: ReactNode }) {
  const altarRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const reading = useReadingMode();
  const intent = useIntentReady(altarRef);
  const { status } = useWebGL(layerRef, {
    enabled: !reading && intent,
    create: (context: WebGLSceneContext) => import("./scene").then((module) => module.createAsciiScene(context)),
    canvasClassName: "altar__gl",
  });

  return (
    <div
      ref={altarRef}
      className="altar"
      data-live={status === "live" ? "on" : undefined}
      data-verbo="gire"
      data-own-feedback
      tabIndex={0}
      role="img"
      aria-label={copy.altarLabel}
    >
      {children}
      <div ref={layerRef} className="altar__camada" aria-hidden="true" />
      <span className="altar__rotulo" aria-hidden="true">
        <span className="legenda-hq__mouse">{copy.altarHintMouse}</span>
        <span className="legenda-hq__toque">{copy.altarHintTouch}</span>
      </span>
    </div>
  );
}
