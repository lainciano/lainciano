import { createMaker } from "../../render/kit";
import { debugEnabled } from "../../runtime/debug";
import type { Layer, LayerInstance } from "../types";
import { ANTESSALA_GRAPH, FURNITURE_COLLIDERS, SURFACES, WALL_COLLIDERS, windowLightAt, type WindowLight } from "./places";
import { buildAntessalaScene } from "./scene";

/**
 * Camada 01 · Antessala (Fase 1B), a antiga recepção do Sanatório do Descoberto que o lainciano virou sala de estar.
 * B8 é a CASCA: a sala vazia, composta e andável (planta, paredes, portas, janela, luz, lugares, colisão, superfícies);
 * os objetos chegam nas B9–B13 e as interações na B16. Molde da sala cinza:
 * - `load` constrói tudo num `Group` privado (nunca toca `ctx.scene`), cada geometria e luz pelo `own`, cedendo o
 *   quadro entre as partes, e para no primeiro abort;
 * - `enter` anexa o grupo, `dispose` solta (o runner drena o `own` depois);
 * - `update` balança a lâmpada âmbar, faz ela respirar e desliza a névoa da janela, de forma determinística no tempo
 *   (a foto com o tempo preso sai igual); com movimento reduzido, quase parado.
 *
 * Debug (só com `?debug=1`): `luz=dia|entardecer|noite` força a janela (as fotos `?shot=` usam a noite, o plano de
 * entrada da bíblia); `placeholders=1` mostra as caixas cinza onde virão os objetos.
 */

const yieldFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

const LIGHTS: readonly WindowLight[] = ["dia", "entardecer", "noite"];

/** Estado da janela: o de debug (`luz=`, ou a noite nas fotos), senão a hora LOCAL de agora. */
export function windowLightFor(search: string, now: Date): WindowLight {
  if (debugEnabled(search)) {
    const q = new URLSearchParams(search);
    const forced = q.get("luz");
    if (forced && (LIGHTS as readonly string[]).includes(forced)) return forced as WindowLight;
    if (q.get("shot")) return "noite";
  }
  return windowLightAt(now.getHours() + now.getMinutes() / 60);
}

/** `?debug=1&placeholders=1`: as caixas cinza dos objetos que ainda não existem. */
export const placeholdersRequested = (search: string) => debugEnabled(search) && new URLSearchParams(search).get("placeholders") === "1";

export const antessalaLayer: Layer = {
  id: "antessala",
  manifest: {
    id: "antessala",
    textures: [],
    models: [],
    audio: [],
    // Tudo procedural. Orçamento da sala inteira (bíblia §12): 25 mil triângulos; texturas de canvas ≤ 256² (a casca usa ~26).
    budget: { triangles: 25_000, textureBytes: 40 * 256 * 256 * 4 * (4 / 3) },
  },
  async load(ctx, signal, own) {
    signal.throwIfAborted();
    const search = typeof window === "undefined" ? "" : window.location.search;
    const root = new ctx.three.Group();
    root.name = "camada-antessala";
    const maker = createMaker(ctx.three, ctx.kit, own, "antessala");
    const step = async () => {
      await yieldFrame();
      signal.throwIfAborted();
    };
    await step();
    const built = await buildAntessalaScene(maker, root, step, { light: windowLightFor(search, new Date()), placeholders: placeholdersRequested(search) });
    signal.throwIfAborted();

    const reduced = prefersReducedMotion();
    const { lampPivot, lamp, mist } = built;
    const baseIntensity = lamp.intensity;
    const instance: LayerInstance = {
      places: ANTESSALA_GRAPH,
      colliders: [...WALL_COLLIDERS, ...FURNITURE_COLLIDERS],
      surfaces: SURFACES,
      objects: [],
      enter() {
        ctx.scene.add(root);
        root.updateMatrixWorld(true);
      },
      update(_dt, t) {
        const amp = reduced ? 0.2 : 1;
        // a lâmpada que ele pendurou balança devagar (sombras que respiram)
        lampPivot.rotation.z = Math.sin(t * 0.7) * 0.04 * amp;
        lampPivot.rotation.x = Math.sin(t * 0.5 + 1) * 0.028 * amp;
        // respiração da lâmpada (sem Math.random: a foto com o tempo preso é reproduzível)
        const dip = Math.sin(t * 2.3) * Math.sin(t * 7.1) > 0.92 ? 0.84 : 1;
        lamp.intensity = baseIntensity * dip * (1 + Math.sin(t * 13) * 0.012);
        // a névoa do lago passa diante da janela
        mist.offset.x = (t * 0.006 * amp) % 1;
      },
      exit: () => ({}),
      dispose() {
        root.removeFromParent();
      },
    };
    return instance;
  },
};
