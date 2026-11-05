"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";
import { STORAGE_KEYS } from "@/interaction/boot";
import { readingStore } from "@/interaction/reading-mode/store";
import { RELICS } from "@/interaction/relics/catalog";
import { relicStore, useRelics } from "@/interaction/relics/store";
import { ambienceDirector } from "@/interaction/sound/ambience";
import { soundEngine, useSoundEnabled, type DroneHandle } from "@/interaction/sound/engine";
import { VolumeControl } from "@/interaction/sound/VolumeControl";
import type { limiar } from "@/lib/content/copy";
import { pauseLenis, resumeLenis } from "@/lib/lenis-bridge";
import { getGsap, loadGsap } from "@/lib/motion";
import { fillTemplate } from "@/lib/template";
import { bootState, closeOutcome, stripWon, type Act } from "./sequence";
import { limiarStore, type CloseReason } from "./store";

/** Rótulos do Limiar (só o tipo: os valores descem do servidor por props). */
export type LimiarLabels = typeof limiar;

type Origin = { x: number; y: number };

/** Contrato com a ilha `LimiarStage` (atos 2 a 5), carregada por `import()` só com o Limiar aberto. */
export type StageProps = {
  labels: LimiarLabels;
  siteName: string;
  startAt: Exclude<Act, "som">; // sempre "abertura" depois da escolha
  origin: Origin | null; // ponto da escolha, para a brasa (null: veio do teclado, centro)
  hudCounterRef: RefObject<HTMLElement | null>; // alvo do voo da relíquia
  onTaken(): void; // a relíquia foi pega (gesto): vale para a concessão no fechamento, inclusive pular/Esc
  onCollected(): void; // a relíquia chegou ao contador: o pip acende
  onComplete(): void; // fim da cortina
};

type Phase = "som" | "saindo" | "palco";

const OWNER = "limiar";

let stageModule: Promise<ComponentType<StageProps>> | null = null;
function loadStage(): Promise<ComponentType<StageProps>> {
  stageModule ??= import("./LimiarStage").then((mod) => mod.default);
  stageModule.catch(() => {
    stageModule = null; // falha de rede: a próxima abertura tenta de novo
  });
  return stageModule;
}

// A saída animada do ato Som (`playExit`, em transitions.ts, módulo que o palco também usa) só baixa com o
// Limiar aberto (fora do JS inicial), junto com o GSAP.
let exitModule: Promise<typeof import("./transitions")> | null = null;
function loadExit(): Promise<typeof import("./transitions")> {
  exitModule ??= import("./transitions");
  exitModule.catch(() => {
    exitModule = null;
  });
  return exitModule;
}

/**
 * Casca do Limiar (no JS inicial, no lugar do Portal): diálogo modal com a faixa de HUD própria, o "pular"
 * e o ato Som. O LIMIAR_BOOT_SCRIPT abre o diálogo antes da hidratação; o console reabre pelo `limiarStore`.
 * Os atos 2 a 5 chegam por `import()` na ilha `LimiarStage`. Fechar passa sempre pelo `limiarStore.close`.
 */
export function Limiar({ siteName, labels }: { siteName: string; labels: LimiarLabels }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const emberRef = useRef<HTMLDivElement>(null);
  const withSoundRef = useRef<HTMLButtonElement>(null);
  const silentRef = useRef<HTMLButtonElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const droneRef = useRef<DroneHandle | null>(null);
  const exitRef = useRef<{ kill(): void } | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const activeRef = useRef(false);
  const choosingRef = useRef(false);
  const collectedRef = useRef(false);
  const runRef = useRef(0); // cada fechamento invalida a escolha em andamento
  const [phase, setPhase] = useState<Phase>("som");
  const [Stage, setStage] = useState<ComponentType<StageProps> | null>(null);
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [collected, setCollected] = useState(false);
  const source = useSyncExternalStore(limiarStore.subscribe, limiarStore.getSource, () => null);
  const sound = useSoundEnabled();
  const won = useRelics().won;
  const lit = stripWon(won, collected);
  // Pip que a Relíquia acabou de acender (ainda não concedida: a concessão é no fechamento) dá um pulo.
  const fresh = collected && !won.includes("limiar");

  const stopDrone = () => {
    droneRef.current?.stop();
    droneRef.current = null;
  };

  // Prévia do drone ao passar/focar "com som": só depois do primeiro gesto (antes, só as barras animam).
  const startPreview = () => {
    if (droneRef.current || choosingRef.current || !soundEngine.isUnlocked()) return;
    droneRef.current = soundEngine.drone("preview");
  };

  const choose = (on: boolean, event: ReactMouseEvent<HTMLButtonElement>) => {
    const scene = sceneRef.current;
    const ember = emberRef.current;
    if (choosingRef.current || !limiarStore.isOpen() || !scene || !ember) return;
    choosingRef.current = true;
    const run = runRef.current;
    stopDrone();
    soundEngine.setEnabled(on);
    if (on) soundEngine.bell();
    // Clique de teclado chega com detail 0 e sem coordenadas: a brasa nasce no centro.
    const point = event.detail > 0 ? { x: event.clientX, y: event.clientY } : null;
    const chosen = event.currentTarget;
    const other = chosen === withSoundRef.current ? silentRef.current : withSoundRef.current;
    setOrigin(point);
    setPhase("saindo");
    // A brasa segura no centro até a ilha chegar (sem prazo: no máximo o tempo da rede).
    loadExit()
      .then(({ playExit }) => {
        if (run !== runRef.current) return;
        const exit = playExit(scene, ember, chosen, other, point);
        exitRef.current = exit;
        return exit.done;
      })
      .then(() => loadStage())
      .then(
        (component) => {
          if (run !== runRef.current) return;
          setStage(() => component);
          setPhase("palco");
        },
        () => {
          if (run === runRef.current) limiarStore.close("skip"); // a ilha não veio: não prende o visitante
        },
      );
  };

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const root = document.documentElement;
    const silence = () => {
      droneRef.current?.stop();
      droneRef.current = null;
    };
    // O boot já abriu o diálogo: avisa o store antes dos efeitos das salas (o prazo do useIntentReady lê
    // isOpen() uma vez só). Efeito de layout roda antes de todo efeito passivo do mesmo commit.
    // Esc antes da hidratação fecha o diálogo nativo: vale como pular, sem reabrir.
    const boot = bootState(root.dataset.limiar === "open", dialog.open);
    if (boot === "open") limiarStore.open("boot");
    else if (boot === "skipped") {
      delete root.dataset.limiar;
      try {
        if (!localStorage.getItem(STORAGE_KEYS.sound)) soundEngine.setEnabled(false);
      } catch {}
    }

    const activate = () => {
      if (activeRef.current || !limiarStore.isOpen()) return;
      activeRef.current = true;
      const focused = document.activeElement;
      returnFocusRef.current =
        focused instanceof HTMLElement && focused !== document.body && !dialog.contains(focused) ? focused : null;
      if (!dialog.open) dialog.showModal();
      root.dataset.limiar = "open";
      pauseLenis(OWNER);
      ambienceDirector.hold();
      void loadGsap().catch(() => {});
      void loadExit().catch(() => {});
      void loadStage().catch(() => {});
      // Reaberto pelo console: o foco vai para a escolha atual.
      if (limiarStore.getSource() === "console") {
        requestAnimationFrame(() => (soundEngine.isEnabled() ? withSoundRef : silentRef).current?.focus());
      }
    };

    // Ordem do fechamento (spec Limiar 6, plano T5): saída gravada, drone, diálogo, Lenis, ambiência, foco e,
    // por último, a relíquia — o toast e a platina aparecem sobre a página real, nunca sob o diálogo.
    const deactivate = (reason: CloseReason) => {
      if (!activeRef.current) return;
      activeRef.current = false;
      runRef.current += 1;
      choosingRef.current = false;
      const outcome = closeOutcome({
        reason,
        collected: collectedRef.current,
        hasRelic: relicStore.getSnapshot().won.includes("limiar"),
        hasSoundPref: soundEngine.hasChosen(),
      });
      if (outcome.writeSoundOff) soundEngine.setEnabled(false);
      if (outcome.enableReading) readingStore.set("on");
      silence();
      exitRef.current?.kill();
      exitRef.current = null;
      if (dialog.open) dialog.close();
      delete root.dataset.limiar;
      resumeLenis(OWNER);
      ambienceDirector.release();
      const back = returnFocusRef.current?.isConnected ? returnFocusRef.current : document.querySelector("main");
      returnFocusRef.current = null;
      if (back && !back.hasAttribute("tabindex") && back.tagName === "MAIN") back.tabIndex = -1;
      back?.focus({ preventScroll: true });
      // Volta ao ato Som para uma reabertura pelo console (estilos e cache do GSAP da saída saem junto).
      const animated = [sceneRef.current, emberRef.current, withSoundRef.current, silentRef.current].filter((el) => el !== null);
      getGsap()?.gsap.set(animated, { clearProps: "all" });
      animated.forEach((el) => el.removeAttribute("style"));
      collectedRef.current = false;
      setCollected(false);
      setOrigin(null);
      setPhase("som");
      if (outcome.grantRelic) relicStore.unlock("limiar");
    };

    // Esc: o "cancel" vira pular. Um "close" sem passar pelo store (2º Esc rápido) também.
    const onCancel = (event: Event) => {
      event.preventDefault();
      limiarStore.close("skip");
    };
    const onDialogClose = () => {
      limiarStore.close("skip");
    };

    activate();
    const offOpen = limiarStore.subscribe(activate);
    const offClose = limiarStore.onClose(deactivate);
    dialog.addEventListener("cancel", onCancel);
    dialog.addEventListener("close", onDialogClose);
    return () => {
      offOpen();
      offClose();
      dialog.removeEventListener("cancel", onCancel);
      dialog.removeEventListener("close", onDialogClose);
      silence();
      exitRef.current?.kill();
      // Desmontar não fecha o store (o StrictMode remonta): só devolve as pausas que esta montagem pegou.
      if (activeRef.current) {
        activeRef.current = false;
        resumeLenis(OWNER);
        ambienceDirector.release();
      }
    };
  }, []);

  // Fora da reabertura pelo console as portas não são alternáveis (sem aria-pressed).
  const pressed = (on: boolean) => (source === "console" ? sound === on : undefined);

  return (
    <dialog
      ref={dialogRef}
      id="limiar"
      className="limiar"
      aria-labelledby="limiar-titulo"
      data-fase={phase}
      data-lenis-prevent
      suppressHydrationWarning
    >
      <h2 id="limiar-titulo" className="sr-only">
        {labels.dialogTitle}
      </h2>

      {phase !== "palco" && (
        <div ref={sceneRef} className="limiar__som">
          <p className="limiar__pergunta">{labels.soundQuestion}</p>
          <div className="limiar__portas">
            <button
              ref={withSoundRef}
              type="button"
              autoFocus
              aria-pressed={pressed(true)}
              className="limiar__porta limiar__porta--som focus-ring"
              onClick={(event) => choose(true, event)}
              onPointerEnter={startPreview}
              onPointerLeave={stopDrone}
              onFocus={startPreview}
              onBlur={stopDrone}
            >
              <span className="limiar__eq" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
                <i />
              </span>
              <span className="limiar__porta-nome">{labels.withSound}</span>
              <span className="limiar__porta-dica">{labels.withSoundHint}</span>
            </button>
            <button
              ref={silentRef}
              type="button"
              aria-pressed={pressed(false)}
              className="limiar__porta focus-ring"
              onClick={(event) => choose(false, event)}
            >
              <span className="limiar__porta-nome">{labels.silent}</span>
              <span className="limiar__porta-dica">{labels.silentHint}</span>
            </button>
          </div>
          <div className="limiar__volume">
            <VolumeControl id="limiar-volume" />
            <p className="limiar__dica">{labels.volumeHint}</p>
          </div>
          <button
            type="button"
            onClick={() => limiarStore.close("reading")}
            className="focus-ring min-h-11 w-fit font-mono text-sm text-cinza underline underline-offset-4"
          >
            {labels.reading}
          </button>
        </div>
      )}

      <div ref={emberRef} className="limiar__brasa" aria-hidden="true" />

      {phase === "palco" && Stage && (
        <Stage
          labels={labels}
          siteName={siteName}
          startAt="abertura"
          origin={origin}
          hudCounterRef={counterRef}
          onTaken={() => {
            collectedRef.current = true; // síncrono: o fechamento (deactivate) lê este ref
          }}
          onCollected={() => {
            collectedRef.current = true;
            setCollected(true);
          }}
          onComplete={() => limiarStore.close("complete")}
        />
      )}

      {/* Faixa de HUD própria, inerte (o HUD real fica sob o diálogo modal). Vem depois do palco: fica por cima. */}
      <div className="limiar__hud" aria-hidden="true">
        <span className="wordmark limiar__marca">{siteName}</span>
        <span className="limiar__hud-dir">
          <span className="hidden sm:inline">{sound ? labels.soundOn : labels.soundOff}</span>
          <span ref={counterRef} className="limiar__contador">
            {fillTemplate(labels.progress, { won: lit.length, total: RELICS.length })}
            <span className="hidden gap-[3px] sm:flex">
              {RELICS.map((relic) => (
                <i
                  key={relic.id}
                  data-pulo={fresh && relic.id === "limiar" ? "" : undefined}
                  className={`block h-3 w-[7px] border border-current ${lit.includes(relic.id) ? "bg-current" : ""}`}
                />
              ))}
            </span>
          </span>
        </span>
      </div>

      <button type="button" className="hud-btn focus-ring limiar__pular" onClick={() => limiarStore.close("skip")}>
        {labels.skip}
      </button>
    </dialog>
  );
}
