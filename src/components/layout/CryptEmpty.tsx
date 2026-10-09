import { PageContent } from "@/components/ui/PageContent";
import { TransitionLink } from "@/components/ui/TransitionLink";
import { ClientConsoleSession } from "@/interaction/console/ClientConsoleSession";
import { ClientRoomSound } from "@/interaction/sound/ClientRoomSound";
import { cryptEmpty, doors, terminal } from "@/lib/content/copy";
import { navLabel } from "@/lib/nav";

/** Spec 5: no 404, só um zumbido de fio fraco — a ambiência do Terminal bem baixa (D22). */
const CRYPT_HUM_LEVEL = 0.35;

const PATHS = [
  { href: "/", label: doors.homeLabel },
  { href: "/work", label: navLabel("/work") },
  { href: "/blog", label: navLabel("/blog") },
] as const;

// Corpo da Cripta vazia (spec 7.9), sem moldura: o 404 da raiz o envolve em SiteChrome (D2). Slugs de
// case/post inexistentes também chegam aqui (dynamicParams = false). Sem ExplorerMark: endereço vazio não é sala.
export function CryptEmpty() {
  return (
    <PageContent>
      <ClientRoomSound name="terminal" level={CRYPT_HUM_LEVEL} />
      <section data-rail={cryptEmpty.title} id="cripta-vazia" className="content-container cripta-vazia py-section">
        {/* Título estático: o RoomTitle (GSAP) puxaria ~17 KB gzip para o JS inicial de toda rota (D1). */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-[var(--space-xl)] gap-y-[var(--space-sm)]">
          <h1 className="text-room-title">{cryptEmpty.title}</h1>
          <p className="text-room-role">{cryptEmpty.lede}</p>
        </div>
        <ClientConsoleSession inline greeting={terminal.notFoundGreeting} className="cripta-vazia__console" />
        <nav aria-label={cryptEmpty.pathsLabel}>
          <ul className="cripta-vazia__caminhos">
            {PATHS.map((path) => (
              <li key={path.href}>
                <TransitionLink href={path.href} className="hud-btn focus-ring">
                  {path.label}
                </TransitionLink>
              </li>
            ))}
          </ul>
        </nav>
      </section>
    </PageContent>
  );
}
