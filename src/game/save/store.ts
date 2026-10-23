import { mergeSavePatch } from "./merge";
import { initialSave, parseSave, type SaveV1 } from "./schema";

export const GAME_KEY_PREFIX = "lainciano:jogo:";
export const SAVE_KEY = `${GAME_KEY_PREFIX}save:v1`;
export const BROKEN_KEY = `${GAME_KEY_PREFIX}save:quebrado`;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "length" | "key">;

export type SaveApi = {
  get(): SaveV1;
  patch(p: Partial<SaveV1>): void;
  reset(): void;
  wipeGame(): void;
};

/** Estado em memória é a verdade; o storage é best-effort (cota cheia ou bloqueio não derrubam o jogo). */
export function createSaveStore(storage: StorageLike, now: () => number): SaveApi {
  const read = (key: string): string | null => {
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  };
  const write = (key: string, value: string): void => {
    try {
      storage.setItem(key, value);
    } catch {
      /* cota ou storage bloqueado: segue só em memória */
    }
  };

  const { save, broken } = parseSave(read(SAVE_KEY), now());
  let state = save;
  if (broken !== null && read(BROKEN_KEY) === null) write(BROKEN_KEY, broken);

  const persist = () => write(SAVE_KEY, JSON.stringify(state));

  return {
    get: () => state,
    patch(p) {
      state = mergeSavePatch(state, p);
      persist();
    },
    reset() {
      state = initialSave(now());
      persist();
    },
    wipeGame() {
      try {
        const keys: string[] = [];
        for (let i = 0; i < storage.length; i++) {
          const k = storage.key(i);
          if (k !== null && k.startsWith(GAME_KEY_PREFIX)) keys.push(k);
        }
        for (const k of keys) storage.removeItem(k);
      } catch {
        /* storage bloqueado: nada a apagar */
      }
      state = initialSave(now());
    },
  };
}
