import type * as THREE from "three";
import type { SaveV1 } from "../../save/schema";
import type { InteractiveObject, Layer, LayerInstance } from "../types";
import { createMaker } from "./models";
import { CINZA_GRAPH, DOOR_FLAG, FURNITURE_COLLIDERS, RUG, WALL_COLLIDERS } from "./places";
import { buildCinzaScene } from "./scene";

/**
 * Sala cinza (Fase 1A): 4 × 4 m, pé-direito 2,6 m, porta trancada ao norte, mesa com bilhete e caderno, guarda-
 * roupa, tapete e luz pendente com sombra. É a prova do motor e o molde que a 1B copia:
 * - `load` constrói tudo num `Group` privado (nunca toca `ctx.scene`), registra cada geometria e luz em `own`,
 *   cede o quadro entre as partes (a tela de carregamento respira) e para no primeiro abort;
 * - `enter` anexa o grupo, `dispose` solta (o runner drena o `own` depois);
 * - `update` só balança a luminária (com movimento reduzido, quase parada) e faz a lâmpada respirar, de forma
 *   determinística no tempo (a foto com o tempo preso sai igual).
 */

const yieldFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/** Linhas da camada (conteúdo da sala, como os nós do protótipo). A interação completa é da T9. */
const LINES = {
  mesa: "madeira gasta onde os braços apoiavam. alguém escreveu aqui por muito tempo.",
  bilhete: "um bilhete dobrado. a letra é apressada.",
  caderno: "um caderno de capa preta, com elástico. está fechado.",
  armario: "a porta da direita não fecha direito. a chave ficou na fechadura.",
  portaTrancada: "trancada.",
  portaAberta: "a porta cede.",
} as const;

export const cinzaLayer: Layer = {
  id: "cinza",
  manifest: {
    id: "cinza",
    textures: [],
    models: [],
    audio: [],
    // Tudo procedural: ~31 texturas de canvas (no máx. 256²) e ~25 mil triângulos (contados no e2e).
    budget: { triangles: 40_000, textureBytes: 31 * 256 * 256 * 4 * (4 / 3) },
  },
  async load(ctx, signal, own) {
    signal.throwIfAborted();
    const root = new ctx.three.Group();
    root.name = "camada-cinza";
    const maker = createMaker(ctx.three, ctx.kit, own);
    const step = async () => {
      await yieldFrame();
      signal.throwIfAborted();
    };
    await step();
    const built = await buildCinzaScene(maker, root, step);
    signal.throwIfAborted();

    const doorOpen = (s: SaveV1) => s.flags[DOOR_FLAG] === true;
    const say = (text: string) => ctx.say({ text, kind: "speech" });
    const objects: InteractiveObject[] = [
      { id: "mesa", place: "mesa", roots: [built.table], material: "madeira", verb: () => "examinar a mesa", enabled: () => true, act: () => say(LINES.mesa) },
      { id: "bilhete", place: "mesa", roots: [built.note], material: "papel", verb: () => "ler o bilhete", enabled: () => true, act: () => say(LINES.bilhete) },
      { id: "caderno", place: "mesa", roots: [built.notebook], material: "papel", verb: () => "abrir o caderno", enabled: () => true, act: () => say(LINES.caderno) },
      { id: "armario", place: "armario", roots: [built.wardrobe], material: "madeira", verb: () => "abrir o armário", enabled: () => true, act: () => say(LINES.armario) },
      {
        id: "porta",
        place: "porta",
        roots: [built.door],
        material: "madeira",
        verb: () => "abrir a porta",
        enabled: () => true,
        act: (api) => {
          if (doorOpen(api.save.get())) return say(LINES.portaAberta);
          api.sfx("knock");
          say(LINES.portaTrancada);
        },
      },
    ];

    const reduced = prefersReducedMotion();
    const { lampPivot, lamp } = built;
    const baseIntensity = lamp.intensity;
    const instance: LayerInstance = {
      places: CINZA_GRAPH,
      colliders: [...WALL_COLLIDERS, ...FURNITURE_COLLIDERS],
      surfaces: [{ box: { minX: RUG.x0, maxX: RUG.x1, minZ: RUG.z0, maxZ: RUG.z1 }, surface: "tapete" }],
      objects,
      enter() {
        ctx.scene.add(root);
        root.updateMatrixWorld(true);
      },
      update(_dt, t) {
        const amp = reduced ? 0.2 : 1;
        lampPivot.rotation.z = Math.sin(t * 0.8) * 0.035 * amp;
        lampPivot.rotation.x = Math.sin(t * 0.55 + 1) * 0.025 * amp;
        // respiração da lâmpada (sem Math.random: a foto com o tempo preso é reproduzível)
        const dip = Math.sin(t * 2.3) * Math.sin(t * 7.1) > 0.92 ? 0.82 : 1;
        lamp.intensity = baseIntensity * dip * (1 + Math.sin(t * 13) * 0.012);
      },
      exit: () => ({}),
      dispose() {
        root.removeFromParent();
      },
    };
    return instance;
  },
};

/** Ponto do objeto (Ruling 4): centro XZ da caixa que envolve os `roots`. */
export function objectPoint(three: typeof THREE, roots: readonly THREE.Object3D[]): { x: number; z: number } {
  const box = new three.Box3();
  for (const root of roots) {
    root.updateWorldMatrix(true, true);
    box.expandByObject(root);
  }
  const c = box.getCenter(new three.Vector3());
  return { x: c.x, z: c.z };
}
