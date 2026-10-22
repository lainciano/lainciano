import type { ReactNode } from "react";
import { Footer } from "@/components/ui/Footer";
import { InteractionProvider } from "@/interaction/InteractionProvider";
import { LIMIAR_BOOT_SCRIPT } from "@/interaction/boot";
import type { ConsoleData } from "@/interaction/console/commands";
import { ConsoleOverlay } from "@/interaction/console/ConsoleOverlay";
import { ConsoleDataProvider } from "@/interaction/console/data";
import { Hud } from "@/interaction/hud/Hud";
import { Limiar } from "@/interaction/limiar/Limiar";
import { PlatinumHost } from "@/interaction/platinum/PlatinumHost";
import { limiar, platinum } from "@/lib/content/copy";
import { getPosts } from "@/lib/content/posts";
import { getProjects } from "@/lib/content/projects";
import { getSiteSettings } from "@/lib/content/site";

// Moldura de toda página da Cripta: HUD, Limiar, rodapé, núcleo de interação e console global.
// Usada pelo layout do (site) e pelo 404 da raiz (que fica fora do grupo — D2).
export function SiteChrome({ children }: { children: ReactNode }) {
  const site = getSiteSettings();
  const consoleData: ConsoleData = {
    projects: getProjects().map(({ slug, title, year, kind }) => ({ slug, title, year, kind })),
    posts: getPosts().map(({ slug, title, createdAt }) => ({ slug, title, createdAt })),
    email: site.email,
    availability: site.availability,
  };

  return (
    <InteractionProvider>
      <ConsoleDataProvider data={consoleData}>
        <Hud siteName={site.siteName} email={site.email} availability={site.availability} socialLinks={site.socialLinks} />
        <div className="page-shell relative z-10 bg-background pt-[var(--hud-h)]">
          <main className="page-surface">{children}</main>
          <Footer site={site} />
        </div>
        <Limiar siteName={site.siteName} labels={limiar} />
        {/* Precisa vir logo depois do <dialog id="limiar">: abre antes da hidratação. */}
        <script dangerouslySetInnerHTML={{ __html: LIMIAR_BOOT_SCRIPT }} />
        <ConsoleOverlay />
        <PlatinumHost labels={platinum} />
      </ConsoleDataProvider>
    </InteractionProvider>
  );
}
