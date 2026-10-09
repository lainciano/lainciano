"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { ConsoleSession } from "./ConsoleSession";
import { ConsoleUnavailable } from "./ConsoleUnavailable";

// Só no navegador (ssr: false): o 404 fica no grafo de toda rota, então nem o HTML nem o JS da sessão entram
// nele (D1). Enquanto carrega, um quadro vazio do tamanho do console evita salto de layout.
const Session = dynamic(() => import("./ConsoleSession").then((m) => m.ConsoleSession).catch(() => ConsoleUnavailable), {
  ssr: false,
  loading: () => <div className="console cripta-vazia__console" aria-hidden="true" />,
});

export function ClientConsoleSession(props: ComponentProps<typeof ConsoleSession>) {
  return <Session {...props} />;
}
