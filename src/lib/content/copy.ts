import type { Service, Skill } from "@/types/content";

/**
 * Fonte única da copy de UI/sistema (ver docs/content-system.md).
 * Nenhuma string visível de sistema deve ficar hard-coded em componentes — centralizar aqui.
 * (Corpo de artigos do blog e projetos continua no front-matter/MDX em content/.)
 */

export const about = {
  roleTop: "Software",
  roleBottom: "Engineer",
  paragraphs: [
    "Engenheiro de software full stack — do front ao back, com foco em web, mobile e cibersegurança.",
    "Construo produtos de ponta a ponta: interfaces acessíveis e rápidas, APIs e arquiteturas que escalam — com segurança pensada em cada etapa.",
  ],
  statusLabel: "Agora",
  photoAlt: "Foto de Luciano Rodrigues",
  talkCta: "Vamos conversar",
};

export const skills: Skill[] = [
  { label: "Full Stack", tone: "accent", rotation: -6 },
  { label: "Mobile", tone: "hover", rotation: 4 },
  { label: "System Architecture", tone: "muted", rotation: -3 },
  { label: "Cybersecurity", tone: "accent", rotation: 5 },
  { label: "TypeScript", tone: "hover", rotation: -4 },
];

export const services: Service[] = [
  {
    title: "Desenvolvimento Web",
    description:
      "Sites e aplicações sob medida em Next.js, do front ao back — acessíveis e rápidos.",
    tags: ["Next.js", "TypeScript", "Design System", "Acessibilidade"],
    rotation: -2,
  },
  {
    title: "Mobile",
    description:
      "Experiências mobile fluidas e responsivas, com foco em performance e toque.",
    tags: ["React Native", "PWA", "Motion", "Offline-first"],
    rotation: 1,
  },
  {
    title: "CyberSec",
    description:
      "Auditoria, pentest e QA — endurecendo aplicações com mentalidade de segurança.",
    tags: ["Pentest", "QA", "Hardening", "Automação"],
    rotation: -1,
  },
];

/** Headings das seções da home. */
export const sections = {
  work: {
    heading:
      "De marketplaces a sistemas de gestão, construo produtos digitais sob medida.",
    seeAll: "Todos os projetos",
  },
  blog: {
    heading: "Últimos posts",
    seeAll: "Ver tudo",
  },
};

/** Cabeçalhos editoriais das páginas de listagem (aplicados na Fase 5). */
export const pages = {
  work: {
    eyebrow: "Todos os projetos",
    heading: "Projetos",
    intro:
      "Uma seleção de produtos que construí — de marketplaces a sistemas de gestão e ferramentas de segurança.",
    back: "← Todos os projetos",
  },
  blog: {
    eyebrow: "Todos os posts",
    heading: "Blog",
    intro:
      "Notas sobre desenvolvimento web, performance, design e segurança — o que aprendo construindo.",
    back: "← Todos os posts",
  },
  contact: {
    intro:
      "Tem um projeto em mente? Me conte os detalhes — respondo o mais breve possível.",
    copyHint: "Clique para copiar o e-mail",
  },
};

/** CTA de contato (abre o cliente de e-mail via mailto). */
export const contactCta = {
  heading: "Vamos conversar?",
  description: "Abra seu e-mail com uma mensagem já pronta — é só completar e enviar.",
  button: "Enviar e-mail ↗",
  mailtoSubject: "Contato pelo portfólio",
  mailtoBody: "Olá! Gostaria de conversar sobre um projeto.\n\n",
  hint: "Ou escreva direto para",
};

/** Rótulos do rodapé. */
export const footer = {
  workDaysLabel: "Dias de trabalho",
  workDays: "Segunda – Sexta",
  projectPrompt: "Tem um projeto em mente?",
};

/** HUD, inventário e avisos (Cripta). */
export const hud = {
  relics: "relíquias",
  sound: "som",
  on: "on",
  off: "off",
  reading: "leitura",
  close: "fechar",
  drawerTitle: "Relíquias",
  drawerRole: "Cada interação escondida desbloqueia um sigilo. O progresso fica salvo neste navegador.",
  locked: "???",
  lockedHow: "Ainda escondida.",
  relicPrefix: "relíquia:",
  progress: (won: number, total: number) => `${won} de ${total}`,
  railLabel: "Seções desta página",
  menuReading: "Modo leitura",
};

/** Portal da primeira visita (spec 7.1). */
export const portal = {
  lede: "Entre. Quase tudo aqui responde ao toque.",
  withSound: "Entrar com som",
  silent: "Entrar em silêncio",
  reading: "Modo leitura",
  enterKey: "Enter",
  escKey: "Esc",
};

/** Títulos e papéis de sala (Fase 1: papéis neutros; as fases seguintes trocam pelo verbo da sala). */
export const rooms = {
  about: { title: "Gravura", role: "Sobre. Quem constrói, e como." },
  work: { title: "Projetos", role: "Índice de projetos." },
  blog: { title: "Biblioteca", role: "Notas sobre desenvolvimento web, performance, design e segurança." },
  contact: { title: "Terminal", role: "Contato. Escreva direto para o e-mail abaixo." },
};
