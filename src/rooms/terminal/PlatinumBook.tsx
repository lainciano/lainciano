"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import type { BookLabels } from "@/interaction/platinum/labels";
import { RELICS } from "@/interaction/relics/catalog";
import { formatElapsed } from "@/interaction/relics/state";
import { formatDate } from "@/lib/format";
import { fillTemplate } from "@/lib/template";
import { bookStore, type BookState } from "./bookStore";

// Snapshot do servidor: "idle" não renderiza nada, assim sem JS só a frase do <noscript> aparece.
const SERVER: BookState | { status: "idle" } = { status: "idle" };

// Livro dos que platinaram (spec 7.8): até 20 linhas, lido da API a cada visita ao Contato.
export function PlatinumBook({ labels }: { labels: BookLabels }) {
  const book = useSyncExternalStore(bookStore.subscribe, bookStore.getSnapshot, () => SERVER);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bookStore.load();
  }, []);

  // Retry: o botão some, então o foco vai para o contêiner persistente (nunca para o body).
  const retry = () => {
    wrapperRef.current?.focus();
    bookStore.load();
  };

  const entries = book.status === "ready" || book.status === "loading" ? book.entries : undefined;
  const live =
    book.status === "loading" && !entries
      ? labels.loading
      : book.status === "failed"
        ? labels.failed
        : book.status === "ready"
          ? book.entries.length === 0
            ? fillTemplate(labels.empty, { total: String(RELICS.length) })
            : fillTemplate(labels.rows, { n: book.entries.length })
          : "";

  return (
    <div ref={wrapperRef} tabIndex={-1} className="livro__contorno">
      {/* Região viva sempre montada: o texto entra depois, então o leitor de tela anuncia. */}
      <p role="status" className="sr-only">
        {live}
      </p>
      {book.status === "loading" && !entries && <p className="livro__estado">{labels.loading}</p>}
      {book.status === "failed" && (
        <div className="livro__estado">
          <p>{labels.failed}</p>
          <button type="button" className="hud-btn focus-ring" onClick={retry}>
            {labels.retry}
          </button>
        </div>
      )}
      {book.status === "ready" && book.entries.length === 0 && <p className="livro__estado">{fillTemplate(labels.empty, { total: String(RELICS.length) })}</p>}
      {entries && entries.length > 0 && (
        <table className="livro">
          <caption className="sr-only">{labels.caption}</caption>
          <thead>
            <tr>
              <th scope="col">{labels.position}</th>
              <th scope="col">{labels.nickname}</th>
              <th scope="col">{labels.time}</th>
              <th scope="col" className="livro__data">
                {labels.date}
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const day = new Date(entry.createdAt).toISOString().slice(0, 10);
              return (
                <tr key={`${entry.position}-${entry.createdAt}`} className={entry.position === 1 ? "livro__primeiro" : undefined}>
                  <td>{entry.position}</td>
                  <th scope="row" className="livro__apelido">
                    {entry.nickname}
                  </th>
                  <td>{formatElapsed(entry.elapsedMs)}</td>
                  <td className="livro__data">
                    <time dateTime={day}>{formatDate(day)}</time>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
