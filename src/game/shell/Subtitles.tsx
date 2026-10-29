"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { splitWords, wordStagger, type Line } from "./subtitles";

/** Quanto a fala demora para sair (espelha o `--motion-base` do tema): a palavra se apaga antes de sumir do DOM. */
const LEAVE_MS = 320;

/**
 * Legendas com presença (T10, bíblia 12b.2): serifa grande no terço de baixo, entrada palavra a palavra (o desfoque
 * some e a palavra sobe alguns px, em sequência), uma faixa escura que sobe do pé da tela SÓ enquanto há fala e um
 * fio vermelho curto acima. O rótulo (quem fala, o som) vai em mono pequeno acima. A região é `aria-live="polite"`
 * e está sempre no DOM (leitor de tela só anuncia o que entra numa região que já existe). `kind: "system"` são as
 * dicas do jogo ("nada ao alcance daqui"): mono pequeno, sem faixa. Movimento reduzido: aparece direto, sem animação.
 * Ilha da casca: texto por props, nada de copy.ts.
 */
export default function Subtitles({ line, seq, reduced, notice }: { line: Line | null; seq: number; reduced: boolean; notice: string | null }) {
  // Mantém a última fala por um instante depois de `line` virar null, para a saída animada. A troca de fala é
  // derivada durante a renderização (nada de setState dentro de efeito); só o fim da saída usa um temporizador.
  const [shown, setShown] = useState<{ line: Line; seq: number } | null>(null);
  if (line && shown?.seq !== seq) setShown({ line, seq });

  useEffect(() => {
    if (line || !shown) return;
    const timer = window.setTimeout(() => setShown(null), LEAVE_MS);
    return () => window.clearTimeout(timer);
  }, [line, shown]);

  // Fala nova aparece no mesmo quadro; sem fala, a última fica só enquanto sai (com movimento reduzido, nem isso).
  const isLeaving = !line && !reduced && !!shown;
  const current = notice ? null : line ? { line, seq } : reduced ? null : shown;
  const speaking = !!current && !isLeaving && (current.line.kind ?? "speech") !== "system";

  return (
    <div data-game-subtitles aria-live="polite" data-speaking={speaking ? "" : undefined}>
      {notice && <p data-game-paused>{notice}</p>}
      {current && <SpokenLine key={current.seq} line={current.line} reduced={reduced} leaving={isLeaving} />}
    </div>
  );
}

function SpokenLine({ line, reduced, leaving }: { line: Line; reduced: boolean; leaving: boolean }) {
  const words = splitWords(line.text);
  // Sem animação (reduzido) a fala já nasce "acesa"; com ela, dois quadros depois, para a transição correr.
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (reduced) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setOn(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [reduced]);
  const lit = reduced || on;

  const style = words.length > 29 ? ({ "--sub-word-stagger": `${wordStagger(words.length)}ms` } as CSSProperties) : undefined;
  return (
    <p data-game-line data-kind={line.kind ?? "speech"} data-on={lit && !leaving ? "" : undefined} data-leaving={leaving ? "" : undefined} style={style}>
      {line.label && <span data-game-label>{line.label}</span>}
      {words.map((word, i) => (
        <span key={i}>
          {i > 0 && " "}
          <span className="w" style={{ "--i": i } as CSSProperties}>
            {word}
          </span>
        </span>
      ))}
    </p>
  );
}
