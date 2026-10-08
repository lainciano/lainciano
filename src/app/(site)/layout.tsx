import { Footer } from "@/components/ui/Footer";
import { InteractionProvider } from "@/interaction/InteractionProvider";
import { PORTAL_BOOT_SCRIPT } from "@/interaction/boot";
import { Hud } from "@/interaction/hud/Hud";
import { Portal } from "@/interaction/portal/Portal";
import { getSiteSettings } from "@/lib/content/site";

export default function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const site = getSiteSettings();

  return (
    <InteractionProvider>
      <Hud
        siteName={site.siteName}
        email={site.email}
        availability={site.availability}
        socialLinks={site.socialLinks}
      />
      <div className="page-shell relative z-10 bg-background pt-[var(--hud-h)]">
        <main className="page-surface">{children}</main>
        <Footer site={site} />
      </div>
      <Portal siteName={site.siteName} />
      {/* Precisa vir logo depois do <dialog id="portal">: abre antes da hidratação. */}
      <script dangerouslySetInnerHTML={{ __html: PORTAL_BOOT_SCRIPT }} />
    </InteractionProvider>
  );
}
