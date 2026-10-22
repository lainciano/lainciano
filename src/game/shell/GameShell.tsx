"use client";

import { useEffect, useRef } from "react";
import type { GameLabels } from "../labels";
import "./shell.css";
import { useGameSession } from "./useGameSession";

/**
 * Casca do jogo: um painel fixo sobre o site (irmão do .page-shell, fora do template). O palco recebe o
 * canvas na Task 5; as camadas de UI (prompt, legendas, painéis) nascem vazias e ficam sobre ele.
 * Esc nunca fecha: o navegador reserva a tecla; sair é o botão (e, depois, o menu do jogo).
 */
export default function GameShell({ labels, onExit }: { labels: GameLabels; onExit: () => void }) {
  const shellRef = useRef<HTMLDivElement>(null);
  useGameSession();

  // O site fica inerte: o foco vai para a casca (que não é tabulável) e o Tab segue dali para o botão.
  useEffect(() => {
    shellRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div ref={shellRef} data-game-shell role="region" aria-label={labels.region} tabIndex={-1}>
      <div data-game-stage />
      <p data-game-loading>{labels.loading}</p>
      <div data-game-prompt />
      <div data-game-subtitles aria-live="polite" />
      <div data-game-overlay />
      <button type="button" data-game-exit onClick={onExit} className="focus-ring">
        {labels.exit}
      </button>
    </div>
  );
}
