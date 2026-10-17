"use client";

import { useRef } from "react";
import { hud } from "@/lib/content/copy";
import { soundEngine, useVolume } from "./engine";
import { volumeToPercent } from "./volume";

/** Intervalo mínimo entre prévias enquanto o controle é arrastado (ms). */
const PREVIEW_EVERY_MS = 180;

type VolumeControlProps = {
  id: string;
  /** Versão enxuta para o HUD (sem rótulo visível). */
  compact?: boolean;
  className?: string;
};

// Controle de volume com prévia sonora (Portal, HUD e menu mobile). Teclado: setas ajustam e tocam a prévia.
export function VolumeControl({ id, compact = false, className = "" }: VolumeControlProps) {
  const volume = useVolume();
  const percent = volumeToPercent(volume);
  const text = percent === 0 ? hud.muted : `${percent}%`;
  const lastPreview = useRef(0);

  return (
    <div className={`volume ${compact ? "volume--compacto" : ""} ${className}`.trim()} data-own-feedback>
      <label htmlFor={id} className={compact ? "sr-only" : "volume__rotulo text-verb"}>
        {hud.volume}
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={1}
        value={percent}
        aria-valuetext={text}
        className="volume__faixa focus-ring"
        style={{ "--volume": `${percent}%` } as React.CSSProperties}
        onChange={(event) => {
          soundEngine.setVolume(Number(event.target.value) / 100);
          const now = performance.now();
          if (now - lastPreview.current >= PREVIEW_EVERY_MS) {
            lastPreview.current = now;
            soundEngine.preview();
          }
        }}
        // Ao soltar (mouse, toque ou tecla) sempre toca a prévia final no volume escolhido.
        onPointerUp={() => soundEngine.preview()}
        onKeyUp={(event) => {
          if (event.key.startsWith("Arrow") || event.key === "Home" || event.key === "End") soundEngine.preview();
        }}
      />
      <output htmlFor={id} className="volume__valor">
        {text}
      </output>
    </div>
  );
}
