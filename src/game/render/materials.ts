import type * as THREE from "three";
import { applyPsx, type PsxUniforms } from "./psx";

/**
 * Kit de materiais do jogo (contrato §3): tudo o que sai daqui é compartilhado e só morre no `dispose()` do
 * kit, chamado pelo `engine.dispose()`. As camadas não descartam o que vem do kit.
 *
 * Convenção de cor do protótipo 7 (aprovado): lá o three r128 não tinha gestão de cor, então os hex dos
 * materiais e das luzes e os pixels dos canvas valiam como números lineares, e o pós aplicava a gama 1/2.2.
 * Para manter a mesma paleta com os mesmos números, o kit lê `color`/`emissive`/`specular` como lineares, seja
 * número (`0x8a867d`) ou texto CSS (`"#8a867d"`, `"rgb(…)"`), igual ao `protoColor`; um `THREE.Color` pronto
 * passa como está (já no espaço de trabalho). As texturas de canvas nascem com `NoColorSpace` (sem decodificar
 * sRGB). Com isso,
 * uma cor sem luz sai na tela igual ao protótipo; o que muda com a luz física do 0.186 se recalibra nas
 * intensidades (ver a cena de referência `psx-ref`).
 */
export type MaterialKit = {
  phong(o: THREE.MeshPhongMaterialParameters): THREE.MeshPhongMaterial;
  basic(o: THREE.MeshBasicMaterialParameters): THREE.MeshBasicMaterial;
  texture(
    key: string,
    draw: (g: CanvasRenderingContext2D, w: number, h: number) => void,
    size: 64 | 128 | 256,
  ): THREE.CanvasTexture;
  dispose(): void;
};

/** Phong do protótipo: especular fraco e quente, brilho baixo. */
export const PHONG_DEFAULTS = { specular: 0x080706, shininess: 12 } as const;

/** Uma cor da paleta do protótipo 7 (hex ou texto CSS lido como linear, como no r128). */
export function protoColor(three: typeof THREE, value: number | string): THREE.Color {
  const color = new three.Color();
  return typeof value === "number" ? color.setHex(value, three.LinearSRGBColorSpace) : color.setStyle(value, three.LinearSRGBColorSpace);
}

type ColorKeys = "color" | "emissive" | "specular";
const COLOR_KEYS: readonly ColorKeys[] = ["color", "emissive", "specular"];
type RawColor = number | string;

/** Separa as cores em número ou texto (que o construtor leria como sRGB) do resto dos parâmetros. */
function splitColors<P extends object>(o: P): { rest: P; raw: Partial<Record<ColorKeys, RawColor>> } {
  const rest = { ...o } as Record<string, unknown>;
  const raw: Partial<Record<ColorKeys, RawColor>> = {};
  for (const key of COLOR_KEYS) {
    const value = rest[key];
    if (typeof value === "number" || typeof value === "string") {
      raw[key] = value;
      delete rest[key];
    }
  }
  return { rest: rest as P, raw };
}

export function createMaterialKit(three: typeof THREE, psx: PsxUniforms): MaterialKit {
  const materials = new Set<THREE.Material>();
  const textures = new Map<string, THREE.CanvasTexture>();
  let disposed = false;

  const track = <T extends THREE.Material>(mat: T, raw: Partial<Record<ColorKeys, RawColor>>): T => {
    const target = mat as unknown as Partial<Record<ColorKeys, THREE.Color>>;
    for (const key of COLOR_KEYS) {
      const value = raw[key];
      if (value !== undefined) target[key]?.copy(protoColor(three, value));
    }
    materials.add(mat);
    return applyPsx(mat, psx);
  };

  return {
    phong(o) {
      const { rest, raw } = splitColors({ ...PHONG_DEFAULTS, ...o });
      return track(new three.MeshPhongMaterial(rest), raw);
    },
    basic(o) {
      const { rest, raw } = splitColors(o);
      return track(new three.MeshBasicMaterial(rest), raw);
    },
    texture(key, draw, size) {
      const cached = textures.get(key);
      if (cached) return cached;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const g = canvas.getContext("2d", { willReadFrequently: true });
      if (!g) throw new Error(`kit: sem contexto 2D para a textura "${key}"`);
      draw(g, size, size);
      const texture = new three.CanvasTexture(canvas);
      // Pixels do canvas valem como lineares (convenção do protótipo, ver acima).
      texture.colorSpace = three.NoColorSpace;
      texture.wrapS = three.RepeatWrapping;
      texture.wrapT = three.RepeatWrapping;
      texture.magFilter = three.LinearFilter;
      texture.minFilter = three.LinearMipmapLinearFilter;
      texture.name = key;
      if (!disposed) textures.set(key, texture);
      return texture;
    },
    dispose() {
      disposed = true;
      for (const mat of materials) mat.dispose();
      for (const texture of textures.values()) texture.dispose();
      materials.clear();
      textures.clear();
    },
  };
}
