import type { Metadata } from "next";
import { SiteChrome } from "@/components/layout/SiteChrome";
import { PageContent } from "@/components/ui/PageContent";
import { RoomTitle } from "@/components/ui/RoomTitle";
import { TransitionLink } from "@/components/ui/TransitionLink";
import { ConsoleSession } from "@/interaction/console/ConsoleSession";
import { RoomSound } from "@/interaction/sound/RoomSound";
import { cryptEmpty, doors, terminal } from "@/lib/content/copy";
import { navLabel } from "@/lib/nav";

/** Spec 5: no 404, só um zumbido de fio fraco — a ambiência do Terminal bem baixa (D22). */
const CRYPT_HUM_LEVEL = 0.35;

export const metadata: Metadata = {
  title: cryptEmpty.title,
  robots: { index: false, follow: true },
};

const PATHS = [
  { href: "/", label: doors.homeLabel },
  { href: "/work", label: navLabel("/work") },
  { href: "/blog", label: navLabel("/blog") },
] as const;

// Cripta vazia (spec 7.9): fora do grupo (site), então traz a própria moldura (D2). Sem ExplorerMark:
// um endereço vazio não é sala.
export default function NotFound() {
  return (
    <SiteChrome>
      <PageContent>
        <RoomSound name="terminal" level={CRYPT_HUM_LEVEL} />
        <section data-rail={cryptEmpty.title} id="cripta-vazia" className="content-container cripta-vazia py-section">
          <RoomTitle title={cryptEmpty.title} role={cryptEmpty.lede} />
          <ConsoleSession inline greeting={terminal.notFoundGreeting} className="cripta-vazia__console" />
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
    </SiteChrome>
  );
}
