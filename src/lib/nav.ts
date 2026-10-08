/** Links principais compartilhados entre HUD e Footer (ordem da spec 6.3). */
export const NAV_LINKS = [
  { href: "/work", label: "Projetos" },
  { href: "/blog", label: "Blog" },
  { href: "/about", label: "Sobre" },
  { href: "/contact", label: "Contato" },
] as const;

export type NavLink = (typeof NAV_LINKS)[number];
