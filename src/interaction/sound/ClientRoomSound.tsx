"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { RoomSound } from "./RoomSound";

// Ambiência não tem HTML: carrega só no navegador para não entrar no JS inicial de quem importa isto (404 raiz).
const Sound = dynamic(() => import("./RoomSound").then((m) => m.RoomSound), { ssr: false });

export function ClientRoomSound(props: ComponentProps<typeof RoomSound>) {
  return <Sound {...props} />;
}
