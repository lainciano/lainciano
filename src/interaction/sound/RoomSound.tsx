"use client";

import { useEffect } from "react";
import { ambienceDirector } from "./ambience";
import type { AmbienceName } from "./ambience-plan";
import { useRoomAmbience } from "./useRoomAmbience";

type RoomSoundProps = {
  name: AmbienceName;
  /** Volume fixo (0–1) da ambiência nesta página — o 404 usa o terminal mais baixo (zumbido fraco). */
  level?: number;
};

/** Para páginas de servidor: pede a ambiência da área enquanto a página está na tela (não renderiza nada). */
export function RoomSound({ name, level }: RoomSoundProps) {
  useRoomAmbience(name);
  useEffect(() => {
    if (level !== undefined) ambienceDirector.setLevel(name, level);
  }, [name, level]);
  return null;
}
