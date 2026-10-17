import { terminal as copy } from "@/lib/content/copy";

// Reserva se o pedaço do console não baixar (deploy novo no meio da visita, rede ruim): a página segue de pé.
export function ConsoleUnavailable() {
  return (
    <section className="console" aria-label={copy.overlayLabel}>
      <p className="console__linha console__linha--err" role="status">
        {copy.unavailable}
      </p>
    </section>
  );
}
