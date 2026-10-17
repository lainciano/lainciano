/**
 * Bitmap de uma imagem por URL já virado (flipY): o three não vira ImageBitmap no upload, então a cena
 * usa `texture.flipY = false` (lição da Fase 2). Nunca passar uma <img> exibida ao Texture.
 */
export async function loadBitmap(url: string): Promise<ImageBitmap> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`textura: ${response.status} ${url}`);
  return createImageBitmap(await response.blob(), { imageOrientation: "flipY" });
}

/** Cada URL é carregada uma vez; dispose() fecha todos os bitmaps (chamar no dispose da cena). */
export function createBitmapCache(load: (url: string) => Promise<ImageBitmap> = loadBitmap) {
  const cache = new Map<string, Promise<ImageBitmap>>();
  return {
    get(url: string): Promise<ImageBitmap> {
      let pending = cache.get(url);
      if (!pending) {
        pending = load(url);
        cache.set(url, pending);
        pending.catch(() => cache.delete(url));
      }
      return pending;
    },
    async dispose() {
      const all = [...cache.values()];
      cache.clear();
      for (const pending of all) {
        try {
          (await pending).close();
        } catch {
          // carga que falhou: nada a fechar
        }
      }
    },
    size: () => cache.size,
  };
}
