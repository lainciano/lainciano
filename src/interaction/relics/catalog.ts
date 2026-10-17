export type Relic = { id: string; sigil: string; name: string; room: string; how: string };

export const RELICS = [
  { id: "sangue", sigil: "✠", name: "Sangue", room: "Sobre", how: "Segurou sobre o retrato até a tinta vazar." },
  { id: "leitura", sigil: "†", name: "Leitura", room: "Sobre", how: "Leu a legenda do Sobre até a última palavra." },
  { id: "arremesso", sigil: "‡", name: "Arremesso", room: "Home", how: "Atirou uma letra para fora da ruína." },
  { id: "case", sigil: "☩", name: "Case", room: "Home", how: "Abriu um projeto pela ruína." },
  { id: "lente", sigil: "◉", name: "Lente", room: "Câmara", how: "Revelou uma captura inteira com a lente." },
  { id: "leitor", sigil: "❧", name: "Leitor", room: "Biblioteca", how: "Leu um post até o fim." },
  { id: "orbita", sigil: "⁂", name: "Órbita", room: "Terminal", how: "Girou a relíquia ASCII rápido o bastante." },
  { id: "terminal", sigil: "⸸", name: "Terminal", room: "Console", how: "Executou o primeiro comando." },
  { id: "sudo", sigil: "✝", name: "Sudo", room: "Console", how: "Tentou virar root. Negado, mas anotado." },
  { id: "explorador", sigil: "☥", name: "Explorador", room: "Todas", how: "Visitou todas as salas." },
] as const satisfies readonly Relic[];

export type RelicId = (typeof RELICS)[number]["id"];

export const RELIC_IDS: readonly RelicId[] = RELICS.map((relic) => relic.id);

export function isRelicId(value: unknown): value is RelicId {
  return typeof value === "string" && (RELIC_IDS as readonly string[]).includes(value);
}

export function getRelic(id: RelicId): (typeof RELICS)[number] {
  return RELICS.find((relic) => relic.id === id)!;
}
