import { STORAGE_KEYS } from "@/interaction/boot";
import { mergeSavePatch } from "./merge";
import { initialSave, isValidSave, parseSave, type SaveV1 } from "./schema";

export const GAME_KEY_PREFIX = "lainciano:jogo:";
export const SAVE_KEY = `${GAME_KEY_PREFIX}save:v1`;
export const BROKEN_KEY = `${GAME_KEY_PREFIX}save:quebrado`;
/**
 * Chave de ativação (`lainciano:jogo:v1`, a do `jogo on/off`). DECISÃO (T13): `wipeGame` (o "desconectar" da 1B, que
 * apaga save, memória e o que o jogo aprendeu do visitante) NÃO apaga a ativação: quem desliga o jogo é `jogo off`
 * (contrato §6, coluna "apagado por"). Apagá-la fecharia o jogo na cara de quem só pediu para esquecer o progresso e
 * faria o `?jogo=1` voltar a ser preciso. A 1B só confirma o texto da tela de "desconectar".
 */
export const ACTIVATION_KEY = STORAGE_KEYS.game;

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
      const next = mergeSavePatch(state, p);
      // Um patch que quebra o schema (fov fora da faixa, lugar `undefined`…) gravaria um save que falha ao recarregar
      // e joga o progresso fora: rejeita, avisa e deixa o estado como estava.
      if (!isValidSave(next)) {
        console.error("[jogo] patch do save rejeitado (fora do schema)", Object.keys(p));
        return;
      }
      state = next;
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
          if (k !== null && k.startsWith(GAME_KEY_PREFIX) && k !== ACTIVATION_KEY) keys.push(k);
        }
        for (const k of keys) storage.removeItem(k);
      } catch {
        /* storage bloqueado: nada a apagar */
      }
      state = initialSave(now());
    },
  };
}
