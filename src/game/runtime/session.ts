import type { GameAudio } from "../audio/types";
import { bindInput } from "../input/adapters";
import type { Action, InputMode } from "../input/actions";
import { cinzaLayer } from "../layers/cinza";
import { createLayerRunner, type LayerRunner } from "../layers/loader";
import type { ActApi, GameCtx, Layer, LayerInstance, Line } from "../layers/types";
import { createPlayer, type Player } from "../player/controller";
import { createSaveStore, type SaveApi } from "../save/store";
import { debugEnabled, installDebug, layerShot, loadShot, standaloneShot } from "./debug";
import { createEngine, type Engine } from "./engine";

/**
 * Sessão do jogo aberto (fora do React, carregada por `import()` com o three): engine, save, debug, a camada pelo
 * runner da T7, o jogador e a entrada. O shell só desenha o que a sessão manda (`SessionUi`) e repassa os cliques.
 *
 * Fluxo: engine → debug → (foto de referência `psx-ref`, que substitui a camada) ou camada pelo runner →
 * jogador no lugar salvo (ou na entrada) → entrada ligada → `engine.start()` (compileAsync com a sala e as mãos já
 * na cena) → "live". Falha de carga: "a porta emperrou" + tentar de novo (`retry`), sem derrubar o engine.
 */

export type SessionStatus = "loading" | "live" | "failed" | "stuck";
export type PlaceItem = { id: string; name: string; here: boolean };

export type SessionUi = {
  status(s: SessionStatus): void;
  /** Lista de lugares aberta (`L`) ou fechada (`null`). */
  places(list: PlaceItem[] | null): void;
  paused(on: boolean): void;
  say(line: Line): void;
};

export type Session = {
  retry(): void;
  choosePlace(id: string): void;
  closePlaces(): void;
  dispose(): void;
};

// O save lê o localStorage a cada chamada (o store já trata a exceção de storage bloqueado).
const lazyStorage = {
  getItem: (key: string) => window.localStorage.getItem(key),
  setItem: (key: string, value: string) => window.localStorage.setItem(key, value),
  removeItem: (key: string) => window.localStorage.removeItem(key),
  key: (index: number) => window.localStorage.key(index),
  get length() {
    return window.localStorage.length;
  },
};

/** Áudio mudo até a T13 (a superfície já é a do contrato). */
const silentAudio: GameAudio = { step() {}, object() {}, room() {}, suspend() {}, resume() {} };

/** Tempo preso das fotos de referência (grão e balanço estáveis entre capturas). */
const FROZEN_T = 1;

/** Debug: `?debug=1&falha=camada` faz a primeira carga falhar (prova o "a porta emperrou" no e2e). */
function failingOnce(layer: Layer): Layer {
  let failed = false;
  return {
    ...layer,
    load(ctx, signal, own) {
      if (!failed) {
        failed = true;
        return Promise.reject(new Error("falha de teste (?falha=camada)"));
      }
      return layer.load(ctx, signal, own);
    },
  };
}

export async function startSession(host: HTMLElement, ui: SessionUi, signal: AbortSignal): Promise<Session | null> {
  const search = window.location.search;
  const save: SaveApi = createSaveStore(lazyStorage, Date.now);
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  let engine: Engine | null = null;
  let lost = false;
  let disposed = false;
  const cleanups: (() => void)[] = [];
  const fail = () => {
    if (!signal.aborted && !disposed) ui.status("failed");
  };

  const created = await createEngine(host, {
    coarse,
    settings: save.get().settings,
    signal,
    // O loop já parou; o engine é descartado já (slot e canvas), o aviso fica até sair.
    onLost: () => {
      lost = true;
      // O aviso antes do descarte: `fail` não fala com uma sessão já descartada.
      fail();
      teardown();
    },
  });
  if (signal.aborted) {
    created?.dispose();
    return null;
  }
  if (!created) {
    fail();
    return null;
  }
  engine = created;
  const eng = created;

  let runner: LayerRunner | null = null;
  let player: Player | null = null;
  let unbind: (() => void) | null = null;
  let mode: InputMode = "walk";
  const shot = layerShot(search);

  function teardown() {
    if (disposed) return;
    disposed = true;
    unbind?.();
    unbind = null;
    player?.dispose();
    player = null;
    runner?.dispose();
    runner = null;
    for (const fn of cleanups.splice(0).reverse()) {
      try {
        fn();
      } catch (error) {
        console.error("[jogo] erro ao fechar a sessão", error);
      }
    }
    engine?.dispose();
    engine = null;
  }

  cleanups.push(
    installDebug(eng, () => save.get().layer, save.get, {
      place: () => player?.place ?? save.get().place,
      setCamera: (pose) => {
        if (player) player.debugPose(pose);
        else {
          eng.camera.position.set(pose.x, pose.y, pose.z);
          eng.camera.rotation.set(pose.pitch, pose.yaw, 0, "YXZ");
          eng.camera.updateMatrixWorld();
        }
      },
      hands: (v) => player?.setHandsVisible(v),
    }),
  );

  const say = (line: Line) => ui.say(line);
  const actApi: ActApi = { save, say, sfx: () => {}, examine: () => {} };
  const ctx: GameCtx = { three: eng.three, scene: eng.scene, camera: eng.camera, kit: eng.kit, audio: silentAudio, say, save };
  let enteredOnce = false;

  const closePlaces = () => {
    if (mode !== "menu") return;
    mode = "walk";
    ui.places(null);
  };
  const openPlaces = () => {
    if (!player || !runner?.current()) return;
    const inst = runner.current() as LayerInstance;
    const state = save.get();
    const here = player.place;
    const list = Object.values(inst.places.places)
      .filter((p) => !p.hidden && !(p.locked && p.locked(state)))
      .map((p) => ({ id: p.id, name: p.name, here: p.id === here }));
    mode = "menu";
    ui.places(list);
  };

  const onAction = (a: Action) => {
    if (!player) return;
    if (mode === "menu") {
      if (a.type === "places" || a.type === "back") closePlaces();
      return;
    }
    if (a.type === "places") return openPlaces();
    player.apply(a);
  };

  /** Entra na camada; em sucesso cria o jogador e liga a entrada. Devolve se deu certo. */
  const enterLayer = async (): Promise<boolean> => {
    runner ??= createLayerRunner(ctx);
    const layer = debugEnabled(search) && new URLSearchParams(search).get("falha") === "camada" && !enteredOnce ? failingOnce(cinzaLayer) : cinzaLayer;
    enteredOnce = true;
    const result = await runner.enter(layer, save.get());
    if (signal.aborted || disposed) return false;
    if (!result.ok) {
      if (result.reason === "failed") {
        console.error("[jogo] a camada não carregou", result.error);
        ui.status("stuck");
      }
      return false;
    }
    const inst = result.instance;
    player = createPlayer(eng, inst, save.get().settings, {
      save: save.get,
      audio: ctx.audio,
      onPlace: (id) => {
        if (id) save.patch({ place: id });
      },
      onAct: (o) => o.act(actApi),
    });
    const saved = save.get().place;
    const start = shot?.place ?? (saved && inst.places.places[saved] ? saved : "entrada");
    player.placeAt(start);
    if (shot) {
      eng.freezeTime(FROZEN_T);
      // As fotos comparam pixel a pixel: a qualidade do aparelho fica presa.
      eng.setQuality(eng.info().quality);
    }
    const stage = host;
    unbind = bindInput(stage, onAction, {
      coarse,
      mode: () => mode,
      onPause: (on) => ui.paused(on),
      onTap: (cx, cy, run) => {
        const r = stage.getBoundingClientRect();
        player?.tap(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1, run);
      },
    });
    return true;
  };

  cleanups.push(
    eng.onFrame((dt, t) => {
      runner?.current()?.update(dt, t);
      player?.update(dt);
    }),
  );

  const startLoop = async () => {
    await eng.start();
    if (signal.aborted || disposed) return;
    if (lost) return fail();
    ui.status("live");
  };

  if (standaloneShot(search)) {
    // Cena de referência de debug (`psx-ref`): entra antes do start para ser compilada junto, sem camada.
    const disposeShot = await loadShot(eng, search, signal);
    if (signal.aborted) {
      disposeShot?.();
      return null;
    }
    if (disposeShot) cleanups.push(disposeShot);
    await startLoop();
  } else if (await enterLayer()) {
    await startLoop();
  }
  if (signal.aborted) {
    teardown();
    return null;
  }

  return {
    retry() {
      if (disposed || player) return;
      ui.status("loading");
      void enterLayer().then((ok) => (ok ? startLoop() : undefined));
    },
    choosePlace(id) {
      closePlaces();
      void player?.goTo(id);
    },
    closePlaces,
    dispose: teardown,
  };
}
