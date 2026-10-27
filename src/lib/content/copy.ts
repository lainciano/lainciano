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
};

/** Biblioteca — post (spec 7.7). */
export const library = {
  older: "Anterior",
  newer: "Próximo",
  neighborsLabel: "Outros posts",
  codeLabel: "Trecho de código",
  copy: "copiar",
  copied: "copiado",
  copyFailed: "selecione e copie",
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

/**
 * Limiar, a introdução da primeira visita (spec Limiar 3). Desce por props para a casca e a ilha (nunca
 * importar valores daqui em ilha cliente). `progress` é modelo para `fillTemplate`, porque `hud.progress`
 * é função e não atravessa do servidor para o cliente. Em cada inscrição, o item do meio é a palavra-chave.
 */
export const limiar = {
  dialogTitle: "Limiar",
  skip: "pular",
  soundQuestion: "antes de entrar: com som ou em silêncio?",
  withSound: "com som",
  withSoundHint: "recomendado · fones ajudam",
  silent: "em silêncio",
  silentHint: "dá para ligar depois no HUD",
  reading: "Modo leitura",
  volumeHint: "Ajuste agora: você ouve uma prévia.",
  openingLede: "isto é um portfólio.",
  openingTwist: "mas não só.",
  holdVerb: "segure",
  holdText: "segure para acender a cripta",
  inscriptions: [
    ["há ", "relíquias", " escondidas nestas salas."],
    ["a cripta ", "lembra", " o que você faz."],
    ["no fim, um ", "livro", " guarda os nomes de quem chegou."],
  ] as [before: string, keyword: string, after: string][],
  readVerb: "leia",
  revealVerb: "revele",
  takeVerb: "pegue",
  takeButton: "pegar a relíquia",
  ending: "agora você sabe como funciona.",
  railLabels: ["som", "abertura", "gesto", "inscrições", "relíquia"],
  soundOn: "som ligado",
  soundOff: "som desligado",
  progress: "{won} de {total}",
};

/** Títulos e papéis de sala. Home e Sobre já com o verbo da sala (Fase 2); os demais trocam nas Fases 3–5. */
export const rooms = {
  home: { title: "Ruína", role: "Home. Derrube com um clique, agarre, arremesse. Dois cliques num projeto abrem o case." },
  about: { title: "Gravura", role: "Sobre. Segure sobre o retrato." },
  work: { title: "Projetos", role: "Índice. Passe o mouse para ver a relíquia." },
  blog: { title: "Biblioteca", role: "Blog. Leia até o fim." },
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
    "limiar                     rever a entrada da cripta",
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
  lockedPrefix: "· ",
  alreadyHere: "você já está aqui.",
  relicWon: (name: string, won: number, total: number) => `relíquia: ${name} — ${won} de ${total}.`,
  unavailable: "console indisponível. recarregue a página.",
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
  cryptOpen: "a cripta se abre.",
  limiarOpening: "o limiar se abre.",
  limiarReading: "o limiar não abre em modo leitura. leitura off para entrar.",
  gameOn: "o jogo foi liberado neste navegador. digite jogo para entrar.",
  gameOff: "o jogo foi desligado.",
  gameOpening: "o jogo se abre.",
  gameReading: "o jogo não abre em modo leitura. leitura off para entrar.",
  gameDenied: "permissão negada.",
  gameUsage: "uso: jogo [on|off]",
  rankingLoading: "abrindo o livro…",
  rankingEmpty: "ninguém platinou ainda.",
  rankingFailed: "o livro não respondeu. tente de novo em instantes.",
  rankingLine: (position: number, nickname: string, time: string) => `${position}. ${nickname}  ${time}`,
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

/** Tela de platina (spec 8.5). Modelos com {marcador}: preenchidos no cliente com fillTemplate. */
export const platinum = {
  title: "Platina.",
  summary: "{total} de {total} em {tempo}.",
  nicknameLabel: "Apelido",
  nicknameHint: "3 a 16 letras, números, _ ou -.",
  submit: "Gravar no livro",
  sending: "Gravando…",
  later: "Agora não",
  privacy: "Só o apelido e o tempo ficam públicos. Nada mais é guardado.",
  success: "Gravado. Você é o nº {posicao} no livro.",
  bookLink: "Ver o livro",
  close: "fechar",
  errors: {
    invalid_nickname: "Use de 3 a 16 letras, números, _ ou -.",
    blocked_nickname: "Esse apelido não pode ser usado. Escolha outro.",
    rate_limited: "Muitas tentativas. Tente de novo em uma hora.",
    unavailable: "O livro não respondeu. Tente de novo em instantes.",
    duplicate: "Esta run já está no livro.",
    invalid_run: "Esta run não pode ser gravada no livro.",
    too_fast: "Rápido demais para o livro: a run precisa de pelo menos 2 minutos.",
    incomplete: "Esta run não pode ser gravada no livro.",
  },
};

/** Livro dos que platinaram, no Contato (spec 7.8). */
export const book = {
  heading: "Livro dos que platinaram",
  role: "Ranking de honra: as relíquias são conferidas no seu navegador.",
  caption: "Os 20 menores tempos até a platina",
  position: "nº",
  nickname: "apelido",
  time: "tempo",
  date: "data",
  loading: "abrindo o livro…",
  empty: "Ninguém platinou ainda. As {total} relíquias estão espalhadas pelo site.",
  failed: "O livro não respondeu. Tente de novo em instantes.",
  rows: "Linhas no livro: {n}.",
  retry: "tentar de novo",
  noscript: "O livro precisa de JavaScript para abrir.",
  rail: "Livro",
};

/** 404 — Cripta vazia (spec 7.9). */
export const cryptEmpty = {
  title: "Cripta vazia",
  lede: "Não há nada neste endereço.",
  pathsLabel: "Caminhos",
};

/** Jogo 3D (Fase 1A): rótulos do shell, descidos do servidor por props (ilhas cliente não importam este arquivo). */
export const game = {
  loading: "Carregando o jogo…",
  exit: "Sair do jogo",
  region: "Jogo",
  noWebgl: "O 3D não abriu neste aparelho (WebGL indisponível ou perdido). O site continua aqui.",
  back: "Voltar ao site",
  /** Lista de lugares (L): título acessível e a marca do lugar onde se está. */
  places: "Lugares",
  here: "aqui",
  /** O travamento do mouse caiu (Esc do navegador): nunca a sensação de ter saído do jogo (bíblia 12b.5). */
  paused: "pausado · clique na cena para continuar",
  /** A camada não carregou (contrato §3). */
  stuck: "A porta emperrou.",
  retry: "Tentar de novo",
};
