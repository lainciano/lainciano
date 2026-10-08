"use client";

import { useEffect } from "react";
import { ambienceDirector } from "./ambience";
import type { AmbienceName } from "./ambience-plan";

/** A sala pede sua ambiência enquanto está montada; trocar de rota faz o crossfade. */
export function useRoomAmbience(name: AmbienceName) {
  useEffect(() => {
    ambienceDirector.enter(name);
    return () => ambienceDirector.leave(name);
  }, [name]);
}
