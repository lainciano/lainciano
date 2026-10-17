import {
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Texture,
  Vector3,
  Vector4,
  WebGLRenderer,
} from "three";
import { cropToUniform } from "@/rooms/gravura/crop";
import { coverCrop } from "@/rooms/shared/cover";
import { ENGRAVING_VERTEX, buildEngravingFragment, engravingLineCount } from "@/rooms/shared/engravingShader";
import { createBitmapCache } from "@/rooms/shared/textures";
import { tokenRgb } from "@/rooms/shared/tokens";
import type { WebGLScene, WebGLSceneContext } from "@/rooms/shared/webgl";
import type { PreviewChannel } from "./channel";
import { PREVIEW, resolveSwap, stepSwap } from "./preview";

type Source = { texture: Texture; crop: Vector4 };
type PreviewOptions = { channel: PreviewChannel; sources: Record<string, string> };

const color = (name: string) => new Vector3(...tokenRgb(name));

/**
 * Prévia única do Relicário (spec 7.4): um canvas compartilhado; cada captura vira textura uma vez
 * (cache) e a troca funde as fontes em 250 ms antes da gravura (USE_SWAP), sem piscar.
 */
export async function createPreviewScene(
  { canvas, host, coarse, wake }: WebGLSceneContext,
  { channel, sources }: PreviewOptions,
): Promise<WebGLScene> {
  const renderer = new WebGLRenderer({ canvas, antialias: false });
  const bitmaps = createBitmapCache();
  const textures = new Map<string, Promise<Source>>();
  const created = new Set<Texture>();
  const frameAspect = PREVIEW.width / PREVIEW.height;
  let disposed = false;

  const sourceFor = (slug: string): Promise<Source> | null => {
    const url = sources[slug];
    if (!url) return null;
    let pending = textures.get(slug);
    if (!pending) {
      pending = bitmaps.get(url).then((bitmap) => {
        if (disposed) throw new Error("prévia descartada");
        const texture = new Texture(bitmap);
        texture.flipY = false; // o bitmap já vem virado (lição da Fase 2)
        texture.minFilter = LinearFilter;
        texture.generateMipmaps = false;
        texture.needsUpdate = true;
        created.add(texture);
        const [x, y, w, h] = cropToUniform(coverCrop(bitmap.width / bitmap.height, frameAspect));
        return { texture, crop: new Vector4(x, y, w, h) };
      });
      textures.set(slug, pending);
      pending.catch(() => textures.delete(slug));
    }
    return pending;
  };

  const blank = new Texture();
  const uniforms = {
    uTex: { value: blank },
    uTexNext: { value: blank },
    uCrop: { value: new Vector4(0, 0, 1, 1) },
    uCropNext: { value: new Vector4(0, 0, 1, 1) },
    uSwap: { value: 0 },
    uTime: { value: 0 },
    uAspect: { value: frameAspect },
    uLines: { value: 50 },
    uMotion: { value: 1 },
    uBone: { value: color("--osso") },
    uBlack: { value: color("--breu") },
    uBlood: { value: color("--sangue") },
    uClot: { value: color("--coagulo") },
  };
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: ENGRAVING_VERTEX,
    fragmentShader: buildEngravingFragment({ ink: false, swap: true }),
  });
  const geometry = new PlaneGeometry(2, 2);
  const scene = new Scene();
  scene.add(new Mesh(geometry, material));
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  let shown = false; // a primeira captura entra direto (a moldura já faz o fade de opacidade)
  let swapping = false;
  let swap = 0;
  let wanted: string | null = channel.get();
  let ticket = 0;
  let startedAt: number | null = null;

  const promote = () => {
    uniforms.uTex.value = uniforms.uTexNext.value;
    uniforms.uCrop.value = uniforms.uCropNext.value;
    swap = 0;
    swapping = false;
    uniforms.uSwap.value = 0;
  };

  const show = (slug: string | null) => {
    wanted = slug;
    wake();
    if (!slug) return;
    const pending = sourceFor(slug);
    if (!pending) return;
    const mine = ++ticket;
    pending.then(
      (source) => {
        if (disposed || mine !== ticket || wanted !== slug) return;
        if (!shown) {
          uniforms.uTex.value = source.texture;
          uniforms.uCrop.value = source.crop;
          shown = true;
          host.dataset.loaded = "on";
          wake();
          return;
        }
        if (!swapping && uniforms.uTex.value === source.texture) return;
        if (swapping && resolveSwap(swap) === "commit") promote();
        uniforms.uTexNext.value = source.texture;
        uniforms.uCropNext.value = source.crop;
        swapping = true; // "replace" mantém o progresso atual da fusão
        wake();
      },
      () => {
        // captura que não carregou: a prévia mantém a anterior
      },
    );
  };

  // Pré-carrega todas as capturas (já estamos em idle, depois do LCP — D2).
  for (const slug of Object.keys(sources)) sourceFor(slug)?.catch(() => {});
  const unsubscribe = channel.subscribe(show);
  show(wanted);

  return {
    resize(width, height, dpr) {
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height, false);
      uniforms.uAspect.value = width / height;
      uniforms.uLines.value = engravingLineCount(height, coarse);
    },
    frame(now, deltaMs) {
      if (startedAt === null) startedAt = now;
      uniforms.uTime.value = (now - startedAt) / 1000;
      if (swapping) {
        swap = stepSwap(swap, deltaMs);
        uniforms.uSwap.value = swap;
        if (swap >= 1) promote();
      }
      if (shown) renderer.render(scene, camera);
      // Com uma linha ativa as linhas ondulam; sem linha e sem fusão, o loop dorme.
      return swapping || wanted !== null;
    },
    dispose() {
      disposed = true;
      unsubscribe();
      geometry.dispose();
      material.dispose();
      blank.dispose();
      created.forEach((texture) => texture.dispose());
      created.clear();
      void bitmaps.dispose();
      renderer.dispose();
      if (!renderer.getContext().isContextLost()) renderer.forceContextLoss();
    },
  };
}
