// `zod/mini` como o save (nunca o `zod` completo: pesa no chunk do jogo). A memória só usa `success`, nunca a mensagem.
import * as z from "zod/mini";

export const MEMORY_VERSION = 1;

/** Tetos: nada na memória cresce sem limite (o JSON gravado fica abaixo de 4 KB mesmo no pior caso). */
export const MEMORY_LIMITS = {
  /** Tamanho máximo de um id de lugar/objeto/pista; maior é ignorado. */
  idLength: 24,
  arrivals: 8,
  placeMs: 16,
  examined: 32,
  hesitations: 20,
  hints: 8,
  forced: 12,
  /** Uma hesitação ou um lugar não passam de 24 h (contra relógio maluco). */
  maxMs: 86_400_000,
  /** Idioma e fuso são rótulos curtos ("pt-BR", "America/Sao_Paulo"). */
  label: 40,
} as const;

/** Ids são os do jogo (lugares, objetos, camadas): letras, números e `-_:.`, sem texto livre do visitante. */
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9:_.-]*$/;
export const validId = (id: unknown): id is string => typeof id === "string" && id.length <= MEMORY_LIMITS.idLength && ID_RE.test(id);

const ms = z.number().check(z.minimum(0), z.maximum(MEMORY_LIMITS.maxMs));
const id = z.string().check(z.maxLength(MEMORY_LIMITS.idLength), z.regex(ID_RE));
const label = z.string().check(z.maxLength(MEMORY_LIMITS.label));
const list = <T extends z.core.SomeType>(item: T, max: number) => z.array(item).check(z.maxLength(max));

const memoryV1Schema = z.object({
  version: z.literal(MEMORY_VERSION),
  visits: z.number().check(z.minimum(0), z.maximum(1_000_000)),
  firstAt: z.number(),
  lastAt: z.number(),
  lastClosedAt: z.nullable(z.number()),
  arrivals: list(z.string().check(z.regex(/^\d\d:\d\d$/)), MEMORY_LIMITS.arrivals),
  night: z.boolean(),
  placeMs: z.record(id, ms).check(z.refine((r) => Object.keys(r).length <= MEMORY_LIMITS.placeMs)),
  firstExamined: z.nullable(id),
  examined: list(id, MEMORY_LIMITS.examined),
  hesitations: list(z.object({ id, ms }), MEMORY_LIMITS.hesitations),
  hints: z.record(id, z.number().check(z.minimum(0), z.maximum(1000))).check(z.refine((r) => Object.keys(r).length <= MEMORY_LIMITS.hints)),
  forced: list(id, MEMORY_LIMITS.forced),
  prefs: z.object({ sound: z.boolean(), reading: z.boolean(), scares: z.boolean() }),
  device: z.union([z.literal("touch"), z.literal("pointer")]),
  lang: label,
  tz: label,
});

export type MemoryV1 = {
  version: 1;
  visits: number;
  firstAt: number;
  lastAt: number;
  lastClosedAt: number | null;
  /** "HH:MM" na hora LOCAL de cada chegada (as últimas 8). Nunca um timestamp. */
  arrivals: string[];
  /** A última chegada foi de madrugada (00:00–05:00, hora local). */
  night: boolean;
  placeMs: Record<string, number>;
  firstExamined: string | null;
  examined: string[];
  hesitations: { id: string; ms: number }[];
  hints: Record<string, number>;
  forced: string[];
  prefs: { sound: boolean; reading: boolean; scares: boolean };
  device: "touch" | "pointer";
  lang: string;
  tz: string;
};

export function initialMemory(now: number): MemoryV1 {
  return {
    version: MEMORY_VERSION,
    visits: 0,
    firstAt: now,
    lastAt: now,
    lastClosedAt: null,
    arrivals: [],
    night: false,
    placeMs: {},
    firstExamined: null,
    examined: [],
    hesitations: [],
    hints: {},
    forced: [],
    prefs: { sound: false, reading: false, scares: true },
    device: "pointer",
    lang: "",
    tz: "",
  };
}

/** Ausente, ilegível ou fora do schema → inicial. Sem cópia do texto antigo: memória não é progresso. */
export function parseMemory(raw: string | null, now: number): MemoryV1 {
  if (raw === null) return initialMemory(now);
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return initialMemory(now);
  }
  const parsed = memoryV1Schema.safeParse(data);
  return parsed.success ? (parsed.data as MemoryV1) : initialMemory(now);
}
