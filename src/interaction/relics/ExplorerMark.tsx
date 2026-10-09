"use client";

import { useEffect } from "react";
import type { ExplorerArea } from "./explorer";
import { explorerStore } from "./explorer-store";

/**
 * Marca a área da página para o Explorador. Adiado um tique: os efeitos desta marca rodam antes dos do
 * InteractionProvider (pai), e o aviso da relíquia precisa do onUnlock dele já registrado (lição 6).
 */
export function ExplorerMark({ area }: { area: ExplorerArea }) {
  useEffect(() => {
    const id = window.setTimeout(() => explorerStore.visit(area), 0);
    return () => window.clearTimeout(id);
  }, [area]);
  return null;
}
