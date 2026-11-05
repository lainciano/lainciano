import { mergeSavePatch } from "../save/merge";
import type { SaveV1 } from "../save/schema";
import type { GameCtx, Layer, LayerInstance, Own, SavePatch } from "./types";

/** Depois de tantas falhas seguidas o shell oferece o modo leitura (a UI é dele; aqui só se conta). */
export const MAX_LOAD_FAILURES = 3;

/**
 * Em `ok`, `drain()` esvazia o coletor `own` da carga e deve rodar DEPOIS de `instance.dispose()` (o runner faz
 * isso). Em `failed`/`aborted` o carregador já drenou.
 */
export type LoadResult =
  | { ok: true; instance: LayerInstance; drain(): void }
  | { ok: false; reason: "aborted" | "failed"; error?: unknown };

const ABORTED: LoadResult = { ok: false, reason: "aborted" };

type OnError = (error: unknown) => void;

const defaultOnError: OnError = (error) => console.error("[jogo] erro na camada", error);

/** Chama `fn` sem deixar um erro dele interromper quem chamou. */
function guard(onError: OnError, fn: () => void): void {
  try {
    fn();
  } catch (error) {
    onError(error);
  }
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError";
}

/** Coletor de posse de uma carga: drena em ordem reversa e, depois de drenado, descarta `own()` tardio na hora. */
function createOwn(onError: OnError): { own: Own; drain(): void } {
  const cleanups: (() => void)[] = [];
  let drained = false;
  const add = (cleanup: () => void): void => {
    if (drained) guard(onError, cleanup);
    else cleanups.push(cleanup);
  };
  const own = (<T extends { dispose(): void }>(resource: T): T => {
    add(() => resource.dispose());
    return resource;
  }) as Own;
  own.add = add;
  return {
    own,
    drain() {
      drained = true;
      for (const cleanup of cleanups.splice(0).reverse()) guard(onError, cleanup);
    },
  };
}

/**
 * Carrega a camada respeitando o cancelamento. Contrato:
 * - sinal já abortado → `aborted`, sem chamar `layer.load`;
 * - `load` resolvido DEPOIS do abort → a instância que nasceu é descartada (`dispose` uma vez, sem `enter` nem
 *   `update`), o coletor `own` é drenado e o resultado é `aborted`;
 * - `load` que rejeita (ou lança) → drena o coletor e devolve `failed` com o erro; se o sinal já estava
 *   abortado a rejeição é só consequência do cancelamento e vira `aborted` (um erro real que não seja
 *   `AbortError` ainda vai para `onError`, para não sumir);
 * - depois do drain, qualquer `own()` tardio descarta na hora.
 * A instância devolvida em `ok` ainda não entrou (`enter` é de quem chama).
 */
export async function loadLayer(
  layer: Layer,
  ctx: GameCtx,
  signal: AbortSignal,
  onError: OnError = defaultOnError,
): Promise<LoadResult> {
  if (signal.aborted) return ABORTED;
  const { own, drain } = createOwn(onError);
  let instance: LayerInstance;
  try {
    instance = await layer.load(ctx, signal, own);
  } catch (error) {
    drain();
    if (signal.aborted) {
      if (!isAbortError(error)) onError(error);
      return ABORTED;
    }
    return { ok: false, reason: "failed", error };
  }
  if (signal.aborted) {
    guard(onError, () => instance.dispose());
    drain();
    return ABORTED;
  }
  return { ok: true, instance, drain };
}

export type LayerRunnerOptions = {
  /** Erro engolido para não travar a limpeza (exit/dispose que lançam, `save.patch` que falha). */
  onError?: OnError;
};

export type LayerRunner = {
  /**
   * Troca para `layer`: sai da camada atual (`exit` + `dispose`, e o patch dela vai para o save e para a
   * entrada da nova), cancela qualquer `enter` pendente (a chamada mais nova vence) e carrega. Durante a
   * carga `current()` é `null`. Depois de `dispose()` devolve `aborted` sem carregar.
   */
  enter(layer: Layer, save: SaveV1): Promise<LoadResult>;
  current(): LayerInstance | null;
  /** Sai da camada atual e cancela carga pendente. `null` se não havia camada ou se `exit()` lançou. */
  leave(): SavePatch | null;
  /** Fim do jogo: `leave()` gravando o patch no save; idempotente; nada nasce depois. */
  dispose(): void;
  /** Falhas de carga seguidas (zera no primeiro sucesso; cancelamento não conta). */
  failures(): number;
};

export function createLayerRunner(ctx: GameCtx, opts: LayerRunnerOptions = {}): LayerRunner {
  const onError: OnError = opts.onError ?? defaultOnError;
  let active: { inst: LayerInstance; drain(): void } | null = null;
  let pending: AbortController | null = null;
  let disposed = false;
  let failureCount = 0;

  /** exit() + dispose() da atual. Os dois rodam mesmo que o outro lance; o estado fica limpo sempre. */
  function teardown(): SavePatch | null {
    const cur = active;
    active = null;
    if (!cur) return null;
    const { inst } = cur;
    let patch: SavePatch | null = null;
    guard(onError, () => {
      patch = inst.exit();
    });
    guard(onError, () => inst.dispose());
    guard(onError, cur.drain);
    return patch;
  }

  /** Instância que nasceu mas não vai ser usada: dispose uma vez e depois o coletor da carga. */
  function discard(result: Extract<LoadResult, { ok: true }>): void {
    guard(onError, () => result.instance.dispose());
    guard(onError, result.drain);
  }

  function abortPending(): void {
    pending?.abort();
    pending = null;
  }

  function leave(): SavePatch | null {
    abortPending();
    return teardown();
  }

  return {
    async enter(layer, save) {
      if (disposed) return ABORTED;
      abortPending();
      const mine = new AbortController();
      pending = mine;

      const left = teardown();
      let nextSave = save;
      if (left) {
        guard(onError, () => ctx.save.patch(left));
        nextSave = mergeSavePatch(save, left);
      }

      const result = await loadLayer(layer, ctx, mine.signal, onError);
      if (pending === mine) pending = null;

      if (!result.ok) {
        if (mine.signal.aborted) return ABORTED;
        if (result.reason === "failed") failureCount++;
        return result;
      }
      // abortado na brecha entre o fim do load e esta continuação
      if (mine.signal.aborted || disposed) {
        discard(result);
        return ABORTED;
      }
      try {
        result.instance.enter(nextSave);
      } catch (error) {
        discard(result);
        failureCount++;
        return { ok: false, reason: "failed", error };
      }
      active = { inst: result.instance, drain: result.drain };
      failureCount = 0;
      return result;
    },

    current: () => active?.inst ?? null,

    leave,

    dispose() {
      if (disposed) return;
      disposed = true;
      const patch = leave();
      if (patch) guard(onError, () => ctx.save.patch(patch));
    },

    failures: () => failureCount,
  };
}
