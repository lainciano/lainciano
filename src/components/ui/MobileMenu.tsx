"use client";

import { useLenis } from "lenis/react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { TransitionLink } from "@/components/ui/TransitionLink";
import { SOCIAL_LABELS } from "@/lib/social";
import type { NavLink } from "@/lib/nav";
import type { SocialLinks } from "@/types/content";

type MobileMenuProps = {
  siteName: string;
  email: string;
  availability: string;
  navLinks: readonly NavLink[];
  socialLinks: SocialLinks;
};

function GridIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {[3, 10.5, 18].map((y) =>
        [3, 10.5, 18].map((x) => <rect key={`${x}-${y}`} x={x} y={y} width="3" height="3" rx="0.5" />),
      )}
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M5 5l14 14M19 5L5 19" strokeLinecap="round" />
    </svg>
  );
}

// Menu mobile (< md). Painel via portal em document.body (z-[9999]) + transição CSS —
// evita stacking context do .page-shell e funciona em touch real (pointer + click).
// Portal só no client — useSyncExternalStore evita setState em effect.
const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function MobileMenu({ siteName, email, availability, navLinks, socialLinks }: MobileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const skipPathnameCloseRef = useRef(true);
  const pathname = usePathname();
  const lenis = useLenis();
  const lenisRef = useRef(lenis);

  useEffect(() => {
    lenisRef.current = lenis;
  }, [lenis]);

  const activeSocials = (
    Object.entries(socialLinks) as [keyof SocialLinks, string | null | undefined][]
  ).filter(([, url]) => Boolean(url));

  const openMenu = useCallback(() => {
    setIsOpen(true);
    lenisRef.current?.stop();
    document.body.style.overflow = "hidden";
  }, []);

  const closeMenu = useCallback(() => {
    setIsOpen(false);
    lenisRef.current?.start();
    document.body.style.overflow = "";
  }, []);

  // Fecha ao trocar de rota — ignora o mount inicial (pathname já setado na abertura).
  useEffect(() => {
    if (skipPathnameCloseRef.current) {
      skipPathnameCloseRef.current = false;
      return;
    }
    closeMenu();
  }, [pathname, closeMenu]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, closeMenu]);

  const handleOpenPointer = (event: React.PointerEvent<HTMLButtonElement>) => {
    // pointerup cobre touch; preventDefault evita ghost click duplicado em alguns browsers.
    event.preventDefault();
    event.stopPropagation();
    openMenu();
  };

  return (
    <div className="relative z-20 md:hidden">
      <button
        type="button"
        onClick={openMenu}
        onPointerUp={handleOpenPointer}
        aria-label="Abrir menu"
        aria-expanded={isOpen}
        aria-controls="mobile-menu"
        data-lenis-prevent
        data-lenis-prevent-touch
        className="relative z-20 touch-manipulation p-1 text-accent transition-colors hover:text-hover"
      >
        <GridIcon />
      </button>

      {mounted
        ? createPortal(
            <div
              id="mobile-menu"
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              aria-hidden={!isOpen}
              data-lenis-prevent
              data-lenis-prevent-touch
              className={`fixed inset-0 z-[9999] flex flex-col bg-accent text-foreground transition-transform duration-500 ease-out ${
                isOpen
                  ? "pointer-events-auto translate-y-0"
                  : "pointer-events-none -translate-y-full"
              }`}
            >
              <div className="content-container flex items-center justify-between py-3">
                <span className="text-nav-logo">{siteName}</span>
                <button
                  type="button"
                  onPointerUp={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    closeMenu();
                  }}
                  aria-label="Fechar menu"
                  className="touch-manipulation p-1 transition-opacity hover:opacity-70"
                >
                  <CloseIcon />
                </button>
              </div>

              <nav className="content-container flex flex-1 flex-col justify-center gap-2" aria-label="Menu principal">
                {navLinks.map(({ href, label }) => (
                  <TransitionLink
                    key={href}
                    href={href}
                    className="text-large-heading w-fit text-foreground transition-colors hover:text-background"
                    onClick={closeMenu}
                  >
                    {label}
                  </TransitionLink>
                ))}
              </nav>

              <div className="content-container flex flex-col gap-6 border-t border-foreground/30 py-8">
                {activeSocials.length > 0 && (
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                    <span className="caps text-foreground/90">Sociais:</span>
                    {activeSocials.map(([key, url]) => (
                      <a
                        key={key}
                        href={url!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link-underline caps"
                      >
                        {SOCIAL_LABELS[key]}
                      </a>
                    ))}
                  </div>
                )}

                <div className="flex flex-col gap-1">
                  <span className="text-small-heading italic text-foreground/90">{availability}</span>
                  <a href={`mailto:${email}`} className="link-underline caps w-fit">
                    {email}
                  </a>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
