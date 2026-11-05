// Só tipos: as ilhas recebem os rótulos por props do servidor e nunca importam o copy.ts.
import type { game } from "@/lib/content/copy";

export type GameLabels = typeof game;
