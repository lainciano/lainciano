import type { Box2, Vec2 } from "../../world/collision";
import type { Place, PlaceGraph } from "../../world/places";
import type { SurfaceZone } from "../../world/surfaces";

/**
 * Planta da Antessala (bíblia §2: 4,5 × 5,0 m, pé-direito 2,6 m), a antiga recepção do Sanatório do Descoberto.
 * Lógica pura: `scene.ts` monta a casca nestas medidas, os modelos das tarefas B9–B13 nascem nas pegadas daqui e o
 * `places.test.ts` prova lugares, arestas, alcance e o aperto com os mesmos números. Metros; x para leste, z para o
 * sul (o norte é −z), y para cima; a sala é centrada na origem. As posições seguem o protótipo 7 (aprovado), com o
 * estar recuado para o aperto de 1,3 m.
 *
 *                       N · porta dupla de vidro aramado (fechada; abre na B17) · leitor
 *        ┌────────────────────[════]──────────────────────┐
 *        │ quadro     relógio      ·porta-norte  ·fundo   │
 *        │ ·quadro    ·relogio          ┌──────┐          │
 *     O  ▒ ·janela                ·balcao│balcão│ ·atras-  │  L
 *  janela▒                              │  L   ├──┐balcao │
 *  (lago)│                              └──────┴──┘       ║ porta do Porão
 *        │[sofá]  [mesa]  ·centro              ·porta-porao║
 *        │[sofá] ░tapete░       ·cabideiro  ·vitrine [vit.]│
 *        │ allstar [aquec.] ·entrada   (cab.)      placa  │
 *        └────────────────────[    ]─────────────────────┘
 *                       S · porta de vidro e grade (entrada, fechada atrás)
 */

export const ROOM = { minX: -2.25, maxX: 2.25, minZ: -2.5, maxZ: 2.5, h: 2.6 } as const;
export const PLAYER_RADIUS = 0.22;
/** Folga mínima do lugar até as caixas, além do raio do jogador (o teste cobra). */
export const PLACE_CLEARANCE = 0.25;

/** Altura da barra de tinta a óleo verde-hospital ("até meia parede"); acima, o bege. É linha da grade. */
export const WALL_BAND = 1.25;
/** Granilite em painéis de 1 m com as juntas em x, z = ±0,5 e ±1,5 (como o protótipo): bordas simétricas. */
export const FLOOR_ORIGIN = { x: 0.5, z: 0.5 } as const;

/* ------------------------------------------------------------------ vãos */

/** Porta norte: dupla, ferro grafite e vidro aramado, para o corredor das alas (fechada; a B17 a abre). */
export const NORTH_DOOR = { x0: -0.5, x1: 0.7, top: 2.1, wallZ: ROOM.minZ } as const;
/** Porta sul: vidro e grade, para o pátio de onde a pessoa vem (fechada atrás de quem entrou). */
export const SOUTH_DOOR = { x0: -0.7, x1: 0.7, top: 2.15, wallZ: ROOM.maxZ } as const;
/** Janela basculante com grade na parede oeste (z ao longo da parede), peitoril a 1,05 m. */
export const WINDOW = { z0: -1.45, z1: -0.35, sill: 1.05, top: 2.05, wallX: ROOM.minX } as const;
/** Vão da porta do Porão na parede leste (a folha de madeira é da B11). */
export const BASEMENT_DOOR = { z0: 0.5, z1: 1.3, top: 2.0, wallX: ROOM.maxX } as const;
/** Espessura das paredes nos vãos (o reboco que a janela e as portas mostram de lado). */
export const WALL_T = 0.2;

/* ------------------------------------------------------------------ pegadas (os objetos das B9–B13 nascem nelas) */

/** Balcão em L (B9): o corredor principal norte–sul e a volta para leste na ponta sul. Tampo a ~1 m. */
export const COUNTER = { x0: 0.67, x1: 1.33, z0: -1.65, z1: 0.25, top: 0.996 } as const;
export const COUNTER_RETURN = { x0: 1.33, x1: 1.69, z0: -0.39, z1: 0.25 } as const;
/** Sofá de courino encostado na parede oeste (B12). */
export const SOFA = { x0: -2.25, x1: -1.45, z0: 0.26, z1: 1.98 } as const;
/** Mesinha diante do sofá (B12), recuada para o aperto: a passagem até o balcão fica com ≥ 1,3 m. */
export const SIDE_TABLE = { x0: -1.18, x1: -0.62, z0: 0.58, z1: 1.02 } as const;
/** Tapete do estar (zona `tapete`; o modelo é da B12) e as duas tábuas soltas debaixo dele (só som). */
export const RUG = { x0: -1.4, x1: 0.15, z0: 0.2, z1: 1.9 } as const;
export const LOOSE_BOARD = { x0: -0.5, x1: -0.2, z0: 1.42, z1: 1.86 } as const;
/** Aquecedor elétrico antigo junto à parede sul (B12): a resistência é o preenchimento quente. */
export const HEATER = { x0: -1.5, x1: -1.0, z0: 2.12, z1: 2.5 } as const;
/** Base do cabideiro (B13), à direita de quem entra. */
export const COAT_RACK = { x0: 0.75, x1: 1.15, z0: 1.95, z1: 2.35 } as const;
/** Vitrine de remédios do prédio (B13), encostada na parede leste. */
export const VITRINE = { x0: 1.86, x1: 2.25, z0: 1.46, z1: 2.3 } as const;

const center = (a: number, b: number) => (a + b) / 2;

/** Lâmpada âmbar pendente sobre o balcão (instalada por ele): pivô no teto, lâmpada a 1,86 m (0,86 m do tampo). */
export const LAMP = { x: 0.98, z: -0.55, bulbY: 1.86 } as const;
/** Fluorescentes do prédio, apagadas. A de índice 0 é a da estranheza 1 (acende uma vez, fraca, e apaga). */
export const FLUORESCENTS = [
  { x: -0.85, z: -0.7, oddity: true },
  { x: -0.6, z: 1.4, oddity: false },
] as const;
/** Resistência do aquecedor (preenchimento quente assado). */
export const HEATER_GLOW = { x: center(HEATER.x0, HEATER.x1), y: 0.36, z: HEATER.z0 - 0.04 } as const;

/* ------------------------------------------------------------------ lugares */

const dir = (x: number, z: number) => {
  const len = Math.hypot(x, z);
  return { x: x / len, z: z / len };
};
/** Direção de (x, z) para o alvo (tx, tz). */
const toward = (x: number, z: number, tx: number, tz: number) => dir(tx - x, tz - z);

const P = (id: string, x: number, z: number, face: Vec2, pitch: number, name: string, hidden?: boolean): Place => ({ id, x, z, face, pitch, name, ...(hidden ? { hidden } : {}) });

export const ANTESSALA_PLACES: Record<string, Place> = {
  // junto da porta do pátio (fechada atrás), um pouco à direita: o plano de entrada da bíblia §3 (janela ao fundo à
  // esquerda, balcão e lâmpada no centro, o Porão na borda direita)
  entrada: P("entrada", 0.3, 2.24, dir(0.07, -1), -0.04, "a entrada"),
  centro: P("centro", 0.2, 0.75, toward(0.2, 0.75, 1.0, -0.55), -0.1, "o meio da sala"),
  balcao: P("balcao", 0.3, -0.55, toward(0.3, -0.55, 1.0, -0.7), -0.5, "o balcão"),
  "atras-balcao": P("atras-balcao", 1.95, -1.0, toward(1.95, -1.0, 1.0, -0.95), -0.55, "atrás do balcão"),
  fundo: P("fundo", 1.5, -2.12, toward(1.5, -2.12, 1.55, -1.0), -0.1, "o fundo", true),
  "porta-norte": P("porta-norte", 0.1, -1.85, toward(0.1, -1.85, 0.25, -2.5), -0.05, "a porta norte"),
  relogio: P("relogio", -1.0, -1.65, toward(-1.0, -1.65, -1.0, -2.5), 0.08, "o relógio"),
  quadro: P("quadro", -1.75, -1.6, toward(-1.75, -1.6, -1.78, -2.5), -0.02, "o quadro de cortiça"),
  janela: P("janela", -1.3, -0.85, toward(-1.3, -0.85, -2.25, -0.9), -0.02, "a janela"),
  sofa: P("sofa", -0.9, 1.5, toward(-0.9, 1.5, -2.2, 1.15), -0.2, "o sofá"),
  cabideiro: P("cabideiro", 0.45, 1.6, toward(0.45, 1.6, 0.95, 2.15), -0.05, "o cabideiro"),
  vitrine: P("vitrine", 1.35, 1.4, toward(1.35, 1.4, 2.15, 1.95), -0.05, "a vitrine"),
  "porta-porao": P("porta-porao", 1.6, 0.9, toward(1.6, 0.9, 2.25, 0.9), 0, "a porta do Porão"),
};

/**
 * Caminhos andáveis (o teste prova cada um com o raio do jogador). Simétrico. O canto atrás do balcão só se alcança
 * contornando-o pelo norte (`fundo`, escondido da lista): bíblia §2, "só visível contornando-o".
 */
export const ANTESSALA_GRAPH: PlaceGraph = {
  places: ANTESSALA_PLACES,
  edges: {
    entrada: ["centro", "cabideiro", "sofa", "balcao"],
    centro: ["entrada", "balcao", "sofa", "janela", "cabideiro", "vitrine", "porta-porao"],
    balcao: ["entrada", "centro", "porta-norte", "relogio", "janela", "cabideiro"],
    "porta-norte": ["balcao", "relogio", "fundo"],
    fundo: ["porta-norte", "atras-balcao"],
    "atras-balcao": ["fundo"],
    relogio: ["balcao", "porta-norte", "quadro", "janela"],
    quadro: ["relogio", "janela"],
    janela: ["centro", "balcao", "relogio", "quadro"],
    sofa: ["entrada", "centro"],
    cabideiro: ["entrada", "centro", "balcao", "vitrine"],
    vitrine: ["centro", "cabideiro", "porta-porao"],
    "porta-porao": ["centro", "vitrine"],
  },
};

/* ------------------------------------------------------------------ colisão e superfícies */

/** Paredes como caixas de 0,3 m por fora da sala (as portas estão fechadas e o Porão, trancado: os vãos não abrem). */
const OUT = 0.3;
export const WALL_COLLIDERS: Box2[] = [
  { minX: ROOM.minX - OUT, maxX: ROOM.maxX + OUT, minZ: ROOM.minZ - OUT, maxZ: ROOM.minZ },
  { minX: ROOM.minX - OUT, maxX: ROOM.maxX + OUT, minZ: ROOM.maxZ, maxZ: ROOM.maxZ + OUT },
  { minX: ROOM.minX - OUT, maxX: ROOM.minX, minZ: ROOM.minZ, maxZ: ROOM.maxZ },
  { minX: ROOM.maxX, maxX: ROOM.maxX + OUT, minZ: ROOM.minZ, maxZ: ROOM.maxZ },
];

const box = (b: { x0: number; x1: number; z0: number; z1: number }): Box2 => ({ minX: b.x0, maxX: b.x1, minZ: b.z0, maxZ: b.z1 });

/**
 * Móveis: a projeção no chão de cada pegada. Valem desde a casca (B8): a planta é esta e os modelos das B9–B13
 * nascem dentro delas (com `?debug=1&placeholders=1` as caixas cinza mostram onde).
 */
export const FURNITURE_COLLIDERS: Box2[] = [box(COUNTER), box(COUNTER_RETURN), box(SOFA), box(SIDE_TABLE), box(HEATER), box(COAT_RACK), box(VITRINE)];

/** Zonas de passo: o tapete (abafado) e, por baixo dele, as duas tábuas soltas (a última zona vence). */
export const SURFACES: SurfaceZone[] = [
  { box: box(RUG), surface: "tapete" },
  { box: box(LOOSE_BOARD), surface: "tabua-solta" },
];

/* ------------------------------------------------------------------ âncoras dos objetos (previstas) */

/**
 * Ponto de cada objeto da bíblia (§7) e de cada peça da casca que vira objeto, com o lugar de onde se mexe nele.
 * Âncora EXPLÍCITA (revisa o Ruling 4: não é mais o centro da caixa dos `roots`): o ponto que a mira e o alcance
 * usam. Previstas aqui (B8) a partir das pegadas; os modelos das B9–B13 as confirmam.
 */
export const OBJECT_ANCHORS: readonly { id: string; place: string; anchor: Vec2 }[] = [
  { id: "celular", place: "balcao", anchor: { x: 0.92, z: -0.08 } },
  { id: "carta", place: "balcao", anchor: { x: 0.95, z: -0.07 } },
  { id: "livro-visitas", place: "balcao", anchor: { x: 1.0, z: -1.18 } },
  { id: "maquina", place: "balcao", anchor: { x: 1.04, z: -0.52 } },
  { id: "caneca", place: "balcao", anchor: { x: 0.84, z: 0.14 } },
  { id: "relogio", place: "relogio", anchor: { x: -1.0, z: -2.43 } },
  { id: "gaveta", place: "atras-balcao", anchor: { x: 1.36, z: -0.95 } },
  { id: "cabideiro", place: "cabideiro", anchor: { x: 0.95, z: 2.15 } },
  { id: "casaco", place: "cabideiro", anchor: { x: 0.9, z: 2.05 } },
  { id: "chapeu", place: "cabideiro", anchor: { x: 1.0, z: 2.17 } },
  { id: "leitor", place: "porta-norte", anchor: { x: 0.86, z: -2.47 } },
  { id: "porta-norte", place: "porta-norte", anchor: { x: 0.1, z: -2.5 } },
  { id: "quadro", place: "quadro", anchor: { x: -1.78, z: -2.47 } },
  { id: "shape", place: "sofa", anchor: { x: -2.2, z: 1.12 } },
  { id: "allstar", place: "sofa", anchor: { x: -1.78, z: 2.18 } },
  { id: "radio", place: "sofa", anchor: { x: -0.95, z: 0.78 } },
  { id: "mesinha", place: "sofa", anchor: { x: center(SIDE_TABLE.x0, SIDE_TABLE.x1), z: center(SIDE_TABLE.z0, SIDE_TABLE.z1) } },
  { id: "sofa", place: "sofa", anchor: { x: -1.85, z: 1.12 } },
  { id: "aquecedor", place: "sofa", anchor: { x: center(HEATER.x0, HEATER.x1), z: 2.3 } },
  { id: "janela", place: "janela", anchor: { x: WINDOW.wallX, z: center(WINDOW.z0, WINDOW.z1) } },
  { id: "muda", place: "janela", anchor: { x: -2.16, z: -0.62 } },
  { id: "regador", place: "janela", anchor: { x: -2.15, z: -1.18 } },
  { id: "vitrine", place: "vitrine", anchor: { x: 2.06, z: 1.88 } },
  { id: "placa", place: "vitrine", anchor: { x: 1.32, z: 2.48 } },
  { id: "porta-porao", place: "porta-porao", anchor: { x: BASEMENT_DOOR.wallX, z: center(BASEMENT_DOOR.z0, BASEMENT_DOOR.z1) } },
];

/* ------------------------------------------------------------------ luz da janela (hora local) */

export type WindowLight = "dia" | "entardecer" | "noite";

/**
 * Estado da luz da janela pela hora LOCAL (decisão 6 do dono: a janela não pode contradizer o relógio do celular).
 * Dia 06:00–16:59, entardecer 17:00–18:59, noite 19:00–05:59. A lâmpada âmbar fica sempre acesa. A estranheza 1
 * (fluorescente) usa tempo de JOGO, nunca esta hora.
 */
export function windowLightAt(hour: number): WindowLight {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  if (h >= 6 && h < 17) return "dia";
  if (h >= 17 && h < 19) return "entardecer";
  return "noite";
}
