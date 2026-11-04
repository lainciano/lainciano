import { initialMemory, MEMORY_LIMITS, parseMemory, validId, type MemoryV1 } from "./schema";
import { addToMap, addUnique, formatArrival, HESITATE_MS, isNewVisit, isNight, pushLast } from "./track";

/**
 * Memória do site (documento da história, §5.6): o que o jogo "lembra" do visitante, SÓ neste navegador.
 * Nada daqui sai: sem rede, sem permissões, sem impressão digital (só `language`, o ponteiro grosso e o fuso do `Intl`).
 * Não grava com o modo leitura ligado. Apagada por `wipeGame` (prefixo `lainciano:jogo:`); a chave de ativação fica.
 */
export const MEMORY_KEY = "lainciano:jogo:memoria:v1";
/** Marca de sessionStorage: some ao fechar a aba, sobrevive ao recarregar (é o que separa "reabrir" de "recarregar"). */
export const SESSION_KEY = "lainciano:jogo:memoria:sessao";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** O que o navegador diz agora (injetável nos testes). */
export type MemoryEnv = { reading: boolean; sound: boolean; scares: boolean; touch: boolean; lang: string; tz: string };

export type MemoryEvent =
  | { type: "place"; id: string; ms: number }
  | { type: "examine"; id: string }
  | { type: "hesitate"; id: string; ms: number }
  | { type: "hint"; id: string }
  | { type: "force"; id: string };

export type MemoryStore = {
  get(): MemoryV1;
  /** Abertura do jogo: conta visita nova (regra em `isNewVisit`), registra a hora local de chegada e as preferências. */
  visit(): MemoryV1;
  record(event: MemoryEvent): void;
  /** Fechamento do jogo: guarda quando saiu. */
  close(): void;
  /** Esquece tudo (a memória em uso e a chave); a próxima abertura é a 1ª visita. */
  wipe(): void;
};

/** Leitura do navegador. `sound` e `scares` vêm do jogo/site (não há como saber daqui sem importar o motor de som). */
export function browserEnv(extra: { sound: boolean; scares: boolean }): MemoryEnv {
  let tz = "";
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    /* sem Intl: fuso vazio */
  }
  let touch = false;
  try {
    touch = window.matchMedia("(pointer: coarse)").matches;
  } catch {
    /* sem matchMedia: ponteiro */
  }
  return {
    reading: document.documentElement.dataset.reading === "on",
    sound: extra.sound,
    scares: extra.scares,
    touch,
    lang: typeof navigator === "undefined" ? "" : (navigator.language ?? ""),
    tz,
  };
}

const clamp = (n: number) => (Number.isFinite(n) ? Math.min(Math.max(0, Math.round(n)), MEMORY_LIMITS.maxMs) : 0);
const label = (s: string) => s.slice(0, MEMORY_LIMITS.label);

/** `session`: sessionStorage (marca de aba). `env`: leitura do navegador (modo leitura, prefs, idioma, fuso). */
export function createMemoryStore(
  storage: StorageLike,
  now: () => number,
  opts: { session?: StorageLike; env?: () => MemoryEnv } = {},
): MemoryStore {
  const env = opts.env ?? (() => browserEnv({ sound: false, scares: true }));
  const reading = () => {
    try {
      return env().reading;
    } catch {
      return false;
    }
  };

  let raw: string | null = null;
  try {
    raw = storage.getItem(MEMORY_KEY);
  } catch {
    /* storage bloqueado: segue só em memória */
  }
  let state = parseMemory(raw, now());

  const persist = () => {
    if (reading()) return; // modo leitura: nada é gravado
    try {
      storage.setItem(MEMORY_KEY, JSON.stringify(state));
    } catch {
      /* cota cheia ou bloqueado */
    }
  };
  const sessionFlag = (): boolean => {
    try {
      return opts.session?.getItem(SESSION_KEY) === "1";
    } catch {
      return false;
    }
  };
  const markSession = () => {
    try {
      opts.session?.setItem(SESSION_KEY, "1");
    } catch {
      /* sem sessionStorage: todo carregamento conta como abertura */
    }
  };

  /** Tudo o que muda a memória passa por aqui: modo leitura não muda nem grava. */
  const apply = (fn: (m: MemoryV1, t: number) => MemoryV1) => {
    if (reading()) return;
    const t = now();
    state = { ...fn(state, t), lastAt: t };
    persist();
  };

  return {
    get: () => state,
    visit() {
      if (reading()) return state;
      const t = now();
      const fresh = isNewVisit(state, t, sessionFlag());
      const e = env();
      const date = new Date(t);
      apply((m) => ({
        ...m,
        visits: fresh ? m.visits + 1 : m.visits,
        arrivals: fresh ? pushLast(m.arrivals, formatArrival(date), MEMORY_LIMITS.arrivals) : m.arrivals,
        night: fresh ? isNight(date) : m.night,
        prefs: { sound: e.sound, reading: e.reading, scares: e.scares },
        device: e.touch ? "touch" : "pointer",
        lang: label(e.lang),
        tz: label(e.tz),
      }));
      markSession();
      return state;
    },
    record(event) {
      if (!validId(event.id)) return;
      apply((m) => {
        switch (event.type) {
          case "place":
            return { ...m, placeMs: addToMap(m.placeMs, event.id, clamp(event.ms), MEMORY_LIMITS.placeMs) };
          case "examine":
            return {
              ...m,
              firstExamined: m.firstExamined ?? event.id,
              examined: addUnique(m.examined, event.id, MEMORY_LIMITS.examined),
            };
          case "hesitate": {
            const ms = clamp(event.ms);
            return ms > HESITATE_MS ? { ...m, hesitations: pushLast(m.hesitations, { id: event.id, ms }, MEMORY_LIMITS.hesitations) } : m;
          }
          case "hint":
            return { ...m, hints: addToMap(m.hints, event.id, 1, MEMORY_LIMITS.hints) };
          case "force":
            return { ...m, forced: addUnique(m.forced, event.id, MEMORY_LIMITS.forced) };
        }
      });
    },
    close() {
      apply((m, t) => ({ ...m, lastClosedAt: t }));
    },
    wipe() {
      state = initialMemory(now());
      try {
        storage.removeItem(MEMORY_KEY);
        opts.session?.removeItem(SESSION_KEY);
      } catch {
        /* nada a apagar */
      }
    },
  };
}
