/** Áreas do Explorador (spec 8.4): `/`, `/about`, `/work`, um case, `/blog`, um post e `/contact`. */
export const EXPLORER_AREAS = ["home", "about", "work", "case", "blog", "post", "contact"] as const;

export type ExplorerArea = (typeof EXPLORER_AREAS)[number];

export function isExplorerArea(value: unknown): value is ExplorerArea {
  return typeof value === "string" && (EXPLORER_AREAS as readonly string[]).includes(value);
}

export function parseVisited(raw: string | null): ExplorerArea[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? [...new Set(value.filter(isExplorerArea))] : [];
  } catch {
    return [];
  }
}

/** Mesma referência quando a área já estava lá: quem chama sabe que não precisa gravar. */
export function visitArea(visited: readonly ExplorerArea[], area: ExplorerArea): readonly ExplorerArea[] {
  return visited.includes(area) ? visited : [...visited, area];
}

export function isExplorerComplete(visited: readonly ExplorerArea[]): boolean {
  return EXPLORER_AREAS.every((area) => visited.includes(area));
}
