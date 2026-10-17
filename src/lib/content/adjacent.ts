export type Adjacent<T> = { previous: T | null; next: T | null };

/**
 * Vizinhos de um item numa lista já ordenada. Com wrap (cases, spec 7.5) o último aponta para o
 * primeiro; sem wrap (posts, Fase 5) as pontas ficam sem vizinho. Nunca aponta para o próprio item.
 */
export function getAdjacent<T extends { slug: string }>(
  items: readonly T[],
  slug: string,
  { wrap }: { wrap: boolean },
): Adjacent<T> {
  const index = items.findIndex((item) => item.slug === slug);
  if (index === -1 || items.length < 2) return { previous: null, next: null };
  const last = items.length - 1;
  if (wrap) {
    return { previous: items[index === 0 ? last : index - 1], next: items[index === last ? 0 : index + 1] };
  }
  return { previous: index > 0 ? items[index - 1] : null, next: index < last ? items[index + 1] : null };
}
