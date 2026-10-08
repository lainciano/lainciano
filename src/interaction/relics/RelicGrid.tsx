"use client";

import { hud } from "@/lib/content/copy";
import { RELICS } from "./catalog";
import { useRelics } from "./store";

// Grade das 10 relíquias: bloqueadas mostram "???"; ganhas mostram sigilo, nome e como.
export function RelicGrid() {
  const { won } = useRelics();
  return (
    <ul className="grid grid-cols-2 border-l border-t border-linha sm:grid-cols-5">
      {RELICS.map((relic) => {
        const isWon = won.includes(relic.id);
        return (
          <li
            key={relic.id}
            className="flex min-h-[10.5rem] flex-col gap-[var(--space-2xs)] border-b border-r border-linha p-[var(--space-sm)]"
          >
            <span
              aria-hidden="true"
              className={`font-gothic text-[2.75rem] font-black leading-none ${isWon ? "text-sangue" : "text-linha"}`}
            >
              {relic.sigil}
            </span>
            <h3 className={`font-mono text-[0.9375rem] font-bold uppercase tracking-[0.06em] ${isWon ? "text-osso" : "text-cinza"}`}>
              {isWon ? relic.name : hud.locked}
            </h3>
            <p className={`font-mono text-[0.8125rem] leading-snug ${"text-cinza"}`}>
              {isWon ? relic.how : hud.lockedHow}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
