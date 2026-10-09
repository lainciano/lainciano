"use client";

import { useRef, type ReactNode } from "react";
import { useReadingMode } from "@/interaction/reading-mode/store";
import { useRoomAmbience } from "@/interaction/sound/useRoomAmbience";
import { useMediaQuery } from "@/rooms/shared/useMediaQuery";
import { PreviewFollower } from "./PreviewFollower";

/** A prévia flutuante só existe com mouse de verdade e tela ≥ 768 px (spec 7.4: mobile sem prévia). */
const PREVIEW_MEDIA = "(hover: hover) and (pointer: fine) and (min-width: 48rem)";

type RelicarioProps = {
  /** slug → URL otimizada da captura para a textura da prévia (getImageProps no servidor, D6). */
  previews: Record<string, string>;
  children: ReactNode;
};

// Relicário (spec 7.4): a lista é HTML do servidor (children); a ilha só acrescenta a prévia e a
// ambiência de vela, cujo volume acompanha quanto do índice está visível (D21).
export function Relicario({ previews, children }: RelicarioProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const reading = useReadingMode();
  const fine = useMediaQuery(PREVIEW_MEDIA);
  useRoomAmbience("vela", listRef);

  return (
    <div ref={listRef}>
      {children}
      {fine && !reading && <PreviewFollower listRef={listRef} previews={previews} />}
    </div>
  );
}
