import type { Metadata } from "next";
import { AvailabilitySeal } from "@/components/ui/AvailabilitySeal";
import { CopyButton } from "@/components/ui/CopyButton";
import { PageContent } from "@/components/ui/PageContent";
import { RoomDoor } from "@/components/ui/RoomDoor";
import { RoomTitle } from "@/components/ui/RoomTitle";
import { LazyConsoleSession } from "@/interaction/console/LazyConsoleSession";
import { ExplorerMark } from "@/interaction/relics/ExplorerMark";
import { RelicGrid } from "@/interaction/relics/RelicGrid";
import { RoomSound } from "@/interaction/sound/RoomSound";
import { book, contact, contactCta, doors, rooms, terminal } from "@/lib/content/copy";
import { getSiteSettings } from "@/lib/content/site";
import { buildMailtoUrl } from "@/lib/mailto";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { AsciiRelic } from "@/rooms/terminal/AsciiRelic";
import { PlatinumBook } from "@/rooms/terminal/PlatinumBook";
import { ALTAR_STILL } from "@/rooms/terminal/still";

export const metadata: Metadata = buildPageMetadata({
  title: "Contato",
  description: "Vamos conversar sobre seu próximo projeto.",
  path: "/contact",
});

// Contato — Terminal (spec 7.8): relíquia ASCII + console embutido; o e-mail fica visível e copiável
// sem o console; o inventário mostra as relíquias.
export default function ContactPage() {
  const site = getSiteSettings();
  const mailto = buildMailtoUrl(site.email, { subject: contactCta.mailtoSubject, body: contactCta.mailtoBody });

  return (
    <PageContent>
      <ExplorerMark area="contact" />
      <RoomSound name="terminal" />
      <section data-rail={rooms.contact.title} id="terminal" className="content-container pb-section">
        <RoomTitle title={rooms.contact.title} role={rooms.contact.role} />
        <div className="terminal__sala">
          <AsciiRelic>
            <pre className="altar__still" aria-hidden="true">
              {ALTAR_STILL}
            </pre>
          </AsciiRelic>
          <LazyConsoleSession inline greeting={terminal.greeting} />
        </div>
      </section>

      <section
        data-rail={contact.emailHeading}
        id="escreva"
        aria-labelledby="escreva-titulo"
        className="content-container contato pb-section"
      >
        <h2 id="escreva-titulo" className="text-room-subtitle">
          {contact.emailHeading}
        </h2>
        <p className="contato__email">{site.email}</p>
        <div className="contato__acoes">
          <CopyButton text={site.email} label={contact.copy} doneLabel={contact.copied} failLabel={contact.copyFailed} />
          <a href={mailto} className="hud-btn focus-ring">
            {contact.write}
          </a>
        </div>
        <AvailabilitySeal text={site.availability} />
      </section>

      <section
        data-rail={contact.relicsHeading}
        id="reliquias"
        aria-labelledby="reliquias-titulo"
        className="content-container pb-section"
      >
        <div className="mb-[var(--space-lg)] flex flex-wrap items-baseline justify-between gap-[var(--space-sm)]">
          <h2 id="reliquias-titulo" className="text-room-subtitle">
            {contact.relicsHeading}
          </h2>
          <p className="text-room-role">{contact.relicsRole}</p>
        </div>
        <RelicGrid />
      </section>

      <section data-rail={book.rail} id="livro" aria-labelledby="livro-titulo" className="content-container pb-section">
        <div className="mb-[var(--space-lg)] flex flex-wrap items-baseline justify-between gap-[var(--space-sm)]">
          <h2 id="livro-titulo" className="text-room-subtitle">
            {book.heading}
          </h2>
          <p className="text-room-role">{book.role}</p>
        </div>
        <noscript>
          <p className="livro__estado">{book.noscript}</p>
        </noscript>
        <PlatinumBook labels={book} />
      </section>

      <RoomDoor href="/" room={rooms.home.title} label={doors.homeLabel} />
    </PageContent>
  );
}
