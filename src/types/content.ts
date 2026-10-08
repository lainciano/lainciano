export type SocialLinks = {
  github?: string | null;
  linkedin?: string | null;
  instagram?: string | null;
  codepen?: string | null;
  bluesky?: string | null;
  mastodon?: string | null;
  rss?: string | null;
};

export type SiteSettings = {
  siteName: string;
  tagline: string;
  email: string;
  /** Disponibilidade canônica — usada em HUD e Footer (fonte única). */
  availability: string;
  defaultAccent: string;
  socialLinks: SocialLinks;
};

export type ProjectMeta = {
  title: string;
  slug: string;
  year: number;
  tags: string[];
  coverImage: string;
  accentColor?: string;
  published: boolean;
  summary: string;
  /** URL externa do projeto (deploy ou repositório). */
  link?: string;
  /** Texto alternativo da captura; fallback em coverAltFor(). */
  coverAlt?: string;
  /** Papel no projeto, quando confirmado. */
  role?: string;
  /** Tipo curto do projeto (evento, escrita…), nas lajes da Ruína e no índice (spec 7.2, 7.4). */
  kind?: string;
};

export type PostMeta = {
  title: string;
  slug: string;
  excerpt: string;
  tags: string[];
  published: boolean;
  createdAt: string;
};

export type Service = {
  title: string;
  description: string;
  tags: string[];
  rotation: number;
};

export type Skill = {
  label: string;
  tone: "accent" | "hover" | "muted";
  rotation: number;
};
