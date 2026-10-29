import { z } from "zod";

/** Camadas do jogo. A T7 reaproveita este tipo (hoje só as duas da Fase 1A). */
export type LayerId = "cinza" | "antessala";

export const SAVE_VERSION = 1;

const settingsSchema = z.object({
  fov: z.number().min(55).max(80),
  bob: z.boolean(),
  scares: z.boolean(),
  subtitles: z.boolean(),
  quality: z.union([z.literal("auto"), z.literal(480), z.literal(360), z.literal(240)]),
  sensitivity: z.number().positive().finite(),
  /** T11: volume do jogo (0..1). Saves de antes dele não o têm: entra 1. */
  volume: z.number().min(0).max(1).default(1),
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  fov: 62,
  bob: true,
  scares: true,
  subtitles: true,
  quality: "auto",
  sensitivity: 1,
  volume: 1,
};

// Sem `.strict()`: campos extras são ignorados para tolerar versões futuras da mesma major.
const saveV1Schema = z.object({
  version: z.literal(SAVE_VERSION),
  layer: z.enum(["cinza", "antessala"]),
  place: z.string().nullable(),
  items: z.array(z.string()),
  flags: z.record(z.string(), z.boolean()),
  puzzles: z.record(z.string(), z.unknown()),
  relics: z.array(z.object({ id: z.string(), clean: z.boolean() })),
  settings: settingsSchema,
  startedAt: z.number().finite(),
  playMs: z.number().finite().nonnegative(),
});

export type SaveV1 = {
  version: 1;
  layer: LayerId;
  place: string | null;
  items: string[];
  flags: Record<string, boolean>;
  puzzles: Record<string, unknown>;
  relics: { id: string; clean: boolean }[];
  settings: Settings;
  startedAt: number;
  playMs: number;
};

export function initialSave(now: number): SaveV1 {
  return {
    version: SAVE_VERSION,
    layer: "cinza",
    place: null,
    items: [],
    flags: {},
    puzzles: {},
    relics: [],
    settings: { ...DEFAULT_SETTINGS },
    startedAt: now,
    playMs: 0,
  };
}

/** Sobe versões antigas uma a uma. Na v1 não há o que subir; o que não se reconhece passa intacto e o schema decide. */
export function migrate(data: unknown): unknown {
  return data;
}

/** Ausente → inicial. Inválido ou de versão desconhecida → inicial, e `broken` carrega o texto original para ser guardado. */
export function parseSave(raw: string | null, now: number): { save: SaveV1; broken: string | null } {
  if (raw === null) return { save: initialSave(now), broken: null };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { save: initialSave(now), broken: raw };
  }
  const parsed = saveV1Schema.safeParse(migrate(data));
  if (!parsed.success) return { save: initialSave(now), broken: raw };
  return { save: parsed.data, broken: null };
}
