import { CopyEmailButton } from "@/components/ui/CopyEmailButton";
import { LinkHover } from "@/components/ui/LinkHover";
import { MobileMenu } from "@/components/ui/MobileMenu";
import { TransitionLink } from "@/components/ui/TransitionLink";
import { NAV_LINKS } from "@/lib/nav";
import type { SocialLinks } from "@/types/content";

type HeaderProps = {
  siteName?: string;
  email?: string;
  availability?: string;
  socialLinks?: SocialLinks;
};

export function Header({
  siteName = "Lain",
  email = "hello@example.com",
  availability = "Disponível a partir de julho de 2026",
  socialLinks = {},
}: HeaderProps) {
  return (
    <header className="site-header sticky top-0 z-20 border-b border-secondary/40 bg-background">
      <div className="content-container flex items-center justify-between gap-6 py-4">
        <div className="flex items-center gap-6">
          <TransitionLink
            href="/"
            transitionDirection="back"
            className="text-3xl md:text-5xl text-accent font-bold uppercase transition-colors hover:text-hover"
          >
            {siteName}
          </TransitionLink>

          <div className="hidden items-center gap-2 lg:flex">
            <CopyEmailButton email={email} className="text-small-body text-muted" />
            <span aria-hidden="true" className="text-accent">
              ✦
            </span>
            <span className="text-small-body italic text-muted">{availability}</span>
          </div>
        </div>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Principal">
          {NAV_LINKS.map(({ href, label }) => (
            <LinkHover key={href} href={href} className="text-small-heading text-muted">
              {label}
            </LinkHover>
          ))}
        </nav>

        <MobileMenu
          siteName={siteName}
          email={email}
          availability={availability}
          navLinks={NAV_LINKS}
          socialLinks={socialLinks}
        />
      </div>
    </header>
  );
}
