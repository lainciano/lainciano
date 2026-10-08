import { MarqueeText } from "@/components/ui/MarqueeText";
import { CopyEmailButton } from "@/components/ui/CopyEmailButton";
import { TransitionLink } from "@/components/ui/TransitionLink";
import { footer as footerCopy } from "@/lib/content/copy";
import { NAV_LINKS } from "@/lib/nav";
import { SOCIAL_LABELS } from "@/lib/social";
import type { SiteSettings, SocialLinks } from "@/types/content";

type FooterProps = {
  site: SiteSettings;
};

export function Footer({ site }: FooterProps) {
  const availability = site.availability;
  const activeSocials = (
    Object.entries(site.socialLinks) as [keyof SocialLinks, string | null | undefined][]
  ).filter(([, url]) => Boolean(url));

  return (
    <footer className="relative z-10 w-full bg-background">
      <div className="bg-accent text-foreground">
        <div className="content-container grid grid-cols-1 gap-12 py-16 lg:grid-cols-2 lg:py-20">
          <div className="flex flex-col gap-6">
            <span className="wordmark text-large-heading">{site.siteName}</span>
            <div className="flex flex-col">
              <span className="text-small-heading italic text-foreground/90">
                {footerCopy.workDaysLabel}
              </span>
              <span className="text-small-heading">{footerCopy.workDays}</span>
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:items-end lg:text-right">
            <span className="text-large-heading">{availability}</span>
            <span className="text-small-heading text-foreground/90">
              {footerCopy.projectPrompt}
            </span>
            <CopyEmailButton
              email={site.email}
              className="text-small-heading w-fit text-foreground"
            />
          </div>
        </div>

        <div className="content-container border-t border-foreground/30 py-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Rodapé">
              {NAV_LINKS.map(({ href, label }) => (
                <TransitionLink
                  key={href}
                  href={href}
                  className="link-underline text-small-heading"
                >
                  {label}
                </TransitionLink>
              ))}
            </nav>

            {activeSocials.length > 0 && (
              <ul className="flex flex-wrap gap-x-5 gap-y-2">
                {activeSocials.map(([key, url]) => (
                  <li key={key}>
                    <a
                      href={url!}
                      target={url!.startsWith("http") ? "_blank" : undefined}
                      rel={url!.startsWith("http") ? "noopener noreferrer" : undefined}
                      className="link-underline caps"
                    >
                      {SOCIAL_LABELS[key]}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-hidden bg-background py-6">
        <MarqueeText
          text={site.siteName}
          direction="rtl"
          repeat={4}
          wordmark
          className="px-[var(--edge-padding)] text-accent"
        />
      </div>
    </footer>
  );
}
