"use client";

import { lazy, Suspense, type ComponentProps } from "react";

// A sessão (comandos, parser, histórico) fica fora do JS inicial de toda rota (D1): o 404 raiz e o
// sobreposto entram no grafo de todas as páginas, então ela baixa por import() — no Contato e no 404
// junto da página (o HTML já vem do servidor), no sobreposto só na primeira abertura.
const Session = lazy(() => import("./ConsoleSession").then((m) => ({ default: m.ConsoleSession })));

export function LazyConsoleSession(props: ComponentProps<typeof Session>) {
  // Embutido: o quadro vazio já ocupa a altura do console, então a página não pula quando ele chega (CLS).
  const fallback = props.inline ? <div className={`console ${props.className ?? ""}`} aria-hidden="true" /> : null;
  return (
    <Suspense fallback={fallback}>
      <Session {...props} />
    </Suspense>
  );
}
