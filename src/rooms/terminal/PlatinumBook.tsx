"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { BookLabels } from "@/interaction/platinum/labels";
import { formatElapsed } from "@/interaction/relics/state";
import { formatDate } from "@/lib/format";
import { bookStore, type BookState } from "./bookStore";

// Snapshot do servidor: "idle" não renderiza nada, assim sem JS só a frase do <noscript> aparece.
const SERVER: BookState | { status: "idle" } = { status: "idle" };

// Livro dos que platinaram (spec 7.8): até 20 linhas, lido da API a cada visita ao Contato.
export function PlatinumBook({ labels }: { labels: BookLabels }) {
  const book = useSyncExternalStore(bookStore.subscribe, bookStore.getSnapshot, () => SERVER);

  useEffect(() => {
    bookStore.load();
  }, []);

  if (book.status === "idle") return null;
  if (book.status === "loading") {
    return (
      <p className="livro__estado" role="status">
        {labels.loading}
      </p>
    );
  }
  if (book.status === "failed") {
    return (
      <div className="livro__estado">
        <p role="alert">{labels.failed}</p>
        <button type="button" className="hud-btn focus-ring" onClick={() => bookStore.load()}>
          {labels.retry}
        </button>
      </div>
    );
  }
  if (book.entries.length === 0) {
    return <p className="livro__estado">{labels.empty}</p>;
  }
  return (
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
        {book.entries.map((entry) => (
          <tr key={`${entry.position}-${entry.createdAt}`} className={entry.position === 1 ? "livro__primeiro" : undefined}>
            <td>{entry.position}</td>
            <td className="livro__apelido">{entry.nickname}</td>
            <td>{formatElapsed(entry.elapsedMs)}</td>
            <td className="livro__data">{formatDate(new Date(entry.createdAt).toISOString().slice(0, 10))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
