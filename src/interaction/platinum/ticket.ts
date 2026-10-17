import { relicStore } from "@/interaction/relics/store";
import { requestTicket } from "./api";

let inFlight: Promise<boolean> | null = null;

/** Garante o bilhete da run (D4). Sem rede ou sem segredo, devolve false e tenta de novo depois. */
export function ensureRunTicket(): Promise<boolean> {
  if (relicStore.getSnapshot().ticket) return Promise.resolve(true);
  inFlight ??= requestTicket()
    .then((ticket) => {
      if (ticket) relicStore.attachTicket(ticket);
      return Boolean(ticket);
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
