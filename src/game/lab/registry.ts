import type * as THREE from "three";
import type { Maker } from "../render/kit";

/**
 * Registro do laboratório de modelos (só debug, B2). Cada modelo declara o orçamento (`budget`: triângulos e
 * chamadas de desenho) e, se a ficha da peça traz, o tamanho esperado em cm (`size`). O índice é dado puro (sem
 * `three`): o e2e itera este objeto e confere cada modelo contra o próprio orçamento, então o teste cresce
 * sozinho a cada modelo novo. Os construtores moram em módulos por grupo (`groups/`), carregados por `import()`
 * só quando um modelo do grupo é pedido.
 *
 * Orçamento = valor medido de verdade + folga pequena (nunca estimado). `goal` é a meta global do plano para a
 * peça (mãos+lanterna ≤ 8 chamadas / ≤ 4000 triângulos; celular ≤ 4 / ≤ 3500): quando o medido passa dela, o
 * painel mostra a meta em vermelho e o `budget` guarda o medido (a regressão não passa dele).
 */
export type V3 = [number, number, number];
export type LabBudget = { triangles: number; calls: number };
export type LabGroup = "cinza" | "jogador" | "antessala";
export type LabMeta = { label: string; group: LabGroup; budget: LabBudget; goal?: LabBudget; size?: V3 };

/** Constrói o modelo na origem (o laboratório o centraliza). Descarte extra pelo `userData.labDispose`. */
export type LabBuild = (m: Maker) => THREE.Object3D;

export const LAB_MODELS = {
  mesa: { label: "mesa de escrever", group: "cinza", budget: { triangles: 1300, calls: 33 }, size: [120, 76, 68] },
  caderno: { label: "caderno preto", group: "cinza", budget: { triangles: 190, calls: 21 } },
  lapis: { label: "lápis", group: "cinza", budget: { triangles: 170, calls: 5 } },
  armario: { label: "armário", group: "cinza", budget: { triangles: 3560, calls: 126 } },
  porta: { label: "porta", group: "cinza", budget: { triangles: 2210, calls: 43 } },
  tapete: { label: "tapete", group: "cinza", budget: { triangles: 1760, calls: 7 } },
  lampada: { label: "luminária pendente", group: "cinza", budget: { triangles: 720, calls: 6 } },
  maos: { label: "mão da lanterna (a esquerda só sai com o celular)", group: "jogador", budget: { triangles: 1860, calls: 53 }, goal: { triangles: 4000, calls: 8 } },
  "celular-fechado": { label: "celular flip (fechado)", group: "jogador", budget: { triangles: 4270, calls: 4 }, goal: { triangles: 3500, calls: 4 } },
  "celular-aberto": { label: "celular flip (aberto)", group: "jogador", budget: { triangles: 4270, calls: 4 }, goal: { triangles: 3500, calls: 4 } },
  // Casca da Antessala (B8), sem o lote: na sala o estático vira uma malha por material (o número da sala é outro).
  // O vidro aramado é transparente dos dois lados: o three o desenha em duas passadas (+1 chamada por vidro).
  fluorescente: { label: "fluorescente apagada", group: "antessala", budget: { triangles: 450, calls: 5 }, size: [126, 9, 20] },
  "porta-norte": { label: "porta norte (dupla, vidro aramado)", group: "antessala", budget: { triangles: 2280, calls: 17 } },
  "porta-sul": { label: "porta do pátio (vidro e grade)", group: "antessala", budget: { triangles: 2620, calls: 59 } },
  janela: { label: "janela basculante com grade", group: "antessala", budget: { triangles: 1290, calls: 37 } },
  "porao-vao": { label: "vão do Porão (batente)", group: "antessala", budget: { triangles: 820, calls: 7 } },
} as const satisfies Record<string, LabMeta>;

export type LabId = keyof typeof LAB_MODELS;
export const LAB_IDS = Object.keys(LAB_MODELS) as LabId[];
export const isLabId = (id: string | null): id is LabId => id !== null && Object.hasOwn(LAB_MODELS, id);
export const labMeta = (id: LabId): LabMeta => LAB_MODELS[id];

const GROUPS: Record<LabGroup, () => Promise<Partial<Record<LabId, LabBuild>>>> = {
  cinza: () => import("./groups/cinza").then((m) => m.builders),
  antessala: () => import("./groups/antessala").then((m) => m.builders),
  jogador: () => import("./groups/jogador").then((m) => m.builders),
};

/** Carrega o grupo do modelo e devolve o construtor dele. */
export async function loadBuilder(id: LabId): Promise<LabBuild> {
  const builders = await GROUPS[LAB_MODELS[id].group]();
  const build = builders[id];
  if (!build) throw new Error(`laboratório: sem construtor para "${id}"`);
  return build;
}
