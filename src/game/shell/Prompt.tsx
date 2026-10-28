/**
 * Aviso de interação (T9): uma linha pequena sob a mira, só com o objeto mirado e ao alcance. Sem caixa pesada:
 * a tecla (E, ou "segure E"), o verbo e, nos objetos de segurar, o anel de progresso. Ilha da casca: os rótulos
 * descem por props (nada de copy.ts aqui) e nenhum módulo lazy importa o react-dom.
 */
export default function Prompt({ text, keyLabel, progress }: { text: string | null; keyLabel: string; progress: number | null }) {
  if (!text) return null;
  const ring = progress !== null;
  return (
    <div data-game-prompt data-hold={ring ? "" : undefined}>
      {ring && (
        <svg data-game-ring viewBox="0 0 20 20" aria-hidden="true" focusable="false">
          <circle className="track" cx="10" cy="10" r="7" />
          <circle className="fill" cx="10" cy="10" r="7" pathLength="1" style={{ strokeDashoffset: 1 - Math.min(1, Math.max(0, progress)) }} />
        </svg>
      )}
      <kbd>{keyLabel}</kbd>
      <span>{text}</span>
    </div>
  );
}
