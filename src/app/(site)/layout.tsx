import { Footer } from "@/components/ui/Footer";
import { Header } from "@/components/ui/Header";
import { RouteBanner } from "@/components/ui/RouteBanner";
import { getSiteSettings } from "@/lib/content/site";

export default function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const site = getSiteSettings();

  return (
    <>
      {/* Banner fixo (z-0): única camada atrás. Shell opaco (z-10) rola por cima. */}
      <RouteBanner siteName={site.siteName} />

      <div className="page-shell relative z-10 bg-background">
        <Header
          siteName={site.siteName}
          email={site.email}
          availability={site.availability}
          socialLinks={site.socialLinks}
        />
        <main className="page-surface">{children}</main>
        <Footer site={site} />
      </div>
    </>
  );
}
