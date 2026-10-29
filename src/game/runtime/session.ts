import type { GameAudio } from "../audio/types";
import { bindInput, type InputBinding } from "../input/adapters";
import { isRelease, type Action, type InputMode } from "../input/actions";
import { cinzaLayer } from "../layers/cinza";
import { createExamine, type Examine } from "../interaction/examine";
import { createInteraction, type Interaction, type InteractionUi } from "../interaction/interaction";
import type { PromptModel } from "../interaction/targeting";
import { createLayerRunner, type LayerRunner } from "../layers/loader";
import type { ActApi, GameCtx, Layer, LayerInstance, Line } from "../layers/types";
import { createPlayer, type Player } from "../player/controller";
import { createSaveStore, type SaveApi } from "../save/store";
import { createPanelStack } from "../shell/panelStack";
import { debugEnabled, installDebug, layerShot, loadShot, standaloneShot } from "./debug";
import { createEngine, type Engine } from "./engine";

/**
 * Sessão do jogo aberto (fora do React, carregada por `import()` com o three): engine, save, debug, a camada pelo
 * runner da T7, o jogador e a entrada. O shell só desenha o que a sessão manda (`SessionUi`) e repassa os cliques.
 *
 * Fluxo: engine → debug → (foto de referência `psx-ref`, que substitui a camada) ou camada pelo runner →
 * jogador no lugar salvo (ou na entrada) → entrada ligada → `engine.start()` (compileAsync com a sala e as mãos já
 * na cena) → "live". Falha de carga: "a porta emperrou" + tentar de novo (`retry`), sem derrubar o engine.
 * Qualquer erro depois que o engine existe (jogador, entrada, debug, compile) descarta TUDO antes de subir: o
 * contexto WebGL e o slot do orçamento nunca ficam presos.
 */

export type SessionStatus = "loading" | "live" | "failed" | "stuck";
export type PlaceItem = { id: string; name: string; here: boolean };

export type ExamineInfo = { title: string; text: string };

export type SessionUi = InteractionUi & {
  status(s: SessionStatus): void;
  /** Lista de lugares aberta (`L`) ou fechada (`null`). */
  places(list: PlaceItem[] | null): void;
  paused(on: boolean): void;
  say(line: Line): void;
  /** Exame aberto (título e texto) ou fechado (`null`). */
  examine(info: ExamineInfo | null): void;
};

export type Session = {
  retry(): void;
  /** Fecha o exame pelo botão da casca (gesto: o mouse pode travar de novo aqui). */
  closeExamine(): void;
  /** Escolha na lista (clique/Enter num botão: é gesto, então o mouse pode travar de novo aqui). */
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

/** Debug: `?debug=1&falha=<nome>` (só o nome pedido). */
const debugFailure = (search: string, name: string) => debugEnabled(search) && new URLSearchParams(search).get("falha") === name;

export async function startSession(host: HTMLElement, ui: SessionUi, signal: AbortSignal): Promise<Session | null> {
  const search = window.location.search;
  const save: SaveApi = createSaveStore(lazyStorage, Date.now);
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const shot = layerShot(search);

  let engine: Engine | null = null;
  let runner: LayerRunner | null = null;
  let player: Player | null = null;
  let input: InputBinding | null = null;
  let interaction: Interaction | null = null;
  let examine: Examine | null = null;
  /** Painéis abertos (lista de lugares, exame; o leitor e o celular entram aqui nas T10/T11). O modo é o do topo. */
  const panels = createPanelStack();
  const mode = (): InputMode => panels.mode();
  let lastPrompt: PromptModel | null = null;
  let lost = false;
  let disposed = false;
  let enteredOnce = false;
  const cleanups: (() => void)[] = [];

  /** Descarta tudo o que nasceu, na ordem inversa. Idempotente: pode vir do erro, da perda, do abort e do shell. */
  const teardown = () => {
    if (disposed) return;
    disposed = true;
    const steps = [
      () => input?.(),
      () => interaction?.dispose(),
      () => examine?.dispose(),
      () => player?.dispose(),
      () => runner?.dispose(),
      ...cleanups.splice(0).reverse(),
      () => engine?.dispose(),
    ];
    for (const step of steps) {
      try {
        step();
      } catch (error) {
        console.error("[jogo] erro ao fechar a sessão", error);
      }
    }
    input = null;
    interaction = null;
    examine = null;
    player = null;
    runner = null;
    engine = null;
  };
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

  const say = (line: Line) => ui.say(line);
  const actApi: ActApi = { save, say, sfx: () => {}, examine: (o) => openExamine(o) };
  const ctx: GameCtx = { three: eng.three, scene: eng.scene, camera: eng.camera, kit: eng.kit, audio: silentAudio, say, save };

  /** Com algum painel aberto a lanterna guarda, a mira e o aviso se apagam; pilha vazia, tudo volta. */
  const syncPanels = () => {
    const open = panels.size() > 0;
    player?.setPanel(open);
    interaction?.setPanel(open);
  };
  const closePlaces = () => {
    if (panels.top()?.mode !== "menu") return;
    panels.pop();
    syncPanels();
    ui.places(null);
  };
  function openExamine(o: Parameters<ActApi["examine"]>[0]) {
    if (!examine || panels.has("examine")) return;
    // Primeiro o painel (apaga o brilho do alvo e baixa a mira): a cópia lê o emissivo dos materiais, que não pode
    // estar na fase do pulso. Vale também para o segurar que conclui dentro do quadro.
    panels.push({ mode: "examine", id: o.title });
    syncPanels();
    examine.open(o.root, { distance: o.distance, title: o.title, text: o.text });
    ui.examine({ title: o.title, text: o.text });
    // Aberto por um aperto (adaptador já viu) ou por um segurar que completou no quadro (não viu): solta o mouse.
    input?.panelOpened();
  }
  const closeExamine = () => {
    if (panels.top()?.mode !== "examine") return;
    examine?.close();
    panels.pop();
    syncPanels();
    ui.examine(null);
  };
  const openPlaces = () => {
    if (!player || !runner?.current()) return;
    const inst = runner.current() as LayerInstance;
    const state = save.get();
    const here = player.place;
    const list = Object.values(inst.places.places)
      .filter((p) => !p.hidden && !(p.locked && p.locked(state)))
      .map((p) => ({ id: p.id, name: p.name, here: p.id === here }));
    panels.push({ mode: "menu" });
    syncPanels();
    ui.places(list);
  };

  const onAction = (a: Action) => {
    if (!player) return;
    const m = mode();
    if (m === "menu") {
      if (a.type === "places" || a.type === "back") closePlaces();
      // Soltar (parar, deixar de correr/agachar/espiar) chega sempre ao jogador: abrir a lista com W segurado
      // não deixa o jogador andando sozinho depois.
      else if (isRelease(a)) player.apply(a);
      return;
    }
    if (m === "examine") {
      if (a.type === "back") closeExamine();
      else if (a.type === "rotate") examine?.rotate(a.dx, a.dy);
      else if (a.type === "zoom") examine?.zoom(a.delta);
      else if (isRelease(a)) player.apply(a);
      return;
    }
    if (m !== "walk") {
      // Leitor e celular (T10/T11) tratam as próprias teclas; soltar sempre chega.
      if (isRelease(a)) player.apply(a);
      return;
    }
    if (a.type === "places") return openPlaces();
    if (a.type === "cycle") return interaction?.cycle();
    player.apply(a);
    if (a.type === "interact") {
      if (a.down) interaction?.press();
      else interaction?.release();
    }
  };

  /** Entra na camada; em sucesso cria o jogador e liga a entrada. Devolve se deu certo. */
  const enterLayer = async (): Promise<boolean> => {
    runner ??= createLayerRunner(ctx);
    const layer = debugFailure(search, "camada") && !enteredOnce ? failingOnce(cinzaLayer) : cinzaLayer;
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
      // Foto de referência: sem balanço nem respiração, quadro igual a cada execução.
      still: !!shot,
      onPlace: (id) => {
        if (id) save.patch({ place: id });
      },
      onAct: (o) => interaction?.activate(o),
    });
    examine = createExamine(eng, { reduced: () => player?.reduced ?? false });
    interaction = createInteraction({
      three: eng.three,
      camera: eng.camera,
      player,
      objects: inst.objects,
      save: save.get,
      act: (o) => o.act(actApi),
      coarse,
      ui: {
        prompt: (p) => {
          lastPrompt = p;
          ui.prompt(p);
        },
        reticle: (r) => ui.reticle(r),
        notice: (n) => ui.notice(n),
      },
    });
    // Debug: erro depois do jogador nascer (prova que nada vaza: engine, contexto, mãos).
    if (debugFailure(search, "jogador")) throw new Error("falha de teste (?falha=jogador)");
    const saved = save.get().place;
    const start = shot?.place ?? (saved && inst.places.places[saved] ? saved : "entrada");
    player.placeAt(start);
    if (shot) {
      eng.freezeTime(FROZEN_T);
      // As fotos comparam pixel a pixel: a qualidade do aparelho fica presa.
      eng.setQuality(eng.info().quality);
    }
    input = bindInput(host, onAction, {
      coarse,
      mode,
      onPause: (on) => ui.paused(on),
      onTap: (cx, cy, run) => {
        const r = host.getBoundingClientRect();
        player?.tap(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1, run);
      },
    });
    return true;
  };

  const startLoop = async () => {
    await eng.start();
    if (signal.aborted || disposed) return;
    if (lost) return fail();
    ui.status("live");
  };

  try {
    cleanups.push(
      installDebug(eng, () => save.get().layer, save.get, {
        // Em viagem o jogador não está em lugar nenhum: `null`, não o lugar salvo de antes.
        place: () => (player ? player.place : save.get().place),
        setCamera: (pose) => {
          if (player) player.debugPose(pose);
          else {
            eng.camera.position.set(pose.x, pose.y, pose.z);
            eng.camera.rotation.set(pose.pitch, pose.yaw, 0, "YXZ");
            eng.camera.updateMatrixWorld();
          }
        },
        hands: (v) => player?.setHandsVisible(v),
        handsState: () => player?.hands.state() ?? null,
        handsDebug: (o) => {
          const h = player?.hands;
          if (!h) return;
          if (o.still !== undefined) h.debug.setStill(o.still);
          if (o.toggle) h.toggleFlash();
          if (o.idle) h.debug.forceIdle(o.idle);
          if (o.phone) h.phone(o.phone);
          if (o.press) h.press(o.press);
          if (o.step) h.debug.step(o.step, o.input ?? {});
          if (o.view !== undefined) h.debug.view(o.view);
        },
        interact: () =>
          player && interaction && examine
            ? {
                ...interaction.state(),
                target: player.aimTarget,
                prompt: lastPrompt,
                panels: panels.size(),
                mode: mode(),
                examine: examine.state(),
                cameraChildren: eng.camera.children.length,
              }
            : null,
        aimAt: (id) => {
          const o = runner?.current()?.objects.find((x) => x.id === id);
          if (!o || !interaction) return false;
          interaction.face(o);
          return true;
        },
        objectVisible: (id, v) => {
          for (const root of runner?.current()?.objects.find((o) => o.id === id)?.roots ?? []) root.visible = v;
        },
      }),
    );
    cleanups.push(
      eng.onFrame((dt, t) => {
        runner?.current()?.update(dt, t);
        player?.update(dt);
        examine?.update(dt);
        interaction?.update(dt, t);
      }),
    );
    if (standaloneShot(search)) {
      // Cena de referência de debug (`psx-ref`): entra antes do start para ser compilada junto, sem camada.
      const disposeShot = await loadShot(eng, search, signal);
      if (disposeShot) cleanups.push(disposeShot);
      if (!signal.aborted) await startLoop();
    } else if (await enterLayer()) {
      await startLoop();
    }
  } catch (error) {
    teardown();
    throw error;
  }
  if (signal.aborted) {
    teardown();
    return null;
  }

  return {
    closeExamine() {
      closeExamine();
      // Clique no botão da casca: é gesto, o mouse pode travar de novo aqui.
      input?.panelClosed();
    },
    retry() {
      if (disposed || player) return;
      ui.status("loading");
      enterLayer()
        .then((ok) => (ok ? startLoop() : undefined))
        .catch((error: unknown) => {
          console.error("[jogo] a sessão caiu ao tentar de novo", error);
          ui.status("failed");
          teardown();
        });
    },
    choosePlace(id) {
      closePlaces();
      // Ainda dentro do clique/Enter no botão: o adaptador pode travar o mouse de novo (bíblia 12b.5).
      input?.panelClosed();
      void player?.goTo(id);
    },
    closePlaces() {
      closePlaces();
      input?.panelClosed();
    },
    dispose: teardown,
  };
}
