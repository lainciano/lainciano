"use client";

import type { Ref } from "react";
import { hud } from "@/lib/content/copy";
import { RelicGrid } from "./RelicGrid";

// Gaveta modal do inventário, aberta pelo contador do HUD (showModal → foco preso, Esc fecha).
export function RelicDrawer({ ref }: { ref: Ref<HTMLDialogElement> }) {
  return (
    <dialog
      ref={ref}
      aria-labelledby="relic-drawer-title"
      className="relic-drawer"
      data-lenis-prevent
      onClick={(event) => {
        // Só o backdrop fecha: cliques no padding do próprio dialog ficam dentro do retângulo.
        const box = event.currentTarget.getBoundingClientRect();
        const inside =
          event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
        if (!inside) event.currentTarget.close();
      }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-[var(--space-sm)]">
        <h2 id="relic-drawer-title" className="text-room-title !text-[clamp(2.5rem,6vw,4.5rem)]">
          {hud.drawerTitle}
        </h2>
        <form method="dialog">
          <button type="submit" className="hud-btn focus-ring">
            {hud.close}
          </button>
        </form>
      </div>
      <p className="text-room-role">{hud.drawerRole}</p>
      <RelicGrid />
    </dialog>
  );
}
