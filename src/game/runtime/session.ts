import { createGameAudio } from "../audio/game-audio";
import { bindInput, type InputBinding } from "../input/adapters";
import { isRelease, type Action } from "../input/actions";
import { cinzaLayer } from "../layers/cinza";
import { createExamine, type Examine } from "../interaction/examine";
import { createInteraction, type Interaction, type InteractionUi } from "../interaction/interaction";
import type { PromptModel } from "../interaction/targeting";
import { createLayerRunner, type LayerRunner } from "../layers/loader";
import type { ActApi, GameCtx, InteractiveObject, Layer, Line } from "../layers/types";
import { createPlayer, type Player } from "../player/controller";
import type { PhoneKey } from "../player/phone";
import { createSaveStore, type SaveApi } from "../save/store";
import { debugEnabled, installDebug, layerShot, loadShot, standaloneShot } from "./debug";
import { createEngine, type Engine } from "./engine";
import { createHintDriver, hintClockRuns, hintGapFrom, type HintDriver } from "./hints";
import { createPanels, type PanelsUi } from "./panels";
import { createPhoneFlow, readFlag, type PhoneUi } from "./phone";
import { createSettingsApplier } from "./settingsApply";
import type { PhoneAction } from "../shell/phone-menu";
import type { Settings } from "../save/schema";

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
export type { ExamineInfo, PlaceItem } from "./panels";

export type SessionUi = InteractionUi &
  PanelsUi &
  PhoneUi & {
    status(s: SessionStatus): void;
    paused(on: boolean): void;
    say(line: Line): void;
  };

export type Session = {
  retry(): void;
  /** Fecha o exame pelo botão da casca (gesto: o mouse pode travar de novo aqui). */
  closeExamine(): void;
  /** Fecha o leitor pelo botão ou pelo botão direito sobre o diálogo (gesto: o mouse pode travar de novo aqui). */
  closeReader(): void;
  /** Celular: um passo do menu (setas, Enter, toque numa linha) vindo da casca. */
  phoneNav(a: PhoneAction): void;
  /** Celular: fechar pelo botão da casca. */
  closePhone(): void;
  /** Toque: abre o celular / a lista de lugares pelos botões da casca (só andando, sem painel). */
  openPhone(): void;
  openPlaces(): void;
  /** Alterna papel e texto limpo pelo botão do leitor. */
  toggleReader(): void;
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
  /** Escada de pistas do puzzle da camada (T12): o relógio só corre andando, sem painel. */
  let hints: HintDriver | null = null;
  /** "Pausado" (o mouse caiu pelo Esc): a escada não anda (a pista sairia invisível sob o aviso). */
  let paused = false;
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

  // Áudio da sessão (T13): procedural, mudo sem som ligado no site / em modo leitura / antes do 1º gesto. Aba escondida
  // = suspende (o loop já para; o zumbido e o contexto dormem também).
  const audio = createGameAudio(save.get().settings.volume);
  const onVisibility = () => (document.hidden ? audio.suspend() : audio.resume());
  document.addEventListener("visibilitychange", onVisibility);
  cleanups.push(() => {
    document.removeEventListener("visibilitychange", onVisibility);
    audio.dispose();
  });
  if (document.hidden) audio.suspend();

  const say = (line: Line) => ui.say(line);
  /** Painéis abertos (lista de lugares, exame, leitor; o celular da T11 entra na mesma pilha). O modo é o do topo. */
  const panels = createPanels({
    ui,
    save,
    player: () => player,
    interaction: () => interaction,
    examine: () => examine,
    input: () => input,
    layer: () => runner?.current() ?? null,
  });
  const mode = panels.mode;
  const reader = panels.reader;
  const applySettings = createSettingsApplier(
    {
      fov: (v) => {
        eng.camera.fov = v;
        eng.camera.updateProjectionMatrix();
      },
      quality: (q) => eng.setQualitySetting(q),
      volume: (v) => audio.setVolume(v),
      player: (s: Settings) => player?.updateSettings(s),
    },
    save.get().settings,
  );
  /** Celular (T11): mesma pilha; o Arquivo reabre o que já foi lido (`flags["lido:<id>"]`). */
  const phone = createPhoneFlow({
    panels,
    ui,
    save,
    three: eng.three,
    camera: eng.camera,
    host,
    player: () => player,
    input: () => input,
    layer: () => runner?.current() ?? null,
    applySettings,
  });
  ui.settings(save.get().settings);
  /** Objeto cujo `act` está rodando (o exame herda o material dele para o som de pegar). */
  let acting: InteractiveObject | null = null;
  const actApi: ActApi = {
    save,
    say,
    sfx: (name) => audio.sfx(name),
    examine: (o) => {
      if (acting) audio.object(acting.material, "pick");
      panels.openExamine(o);
    },
    read: (doc) => {
      audio.paper();
      if (save.get().flags[readFlag(doc.id)] !== true) save.patch({ flags: { [readFlag(doc.id)]: true } });
      panels.openReader(doc);
    },
  };
  const ctx: GameCtx = { three: eng.three, scene: eng.scene, camera: eng.camera, kit: eng.kit, audio, say, save };

  const onAction = (a: Action) => {
    if (!player) return;
    if (mode() === "phone") return phone.handle(a);
    if (mode() !== "walk") {
      if (panels.handle(a)) return;
      // O celular (T11) trata as próprias teclas; soltar sempre chega.
      if (isRelease(a)) player.apply(a);
      return;
    }
    if (a.type === "places") return panels.openPlaces();
    if (a.type === "phone") {
      phone.open();
      return;
    }
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
      onFlashClick: () => audio.flashClick(),
      onPhoneKey: (key) => audio.phoneKey(key),
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
      act: (o) => {
        acting = o;
        try {
          o.act(actApi);
        } finally {
          acting = null;
        }
      },
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
    hints = inst.puzzle ? createHintDriver(inst.puzzle, save.get, hintGapFrom(search, debugEnabled(search)), say) : null;
    // Debug: erro depois do jogador nascer (prova que nada vaza: engine, contexto, mãos).
    if (debugFailure(search, "jogador")) throw new Error("falha de teste (?falha=jogador)");
    const saved = save.get().place;
    const start = shot?.place ?? (saved && inst.places.places[saved] ? saved : "entrada");
    player.placeAt(start);
    audio.room("calm");
    if (shot) {
      eng.freezeTime(FROZEN_T);
      // As fotos comparam pixel a pixel: a qualidade do aparelho fica presa.
      eng.setQuality(eng.info().quality);
    }
    /** Ponto de cliente → NDC do palco. */
    const ndc = (cx: number, cy: number) => {
      const r = host.getBoundingClientRect();
      return { x: ((cx - r.left) / r.width) * 2 - 1, y: -((cy - r.top) / r.height) * 2 + 1, px: cx - r.left, py: cy - r.top };
    };
    /** O objeto de segurar sob o dedo (segurar por toque, T12). */
    let fingerOn: string | null = null;
    input = bindInput(host, onAction, {
      coarse,
      mode,
      onPause: (on) => {
        paused = on;
        ui.paused(on);
      },
      onTap: (cx, cy, run) => {
        const p = ndc(cx, cy);
        player?.tap(p.x, p.y, run);
      },
      onHoldStart: (cx, cy) => {
        const p = ndc(cx, cy);
        const o = player?.pickAt(p.x, p.y);
        if (!o || !interaction?.touchHold(o, { x: p.px, y: p.py })) return false;
        fingerOn = o.id;
        player?.hands.reach();
        return true;
      },
      onHoldMove: (cx, cy) => {
        const p = ndc(cx, cy);
        return player?.pickAt(p.x, p.y)?.id === fingerOn;
      },
      onHoldEnd: (cancelled) => {
        fingerOn = null;
        if (cancelled) interaction?.cancelHold();
        else interaction?.release();
      },
    });
    return true;
  };

  const startLoop = async () => {
    await eng.start();
    if (signal.aborted || disposed) return;
    if (lost) return fail();
    ui.status("live");
    // Ocioso: o celular nasce e o programa dele compila antes da 1ª abertura (Tab não engasga).
    const warm = () => {
      if (disposed || !player) return;
      let ready: Promise<void> = Promise.resolve();
      player.hands.preparePhone(() => {
        ready = eng.precompile();
      });
      ready.catch((error: unknown) => console.error("[jogo] o celular não pré-compilou", error));
    };
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(warm, { timeout: 3000 });
    else window.setTimeout(warm, 1500);
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
          if (o.paused !== undefined) h.debug.setPaused(o.paused);
          if (o.toggle) h.toggleFlash();
          if (o.idle) h.debug.forceIdle(o.idle);
          if (o.phone) h.phone(o.phone);
          if (o.press) h.press(o.press as PhoneKey);
          if (o.step) h.debug.step(o.step, o.input ?? {});
          if (o.view !== undefined) h.debug.view(o.view);
        },
        interact: () =>
          player && interaction && examine
            ? {
                ...interaction.state(),
                target: player.aimTarget,
                prompt: lastPrompt,
                panels: panels.stack.size(),
                mode: mode(),
                examine: examine.state(),
                phone: { open: phone.state() !== null, screen: phone.state()?.screen ?? null, index: phone.state()?.index ?? 0, detail: phone.state()?.detail ?? null, rect: phone.rect() },
                reader: { open: reader.view() !== null, id: reader.view()?.doc.id ?? null, clean: reader.view()?.clean ?? false, returnTo: reader.view()?.returnTo ?? null },
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
        hints?.update(dt, hintClockRuns(mode(), paused));
        // rede de segurança: um passo da fila que fechou o celular (fora de gesto) ainda sincroniza a entrada
        if (phone.frame().emptied) input?.panelClosed();
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
      panels.closeExamine();
      // Clique no botão da casca: é gesto, o mouse pode travar de novo aqui.
      input?.panelClosed();
    },
    closeReader() {
      // Só quando a pilha esvazia o jogo volta a andar e o mouse pode travar de novo (com o celular embaixo, não).
      if (panels.closeReader().emptied) input?.panelClosed();
    },
    phoneNav(a) {
      // Tecla ou clique na casca: é gesto, o mouse pode travar de novo se o celular fechou e a pilha esvaziou.
      if (phone.nav(a).emptied) input?.panelClosed();
    },
    openPhone() {
      if (mode() === "walk") phone.open();
    },
    openPlaces() {
      if (mode() === "walk") panels.openPlaces();
    },
    closePhone() {
      if (phone.close().emptied) input?.panelClosed();
    },
    toggleReader() {
      reader.toggle();
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
      panels.closePlaces();
      // Ainda dentro do clique/Enter no botão: o adaptador pode travar o mouse de novo (bíblia 12b.5).
      input?.panelClosed();
      void player?.goTo(id);
    },
    closePlaces() {
      panels.closePlaces();
      input?.panelClosed();
    },
    dispose: teardown,
  };
}
