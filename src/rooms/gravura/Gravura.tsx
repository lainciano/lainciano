"use client";

import Image from "next/image";
import { useRef } from "react";
import { useReadingMode } from "@/interaction/reading-mode/store";
import { useRoomAmbience } from "@/interaction/sound/useRoomAmbience";
import { gravura as copy } from "@/lib/content/copy";
import { useWebGL } from "@/rooms/shared/useWebGL";
import type { WebGLSceneContext } from "@/rooms/shared/webgl";
import { PORTRAIT, cropToCssBox } from "./crop";
import { IgniteButton } from "./IgniteButton";

const createGravura = (context: WebGLSceneContext) =>
  import("./scene").then((module) => module.createGravuraScene(context));

const CROP_BOX = cropToCssBox(PORTRAIT.crop);

// Retrato do Sobre (spec 7.3). A foto estática (cinza, alto contraste, mesmo recorte) é o conteúdo;
// a gravura WebGL monta por cima numa camada vazia e assume foco/teclado quando está viva.
export function Gravura() {
  const layerRef = useRef<HTMLDivElement>(null);
  const reading = useReadingMode();
  const { status } = useWebGL(layerRef, {
    enabled: !reading,
    create: createGravura,
    canvasClassName: "gravura__canvas",
  });
  useRoomAmbience("gravura", layerRef);
  const live = status === "live";

  return (
    <figure className="gravura__moldura">
      <div className="gravura__janela">
        <div className="gravura__recorte" style={CROP_BOX}>
          <Image
            src={PORTRAIT.src}
            alt={copy.photoAlt}
            fill
            preload
            sizes="(max-width: 48rem) 310vw, 1600px"
            draggable={false}
            className="gravura__foto"
          />
        </div>
        <div
          ref={layerRef}
          className="gravura__camada"
          tabIndex={live ? 0 : undefined}
          role={live ? "img" : undefined}
          aria-label={live ? copy.portraitLabel : undefined}
          data-verbo={live ? "segure" : undefined}
        />
      </div>
      <figcaption className="legenda-hq" aria-hidden="true">
        {copy.caption.before}
        <em>{copy.caption.key}</em>
        {copy.caption.after}
      </figcaption>
      {(reading || status === "fallback") && <IgniteButton />}
    </figure>
  );
}
