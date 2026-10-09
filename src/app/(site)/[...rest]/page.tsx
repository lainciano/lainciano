import { notFound } from "next/navigation";

// Pega toda URL sem rota para que o 404 saia dentro do layout do (site) (HUD, rodapé, console) — um
// not-found na raiz com SiteChrome custou ~20 KB gzip no JS inicial de todas as rotas.
export default function CatchAll() {
  notFound();
}
