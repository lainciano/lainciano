import type * as THREE from "three";
import type { Box2 } from "../../world/collision";
import type { ActApi, Doc, InteractiveObject, Layer, LayerInstance, LayerPuzzle } from "../types";
import { createMaker, DOOR_HINGE, DOOR_LEAK } from "./models";
import { CINZA_GRAPH, DOOR, DOOR_FLAG, DOOR_LEAF, FURNITURE_COLLIDERS, RUG, WALL_COLLIDERS } from "./places";
import { cinzaPatch, cinzaPuzzle, cinzaSteps, doorHold, DOOR_TARGET, KEY_ITEM, readCinza, type CinzaAction } from "./puzzle";
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

/** Linhas da camada (conteúdo da sala, como os nós do protótipo). As do puzzle moram em `puzzle.ts` (rascunho). */
const LINES = {
  mesa: "madeira gasta onde os braços apoiavam. alguém escreveu aqui por muito tempo.",
  caderno: "um caderno de capa preta, com elástico. está fechado.",
} as const;

/**
 * O bilhete da mesa (T10): lido, não examinado (o exame fica para o caderno, que se vira na mão; o bilhete é texto).
 * RASCUNHO, a aprovar pelo dono (T12): diz onde está a chave (armário, prateleira de cima, no fundo), que é a porta DO
 * ARMÁRIO que emperra, e bate com as falas e com a 2ª pista.
 */
export const BILHETE: Doc = {
  id: "bilhete",
  title: "bilhete",
  text: "se você acordou aqui, ainda dá tempo.\n\na chave da porta está no armário,\nna prateleira de cima, lá no fundo.\na porta do armário emperra: puxe com jeito.\n\nnão demore. a luz não aguenta a noite toda.",
  look: { tone: "#d6c9a6", seed: 421, folds: 2, ruled: true, signature: "· l." },
};

/** A chave no celular (Itens). Rascunho. */
const ITEMS = { [KEY_ITEM]: { name: "chave da porta", desc: "ferro escuro, comprida, o dente gasto. estava no fundo da prateleira de cima." } };

/** Quanto a porta abre (rad, para dentro da sala) e em quanto tempo (s). Forçada, abre menos (torta). */
const DOOR_SWING = 1.45;
const DOOR_SWING_FORCED = 1.2;
const DOOR_OPEN_SECONDS = 1.6;

/** Espessura da folha (m), como em `buildDoor`. */
const LEAF_T = 0.035;
/** Pedaços de colisão ao longo da folha aberta (uma caixa só cobriria o triângulo vazio da diagonal). */
const LEAF_PIECES = 3;

/**
 * Colisão da folha aberta no chão: `LEAF_PIECES` caixas ao longo dela, da dobradiça à ponta, cada uma envolvendo as
 * duas faces daquele trecho (+1 cm). A folha gira em −y a partir da dobradiça (x0 + batente + folga, 4 cm para
 * dentro da parede) e a espessura fica do lado do batente de encosto.
 */
export function openLeafColliders(angle: number): Box2[] {
  const hx = DOOR.x0 + 0.033;
  const hz = DOOR.wallZ - 0.04;
  const c = Math.cos(angle);
  const sn = Math.sin(angle);
  // espessura: o vetor (0, 0, −t) girado junto com a folha
  const tx = sn * LEAF_T;
  const tz = -c * LEAF_T;
  const out: Box2[] = [];
  for (let i = 0; i < LEAF_PIECES; i++) {
    const a = (i / LEAF_PIECES) * DOOR_LEAF.w;
    const b = ((i + 1) / LEAF_PIECES) * DOOR_LEAF.w;
    const xs = [hx + a * c, hx + b * c, hx + a * c + tx, hx + b * c + tx];
    const zs = [hz + a * sn, hz + b * sn, hz + a * sn + tz, hz + b * sn + tz];
    out.push({ minX: Math.min(...xs) - 0.01, maxX: Math.max(...xs) + 0.01, minZ: Math.max(DOOR.wallZ, Math.min(...zs) - 0.01), maxZ: Math.max(...zs) + 0.01 });
  }
  return out;
}

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

    const speak = (api: Pick<ActApi, "say">, text: string) => api.say({ text, kind: "speech" });

    // porta norte: a folha gira na dobradiça; aberta, ganha colisão e mostra o escuro do outro lado
    const hinge = built.door.getObjectByName(DOOR_HINGE);
    const leak = built.door.getObjectByName(DOOR_LEAK);
    const beyond = built.door.getObjectByName("porta-alem");
    if (!hinge || !leak || !beyond) throw new Error("porta sem dobradiça");
    // o escuro de lá não é a porta: sai do objeto interativo (o ponto, a mira e o brilho são só da porta)
    built.door.updateMatrixWorld(true);
    root.attach(beyond);
    const colliders: Box2[] = [...WALL_COLLIDERS, ...FURNITURE_COLLIDERS];
    let swing: { from: number; to: number; t: number } | null = null;
    let doorShown = false;
    /** Abre a porta (na hora, ao entrar com ela aberta; ou animada, ao abrir agora). Idempotente. */
    const showDoorOpen = (forced: boolean, animate: boolean) => {
      if (doorShown) return;
      doorShown = true;
      const to = -(forced ? DOOR_SWING_FORCED : DOOR_SWING);
      beyond.visible = true;
      leak.visible = false;
      colliders.push(...openLeafColliders(-to));
      if (animate && !prefersReducedMotion()) swing = { from: hinge.rotation.y, to, t: 0 };
      else {
        hinge.rotation.y = to;
        hinge.updateMatrixWorld(true);
      }
    };

    /** Aplica uma ação ao puzzle: grava o estado (puzzles.cinza, a chave no inventário, a flag da porta) e executa os efeitos. */
    const dispatch = (api: Pick<ActApi, "save" | "say" | "sfx">, a: CinzaAction) => {
      const save = api.save.get();
      const prev = readCinza(save);
      const { state, effects } = cinzaPuzzle.reduce(prev, a);
      if (state !== prev) api.save.patch(cinzaPatch(save, state));
      for (const e of effects) {
        if (e.type === "say") speak(api, e.text);
        else if (e.type === "sfx") api.sfx(e.name);
        else if (e.type === "open" && e.target === DOOR_TARGET) showDoorOpen(state.forced, true);
      }
    };
    const objects: InteractiveObject[] = [
      { id: "mesa", place: "mesa", roots: [built.table], material: "madeira", verb: () => "examinar a mesa", enabled: () => true, act: (api) => speak(api, LINES.mesa) },
      {
        id: "bilhete",
        place: "mesa",
        roots: [built.note],
        material: "papel",
        verb: () => "ler o bilhete",
        enabled: () => true,
        act: (api) => {
          dispatch(api, { type: "read-note" });
          api.read(BILHETE);
        },
      },
      {
        id: "caderno",
        place: "mesa",
        roots: [built.notebook],
        material: "papel",
        verb: () => "abrir o caderno",
        enabled: () => true,
        act: (api) => api.examine({ root: built.notebook, distance: 0.38, title: "caderno", text: LINES.caderno }),
      },
      {
        id: "armario",
        place: "armario",
        roots: [built.wardrobe],
        material: "madeira",
        verb: (s) => {
          const c = readCinza(s);
          return !c.keyTaken && (c.noteRead || c.hints >= 2) ? "pegar a chave na prateleira" : "abrir o armário";
        },
        enabled: () => true,
        act: (api) => dispatch(api, { type: "take-key" }),
      },
      {
        // E usa a chave (ou bate, trancada); depois da 3ª pista e sem a chave, é de segurar: forçar (a saída).
        id: "porta",
        place: "porta",
        roots: [built.door],
        material: "madeira",
        verb: (s) => {
          const c = readCinza(s);
          return c.doorOpen ? "olhar o outro lado" : c.keyTaken ? "usar a chave na porta" : "abrir a porta";
        },
        enabled: () => true,
        hold: doorHold,
        // só chega aqui pelo segurar completo quando a porta é de segurar (o toque rápido dá a dica)
        act: (api) => dispatch(api, { type: doorHold(api.save.get()) ? "force-door" : "use-door" }),
      },
    ];

    const reduced = prefersReducedMotion();
    const { lampPivot, lamp } = built;
    const baseIntensity = lamp.intensity;
    const puzzle: LayerPuzzle = {
      hints: cinzaPuzzle.hints,
      given: (s) => readCinza(s).hints,
      steps: (s) => cinzaSteps(readCinza(s)),
      solved: (s) => cinzaPuzzle.solved(readCinza(s)),
      hint: () => dispatch({ save: ctx.save, say: ctx.say, sfx: () => {} }, { type: "hint" }),
    };
    const instance: LayerInstance = {
      places: CINZA_GRAPH,
      catalog: { docs: [BILHETE], items: ITEMS },
      colliders,
      puzzle,
      surfaces: [{ box: { minX: RUG.x0, maxX: RUG.x1, minZ: RUG.z0, maxZ: RUG.z1 }, surface: "tapete" }],
      objects,
      enter(save) {
        const c = readCinza(save);
        if (c.doorOpen || save.flags[DOOR_FLAG] === true) showDoorOpen(c.forced, false);
        ctx.scene.add(root);
        root.updateMatrixWorld(true);
      },
      update(dt, t) {
        if (swing) {
          swing.t = Math.min(1, swing.t + dt / DOOR_OPEN_SECONDS);
          // começa devagar (a folha pesada desgruda), solta no meio, assenta no fim
          const k = swing.t * swing.t * (3 - 2 * swing.t);
          hinge.rotation.y = swing.from + (swing.to - swing.from) * k;
          hinge.updateMatrixWorld(true);
          if (swing.t >= 1) swing = null;
        }
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
