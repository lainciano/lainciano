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

/** Assunto e corpo do e-mail aberto pelo "escrever" do Contato (mailto, sem backend). */
export const contactCta = {
  mailtoSubject: "Contato pelo portfólio",
  mailtoBody: "Olá! Gostaria de conversar sobre um projeto.\n\n",
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
  volume: "volume",
  muted: "mudo",
  console: "console",
  consoleLabel: "Abrir console (atalho /)",
  menuConsole: "Console",
};

/** Portal da primeira visita (spec 7.1). */
export const portal = {
  lede: "Entre. Quase tudo aqui responde ao toque.",
  withSound: "Entrar com som",
  silent: "Entrar em silêncio",
  reading: "Modo leitura",
  volumeHint: "Ajuste agora: você ouve uma prévia.",
  enterKey: "Enter",
  escKey: "Esc",
};

/** Títulos e papéis de sala. Home e Sobre já com o verbo da sala (Fase 2); os demais trocam nas Fases 3–5. */
export const rooms = {
  home: { title: "Ruína", role: "Home. Agarre, arremesse. Dois cliques num projeto abrem o case." },
  about: { title: "Gravura", role: "Sobre. Segure sobre o retrato." },
  work: { title: "Projetos", role: "Índice. Passe o mouse para ver a relíquia." },
  blog: { title: "Biblioteca", role: "Notas sobre desenvolvimento web, performance, design e segurança." },
  contact: { title: "Terminal", role: "Contato. Gire a relíquia, digite no console." },
};

/** Home — abertura e seções (spec 7.2). */
export const home = {
  thesis: "Software engineer full stack. Web, mobile e cibersegurança.",
  craftHeading: "Ofício",
  libraryHeading: "Biblioteca",
  libraryAll: "Todos os posts",
};

/** Ruína — arena com física (spec 7.2). */
export const ruina = {
  collapse: "desabar",
  restore: "reerguer",
  controlsLabel: "Controles da arena",
  slabsLabel: "Projetos",
};

/** Gravura — retrato do Sobre (spec 7.3). */
export const gravura = {
  photoAlt: "Luciano Rodrigues, de óculos e jaqueta jeans, à noite",
  portraitLabel: "Retrato de Luciano Rodrigues em gravura. Segure o clique, ou Espaço, para derramar tinta.",
  caption: { before: "Segurando o mouse, ", key: "a tinta", after: " se espalha." },
  captionKeywords: ["cibersegurança.", "segurança"],
  ignite: "acender",
  ignited: "aceso",
  igniteHint: "mantenha pressionado",
  inscriptionsHeading: "Inscrições",
  skillsLabel: "Habilidades",
};

/** Portas de fim de página (spec 6.3). */
export const doors = {
  navLabel: "Próxima sala",
  next: (label: string) => `Próxima sala: ${label}`,
  caseRoom: "Câmara",
  homeLabel: "Home",
};

/** Cartão de entrada de sala: epígrafes da jornada (Ruína → Projetos → Câmara → Gravura → Biblioteca → Terminal). */
export const chapters = {
  label: (numeral: string, total: string) => `capítulo ${numeral} de ${total}`,
  skip: "pular",
  ruina: { title: "Ruína", epigraph: "Tudo cai. O que fica foi bem feito." },
  projetos: { title: "Projetos", epigraph: "O que foi construído, em ordem." },
  camara: { title: "Câmara", epigraph: "Um projeto por vez, de perto." },
  gravura: { title: "Gravura", epigraph: "Quem constrói, e como." },
  biblioteca: { title: "Biblioteca", epigraph: "O que se aprendeu pelo caminho." },
  terminal: { title: "Terminal", epigraph: "Escreva. Alguém responde." },
};

/** Câmara — case de projeto (spec 7.5). */
export const camara = {
  role: "Câmara. Passe a lente sobre a captura.",
  captureLabel: (title: string) =>
    `Captura de ${title} em gravura. Use as setas para mover a lente; segure Espaço para ampliá-la.`,
  caption: { before: "Passe ", key: "a lente", after: " para ver a interface real." },
  captionTouch: { before: "Segure ", key: "o dedo", after: " para abrir a lente." },
  revealed: (percent: number) => `revelado ${percent}%`,
  factsLabel: "Ficha do projeto",
  facts: { year: "Ano", kind: "Tipo", role: "Papel", stack: "Stack", site: "No ar", repo: "Código" },
  visit: { site: "Visitar o site", repo: "Ver o repositório" },
  nextCase: "Próximo case",
};

/** Console global e Terminal do Contato (spec 7.8, 8.6). Respostas em caixa baixa, como no protótipo. */
export const terminal = {
  title: "cripta — tty1",
  hint: "digite ajuda",
  prompt: "lainciano@cripta:~$",
  promptShort: "~$",
  inputLabel: "Comando do terminal",
  placeholder: "ajuda",
  overlayLabel: "Console",
  close: "fechar",
  greeting: "sessão aberta. digite ajuda para ver os comandos.",
  notFoundGreeting: "endereço vazio. digite ajuda para achar um caminho.",
  help: [
    "ajuda                      esta lista",
    "ir <sala>                  home, projetos, blog, sobre, contato",
    "projetos | abrir <projeto> lista e abre um case",
    "blog | ler <post>          lista e abre um post",
    "sobre | contato            quem é e como falar",
    "reliquias                  o que você já achou",
    "som on|off | leitura on|off",
    "arremessar | girar | revelar <projeto>",
    "ranking | cripta | limpar",
  ],
  notFound: (name: string) => `comando não encontrado: ${name}. digite ajuda.`,
  goUsage: "uso: ir <home|projetos|blog|sobre|contato>",
  goUnknown: (room: string) => `sala desconhecida: ${room}. salas: home, projetos, blog, sobre, contato.`,
  going: (room: string) => `indo para ${room} ...`,
  openUsage: "uso: abrir <projeto>. digite projetos para ver a lista.",
  projectNotFound: (query: string) => `projeto não encontrado: ${query}. digite projetos.`,
  ambiguous: (options: readonly string[]) => `mais de um encontrado: ${options.join(", ")}.`,
  opening: (title: string) => `abrindo case: ${title} ...`,
  noProjects: "nenhum projeto publicado ainda.",
  readUsage: "uso: ler <post>. digite blog para ver a lista.",
  postNotFound: (query: string) => `post não encontrado: ${query}. digite blog.`,
  readingPost: (title: string) => `abrindo post: ${title} ...`,
  noPosts: "nenhum post publicado ainda.",
  aboutMore: "mais em: ir sobre",
  copied: "(copiado)",
  copyFailed: "não deu para copiar. selecione o e-mail acima.",
  relicsSummary: (won: number, total: number) => `${won} de ${total} relíquias.`,
  locked: "???",
  soundState: (on: boolean) => `som: ${on ? "on" : "off"}`,
  soundUsage: "uso: som on|off",
  readingState: (on: boolean) => `leitura: ${on ? "on" : "off"}`,
  readingUsage: "uso: leitura on|off",
  throwDone: "uma letra atravessou o teto da ruína.",
  spinDone: "a relíquia girou até perder o eixo.",
  revealUsage: "uso: revelar <projeto>. digite projetos para ver a lista.",
  revealDone: (title: string) => `a lente passou por ${title} inteiro.`,
  sudo: "permissão negada. a tentativa foi registrada no livro.",
  cryptLocked: (won: number, total: number) => `a cripta só abre para quem platinou. ${won} de ${total}.`,
  cryptSoon: "o livro dos que platinaram ainda está sendo encadernado.",
  rankingSoon: "o livro dos que platinaram ainda não abriu.",
};

/** Contato — Terminal (spec 7.8). */
export const contact = {
  altarLabel:
    "Relíquia ASCII: um nó facetado girando. Arraste para girar; com foco, segure as setas ← ou →. No console: girar.",
  altarHintMouse: "arraste para girar",
  altarHintTouch: "deslize para girar",
  emailHeading: "Escreva",
  copy: "copiar",
  copied: "copiado",
  copyFailed: "selecione e copie",
  write: "escrever ↗",
  relicsHeading: "Relíquias",
  relicsRole: "Cada interação escondida desbloqueia um sigilo. O progresso fica salvo neste navegador.",
};

/** 404 — Cripta vazia (spec 7.9). */
export const cryptEmpty = {
  title: "Cripta vazia",
  lede: "Não há nada neste endereço.",
  pathsLabel: "Caminhos",
};
