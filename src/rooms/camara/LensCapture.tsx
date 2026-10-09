"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { useReadingMode } from "@/interaction/reading-mode/store";
import { useRoomAmbience } from "@/interaction/sound/useRoomAmbience";
import { camara as copy } from "@/lib/content/copy";
import { useIntentReady } from "@/rooms/shared/useIntentReady";
import { useWebGL } from "@/rooms/shared/useWebGL";
import type { WebGLSceneContext } from "@/rooms/shared/webgl";

type LensCaptureProps = { src: string; alt: string; title: string };

// Captura do case (spec 7.5). A <img> com alt é o conteúdo (em cores sem JS, em modo leitura e se o
// WebGL cair); a gravura com lente monta por cima numa camada vazia, em idle depois do LCP (D2).
export function LensCapture({ src, alt, title }: LensCaptureProps) {
  const frameRef = useRef<HTMLElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const reading = useReadingMode();
  const intent = useIntentReady(frameRef);
  const [percent, setPercent] = useState(0);
  const { status } = useWebGL(layerRef, {
    enabled: !reading && intent,
    create: (context: WebGLSceneContext) =>
      import("./scene").then((module) => module.createLensScene(context, { onProgress: setPercent })),
    canvasClassName: "camara__canvas",
  });
  useRoomAmbience("vela", frameRef);
  const live = status === "live";

  return (
    <figure ref={frameRef} className="camara__moldura" data-fallback={status === "fallback" ? "on" : undefined}>
      <div className="camara__janela">
        <Image
          src={src}
          alt={alt}
          fill
          preload
          sizes="(max-width: 63.99rem) calc(100vw - 2rem), 62vw"
          draggable={false}
          className="camara__foto"
        />
        <div
          ref={layerRef}
          className="camara__camada"
          tabIndex={live ? 0 : undefined}
          role={live ? "img" : undefined}
          aria-label={live ? copy.captureLabel(title) : undefined}
          data-verbo={live ? "revele" : undefined}
        />
      </div>
      {live && percent > 0 && (
        <span className="camara__revelado text-verb" aria-hidden="true">
          {copy.revealed(percent)}
        </span>
      )}
      <figcaption className="legenda-hq" aria-hidden="true">
        <span className="legenda-hq__mouse">
          {copy.caption.before}
          <em>{copy.caption.key}</em>
          {copy.caption.after}
        </span>
        <span className="legenda-hq__toque">
          {copy.captionTouch.before}
          <em>{copy.captionTouch.key}</em>
          {copy.captionTouch.after}
        </span>
      </figcaption>
    </figure>
  );
}
