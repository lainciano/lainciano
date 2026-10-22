"use client";

import { lazy, Suspense, useEffect } from "react";
import { gameStore, readActivation, useGameOpen } from "./activation";
import type { GameLabels } from "./labels";

// O shell só baixa na primeira abertura; o host não importa three, zod nem copy.ts.
const GameShell = lazy(() => import("./shell/GameShell"));

export function GameHost({ labels }: { labels: GameLabels }) {
  const open = useGameOpen();

  useEffect(() => {
    const { persist, cleanSearch } = readActivation(window.location.search, gameStore.isEnabled() ? "on" : null);
    if (cleanSearch !== window.location.search) {
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${cleanSearch}${window.location.hash}`);
    }
    if (persist === "on") {
      gameStore.setEnabled(true);
      // Modo leitura: grava a chave, mas o jogo não abre.
      if (document.documentElement.dataset.reading !== "on") gameStore.requestOpen();
    }
  }, []);

  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <GameShell labels={labels} onExit={gameStore.close} />
    </Suspense>
  );
}
