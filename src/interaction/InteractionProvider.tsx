"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Cursor } from "@/interaction/cursor/Cursor";
import { vibrate } from "@/interaction/haptics";
import { ProgressRail } from "@/interaction/hud/ProgressRail";
import { readingStore } from "@/interaction/reading-mode/store";
import { RELICS } from "@/interaction/relics/catalog";
import { relicStore } from "@/interaction/relics/store";
import { soundEngine } from "@/interaction/sound/engine";
import { Toast } from "@/interaction/toast/Toast";
import { toastStore } from "@/interaction/toast/store";
import { hud } from "@/lib/content/copy";

const INTERACTIVE = "a, button, [role='button'], summary";

// Núcleo client-side da Cripta: inicializa stores e liga o feedback global (spec 8.1).
export function InteractionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const firstPath = useRef(true);

  useEffect(() => {
    readingStore.init();
    soundEngine.init();
    relicStore.hydrate();

    const offUnlock = relicStore.onUnlock((relic, state, becamePlatinum) => {
      toastStore.show({
        sigil: relic.sigil,
        title: `${hud.relicPrefix} ${relic.name}`,
        detail: hud.progress(state.won.length, RELICS.length),
      });
      soundEngine.play(becamePlatinum ? "platinum" : "relic");
      vibrate(becamePlatinum ? [20, 40, 20, 40, 20] : [10, 30, 10]);
    });

    let lastHover: Element | null = null;
    const onOver = (event: PointerEvent) => {
      const target = (event.target as Element | null)?.closest(INTERACTIVE) ?? null;
      if (target && target !== lastHover) soundEngine.play("tick");
      lastHover = target;
    };
    const onClick = (event: MouseEvent) => {
      if ((event.target as Element | null)?.closest(INTERACTIVE)) soundEngine.play("click");
    };
    document.addEventListener("pointerover", onOver);
    document.addEventListener("click", onClick);
    return () => {
      offUnlock();
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("click", onClick);
    };
  }, []);

  useEffect(() => {
    if (firstPath.current) {
      firstPath.current = false;
      return;
    }
    soundEngine.play("door");
  }, [pathname]);

  return (
    <>
      {children}
      <Cursor />
      <Toast />
      <ProgressRail />
    </>
  );
}
