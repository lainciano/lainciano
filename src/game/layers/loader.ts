import type { SaveV1 } from "../save/schema";
import type { GameCtx, Layer, LayerInstance, SavePatch } from "./types";

/** Depois de tantas falhas seguidas o shell oferece o modo leitura (a UI é dele; aqui só se conta). */
export const MAX_LOAD_FAILURES = 3;

export type LoadResult =
  | { ok: true; instance: LayerInstance }
  | { ok: false; reason: "aborted" | "failed"; error?: unknown };

const ABORTED: LoadResult = { ok: false, reason: "aborted" };

type OnError = (error: unknown) => void;

/** Chama `fn` sem deixar um erro dele interromper quem chamou. */
function guard(onError: OnError | undefined, fn: () => void): void {
  try {
    fn();
  } catch (error) {
    onError?.(error);
  }
}

/**
 * Carrega a camada respeitando o cancelamento. Contrato:
 * - sinal já abortado → `aborted`, sem chamar `layer.load`;
 * - `load` resolvido DEPOIS do abort → a instância que nasceu é descartada (`dispose` uma vez, sem `enter` nem
 *   `update`) e o resultado é `aborted`;
 * - `load` que rejeita (ou lança) → `failed` com o erro; se o sinal já estava abortado a rejeição é só
 *   consequência do cancelamento e vira `aborted`.
 * A instância devolvida em `ok` ainda não entrou (`enter` é de quem chama).
 */
export async function loadLayer(
  layer: Layer,
  ctx: GameCtx,
  signal: AbortSignal,
  onError?: OnError,
): Promise<LoadResult> {
  if (signal.aborted) return ABORTED;
  let instance: LayerInstance;
  try {
    instance = await layer.load(ctx, signal);
  } catch (error) {
    return signal.aborted ? ABORTED : { ok: false, reason: "failed", error };
  }
  if (signal.aborted) {
    guard(onError, () => instance.dispose());
    return ABORTED;
  }
  return { ok: true, instance };
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
  const onError: OnError = opts.onError ?? ((error) => console.error("[jogo] erro na camada", error));
  let instance: LayerInstance | null = null;
  let pending: AbortController | null = null;
  let disposed = false;
  let failureCount = 0;

  /** exit() + dispose() da atual. Os dois rodam mesmo que o outro lance; o estado fica limpo sempre. */
  function teardown(): SavePatch | null {
    const inst = instance;
    instance = null;
    if (!inst) return null;
    let patch: SavePatch | null = null;
    guard(onError, () => {
      patch = inst.exit();
    });
    guard(onError, () => inst.dispose());
    return patch;
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
        nextSave = { ...save, ...left };
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
        guard(onError, () => result.instance.dispose());
        return ABORTED;
      }
      try {
        result.instance.enter(nextSave);
      } catch (error) {
        guard(onError, () => result.instance.dispose());
        failureCount++;
        return { ok: false, reason: "failed", error };
      }
      instance = result.instance;
      failureCount = 0;
      return result;
    },

    current: () => instance,

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
