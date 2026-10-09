"use client";

import { usePathname } from "next/navigation";
import { useRef } from "react";
import { MobileMenu } from "@/components/ui/MobileMenu";
import { TransitionLink } from "@/components/ui/TransitionLink";
import { readingStore, useReadingMode } from "@/interaction/reading-mode/store";
import { RELICS } from "@/interaction/relics/catalog";
import { RelicDrawer } from "@/interaction/relics/RelicDrawer";
import { useRelics } from "@/interaction/relics/store";
import { soundEngine, useSoundEnabled } from "@/interaction/sound/engine";
import { VolumeControl } from "@/interaction/sound/VolumeControl";
import { hud } from "@/lib/content/copy";
import { NAV_LINKS } from "@/lib/nav";
import type { SocialLinks } from "@/types/content";
import { isActivePath } from "./nav-state";

type HudProps = {
  siteName: string;
  email: string;
  availability: string;
  socialLinks: SocialLinks;
};

// HUD fixo: wordmark, navegação comum, relíquias, som e modo leitura (spec 6.3).
export function Hud({ siteName, email, availability, socialLinks }: HudProps) {
  const pathname = usePathname();
  const { won } = useRelics();
  const sound = useSoundEnabled();
  const reading = useReadingMode();
  const drawerRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <header className="hud">
        <TransitionLink
          href="/"
          transitionDirection="back"
          className="wordmark focus-ring inline-flex min-h-11 items-center text-[clamp(1.375rem,2.6vw,2.125rem)] leading-none"
        >
          {siteName}
        </TransitionLink>

        <nav aria-label="Principal" className="hidden items-center gap-[var(--space-md)] md:flex">
          {NAV_LINKS.map(({ href, label }) => {
            const active = isActivePath(pathname, href);
            return (
              <TransitionLink
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`focus-ring inline-flex min-h-11 items-center font-mono text-sm uppercase tracking-[0.08em] underline-offset-[6px] ${
                  active ? "underline decoration-sangue decoration-2" : "hover:underline"
                }`}
              >
                {label}
              </TransitionLink>
            );
          })}
        </nav>

        <div className="flex items-center gap-[var(--space-2xs)]">
          <button
            type="button"
            className="hud-btn focus-ring"
            aria-haspopup="dialog"
            onClick={() => {
              drawerRef.current?.showModal();
            }}
          >
            <span>
              <span className="hidden sm:inline">{hud.relics} </span>
              {won.length}/{RELICS.length}
            </span>
            <span aria-hidden="true" className="hidden gap-[3px] sm:flex">
              {RELICS.map((relic) => (
                <i
                  key={relic.id}
                  className={`block h-3 w-[7px] border border-current ${won.includes(relic.id) ? "bg-current" : ""}`}
                />
              ))}
            </span>
          </button>
          <button
            type="button"
            className="hud-btn focus-ring"
            onClick={() => {
              soundEngine.setEnabled(!sound);
            }}
          >
            {hud.sound}: {sound ? hud.on : hud.off}
          </button>
          {sound && <VolumeControl id="hud-volume" compact className="hidden lg:flex" />}
          <button
            type="button"
            className="hud-btn focus-ring hidden sm:inline-flex"
            aria-pressed={reading}
            onClick={() => readingStore.toggle()}
          >
            {hud.reading}
          </button>
          <MobileMenu
            siteName={siteName}
            email={email}
            availability={availability}
            navLinks={NAV_LINKS}
            socialLinks={socialLinks}
          />
        </div>
      </header>
      <RelicDrawer ref={drawerRef} />
    </>
  );
}
