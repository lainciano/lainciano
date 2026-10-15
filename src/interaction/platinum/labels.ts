// Só tipos: as ilhas recebem os rótulos por props do servidor e nunca importam o copy.ts (lição da Fase 5).
import type { book, platinum } from "@/lib/content/copy";

export type PlatinumLabels = typeof platinum;
export type BookLabels = typeof book;
