/** Canal entre a ilha do Relicário (eventos do DOM) e a cena da prévia (three): qual captura mostrar. */
export type PreviewChannel = {
  set(slug: string | null): void;
  get(): string | null;
  subscribe(listener: (slug: string | null) => void): () => void;
};

export function createPreviewChannel(): PreviewChannel {
  let current: string | null = null;
  const listeners = new Set<(slug: string | null) => void>();
  return {
    set(slug) {
      if (slug === current) return;
      current = slug;
      listeners.forEach((listener) => listener(slug));
    },
    get: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
