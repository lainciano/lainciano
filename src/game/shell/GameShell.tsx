"use client";

import type { GameLabels } from "../labels";

// Stub da Task 1: a Task 4 troca isto pelo shell real (tela cheia, travamento do mouse, pausa).
export default function GameShell({ labels, onExit }: { labels: GameLabels; onExit: () => void }) {
  return (
    <div
      data-game-shell
      role="region"
      aria-label={labels.region}
      className="fixed inset-0 z-[var(--z-limiar)] flex flex-col items-center justify-center gap-[var(--space-md)] bg-background text-foreground"
    >
      <p>{labels.loading}</p>
      <button type="button" onClick={onExit} className="focus-ring border border-current px-4 py-2">
        {labels.exit}
      </button>
    </div>
  );
}
