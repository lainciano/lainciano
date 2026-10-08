"use client";

import { useEffect, type RefObject } from "react";
import { ambienceDirector } from "./ambience";
import { ambienceLevel, type AmbienceName } from "./ambience-plan";

const THRESHOLDS = Array.from({ length: 21 }, (_, i) => i / 20);

/**
 * A sala pede sua ambiência enquanto está montada; trocar de rota faz o crossfade. Com `watch`, o volume
 * acompanha quanto da área está visível: rolar da Ruína para o Ofício abaixa o vento; voltar, sobe.
 */
export function useRoomAmbience(name: AmbienceName, watch?: RefObject<Element | null>) {
  useEffect(() => {
    ambienceDirector.enter(name);
    return () => ambienceDirector.leave(name);
  }, [name]);

  useEffect(() => {
    const element = watch?.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) ambienceDirector.setLevel(name, ambienceLevel(entry.isIntersecting ? entry.intersectionRatio : 0));
      },
      { threshold: THRESHOLDS },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [name, watch]);
}
