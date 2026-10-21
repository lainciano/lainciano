"use client";

import type { StageProps } from "./Limiar";

// Provisório (Tarefa 5): só fecha o contrato do import() da casca. A Tarefa 6 troca pelo palco real.
export default function LimiarStage({ onComplete }: StageProps) {
  return (
    <div className="limiar__som">
      <button type="button" autoFocus className="limiar__porta focus-ring" onClick={onComplete}>
        avançar
      </button>
    </div>
  );
}
