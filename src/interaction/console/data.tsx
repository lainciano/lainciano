"use client";

import { createContext, use, type ReactNode } from "react";
import type { ConsoleData } from "./commands";

const ConsoleDataContext = createContext<ConsoleData | null>(null);

/** Projetos, posts e contato lidos no servidor (SiteChrome) para o console (D3). */
export function ConsoleDataProvider({ data, children }: { data: ConsoleData; children: ReactNode }) {
  return <ConsoleDataContext value={data}>{children}</ConsoleDataContext>;
}

export function useConsoleData(): ConsoleData {
  const data = use(ConsoleDataContext);
  if (!data) throw new Error("console: ConsoleDataProvider ausente");
  return data;
}
