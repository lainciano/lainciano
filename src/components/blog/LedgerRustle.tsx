"use client";

import { useRef, type ReactNode } from "react";
import { soundEngine } from "@/interaction/sound/engine";
import { createRateLimiter } from "@/interaction/sound/limiter";

/** No máximo 6 folhas por segundo ao varrer a lista (D9). */
export const RUSTLE_PER_SECOND = 6;

const limiter = createRateLimiter(RUSTLE_PER_SECOND, 1000);

// Som de "folha" ao passar o mouse por uma linha (spec 7.6). Delegação: as linhas seguem HTML do servidor.
export function LedgerRustle({ children, className }: { children: ReactNode; className?: string }) {
  const lastRowRef = useRef<Element | null>(null);
  return (
    <div
      className={className}
      onPointerOver={(event) => {
        if (event.pointerType !== "mouse") return;
        const row = (event.target as Element).closest(".ledger-row, .destaque");
        if (row === lastRowRef.current) return;
        lastRowRef.current = row;
        if (row && limiter.tryHit(performance.now())) soundEngine.noise("page");
      }}
      onPointerLeave={() => {
        lastRowRef.current = null;
      }}
    >
      {children}
    </div>
  );
}
