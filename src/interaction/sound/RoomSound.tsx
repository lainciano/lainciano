"use client";

import type { AmbienceName } from "./ambience-plan";
import { useRoomAmbience } from "./useRoomAmbience";

/** Para páginas de servidor: pede a ambiência da área enquanto a página está na tela (não renderiza nada). */
export function RoomSound({ name }: { name: AmbienceName }) {
  useRoomAmbience(name);
  return null;
}
