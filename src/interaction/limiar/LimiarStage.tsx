"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ComponentType, type RefObject } from "react";
import { prefersReducedMotion, whenGsap } from "@/lib/motion";
import { HoldAct } from "./acts/Hold";
import { InscriptionsAct } from "./acts/Inscriptions";
import { OpeningAct } from "./acts/Opening";
import { RelicAct } from "./acts/Relic";
import type { LimiarLabels, StageProps } from "./Limiar";
import { ACTS, nextAct, transitionFor, type Act, type TransitionKind } from "./sequence";
import { GRAIN_FPS, stepAccumulator } from "./stage-plan";
import { playCurtain, playIn, playOut } from "./transitions";

type Origin = { x: number; y: number };
type StageAct = Exclude<Act, "som">;

/**
 * Contrato dos atos (Tarefas 7 e 8). O ato chama `done()` uma vez quando termina (com o ponto do gesto, se
 * houver: a transição nasce dali). O controle principal leva `data-limiar-foco`: o palco o foca quando a
 * entrada termina (durante as transições a cena fica `inert`). `entered` vira true nesse momento: o palco
 * descarta `done()` durante a entrada, então prazos e animações próprias começam só depois dela.
 */
export type ActProps = {
  labels: LimiarLabels;
  siteName: string;
  done(origin?: Origin): void;
  reduced: boolean;
  entered: boolean;
  /** Só a Relíquia usa: a relíquia foi pega (o gesto); a casca concede ao fechar, mesmo com pular/Esc. */
  onTaken(): void;
  /** Só a Relíquia usa: a relíquia chegou ao contador (o pip acende). */
  onCollected(): void;
  /** Só a Relíquia usa: o contador da faixa de HUD, alvo do voo. */
  hudCounterRef: RefObject<HTMLElement | null>;
};

/** Divisor da resolução do grão (o canvas é esticado: ruído não precisa de pixel nativo). */
const GRAIN_SCALE = 3;

const isStageAct = (act: Act | null): act is StageAct => act !== null && act !== "som";

const ACT_VIEWS: Record<StageAct, ComponentType<ActProps>> = {
  abertura: OpeningAct,
  gesto: HoldAct,
  inscricoes: InscriptionsAct,
  reliquia: RelicAct,
};

function focusAct(scene: HTMLElement, fallback: HTMLElement) {
  const target =
    scene.querySelector<HTMLElement>("[data-limiar-foco]") ??
    scene.querySelector<HTMLElement>("button, [href], input, [tabindex]:not([tabindex='-1'])") ??
    fallback;
  target.focus({ preventScroll: true });
}

/**
 * Palco do Limiar (atos 2 a 5), carregado por `import()` só com o Limiar aberto. Monta um ato por vez:
 * `done()` → `playOut(transição do ato)` → troca → `playIn(mesmo tipo)`; depois da Relíquia, a cortina final
 * e `onComplete()`. Grão de filme (~12 fps no ticker) e trilho de progresso (desktop, `aria-hidden`).
 */
export default function LimiarStage(props: StageProps) {
  const { labels, siteName, startAt, onComplete, onTaken, onCollected, hudCounterRef } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const grainRef = useRef<HTMLCanvasElement>(null);
  const lifeRef = useRef<AbortController | null>(null);
  const busyRef = useRef(true); // a entrada do primeiro ato já é uma transição
  const actRef = useRef<StageAct>(startAt);
  // A casca termina a saída do Som com a brasa no centro: a entrada do 1º ato nasce dali.
  const enterRef = useRef<TransitionKind | null>(null);
  const onCompleteRef = useRef(onComplete);
  const [reduced] = useState(prefersReducedMotion);
  const [act, setAct] = useState<StageAct>(startAt);
  const [enteredAct, setEnteredAct] = useState<StageAct | null>(null);

  useLayoutEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Vida do palco: desmontar (fechar, pular, Esc) mata transições e devolve o diálogo sem a cortina.
  useLayoutEffect(() => {
    const controller = new AbortController();
    lifeRef.current = controller;
    const dialog = rootRef.current?.closest("dialog");
    // O ato Som saiu do DOM: o foco fica no palco até o ato novo estar à vista.
    rootRef.current?.focus({ preventScroll: true });
    return () => {
      controller.abort();
      if (dialog) delete dialog.dataset.cortina;
    };
  }, []);

  // Entrada de cada ato (inclusive o primeiro, vindo do Som).
  useLayoutEffect(() => {
    const scene = sceneRef.current;
    const layer = layerRef.current;
    const root = rootRef.current;
    if (!scene || !layer || !root) return;
    actRef.current = act;
    const kind = enterRef.current ?? transitionFor("som", { reduced });
    const controller = new AbortController();
    busyRef.current = true;
    scene.inert = true;
    void playIn(kind, layer, scene, null, controller.signal).then(() => {
      if (controller.signal.aborted) return;
      scene.inert = false;
      busyRef.current = false;
      setEnteredAct(act); // o foco vem no efeito abaixo, já com `entered` no DOM
    });
    return () => controller.abort();
  }, [act, reduced]);

  // Fim da entrada: foca o controle do ato depois do commit (o nome dele pode depender de `entered`).
  useLayoutEffect(() => {
    const scene = sceneRef.current;
    const root = rootRef.current;
    if (enteredAct === null || enteredAct !== actRef.current || busyRef.current || !scene || !root) return;
    focusAct(scene, root);
  }, [enteredAct]);

  // Grão de filme: ruído redesenhado a ~12 fps no ticker do GSAP (acumulador), só sem movimento reduzido.
  useEffect(() => {
    const canvas = grainRef.current;
    const ctx = canvas?.getContext("2d");
    if (reduced || !canvas || !ctx) return;
    const width = Math.max(1, Math.ceil(window.innerWidth / GRAIN_SCALE));
    const height = Math.max(1, Math.ceil(window.innerHeight / GRAIN_SCALE));
    canvas.width = width;
    canvas.height = height;
    const image = ctx.createImageData(width, height);
    const pixels = new Uint32Array(image.data.buffer);
    let seed = (Math.random() * 0xffffffff) | 1;
    const draw = () => {
      for (let i = 0; i < pixels.length; i++) {
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        const v = seed & 0xff;
        pixels[i] = 0xff000000 | (v << 16) | (v << 8) | v;
      }
      ctx.putImageData(image, 0, 0);
    };
    draw();
    const frameMs = 1000 / GRAIN_FPS;
    let acc = 0;
    return whenGsap(({ gsap }) => {
      const tick = (_time: number, deltaMs: number) => {
        const step = stepAccumulator(acc, deltaMs, frameMs);
        acc = step.acc;
        if (step.due) draw();
      };
      gsap.ticker.add(tick);
      return () => gsap.ticker.remove(tick);
    });
  }, [reduced]);

  const done = (point?: Origin) => {
    const scene = sceneRef.current;
    const layer = layerRef.current;
    const root = rootRef.current;
    const signal = lifeRef.current?.signal;
    if (busyRef.current || !scene || !layer || !root || !signal || signal.aborted) return;
    busyRef.current = true;
    const current = actRef.current;
    const kind = transitionFor(current, { reduced });
    // Foco no palco antes de a cena ficar inerte (senão cai no <body>).
    root.focus({ preventScroll: true });
    scene.inert = true;
    void playOut(kind, layer, scene, point ?? null, signal).then(() => {
      if (signal.aborted) return;
      const next = nextAct(current);
      if (!isStageAct(next)) {
        return playCurtain(kind, layer, signal).then(() => {
          if (!signal.aborted) onCompleteRef.current();
        });
      }
      enterRef.current = kind;
      setAct(next);
    });
  };

  const View = ACT_VIEWS[act];
  const current = ACTS.indexOf(act);

  return (
    <div ref={rootRef} className="limiar__palco" tabIndex={-1}>
      <div ref={sceneRef} className="limiar__cena" data-ato={act}>
        <View
          key={act}
          labels={labels}
          siteName={siteName}
          done={done}
          reduced={reduced}
          entered={enteredAct === act}
          onTaken={onTaken}
          onCollected={onCollected}
          hudCounterRef={hudCounterRef}
        />
      </div>
      <div ref={layerRef} className="limiar__transicao" aria-hidden="true" />
      {!reduced && <canvas ref={grainRef} className="limiar__grao" aria-hidden="true" />}
      <ol className="limiar__trilho" aria-hidden="true">
        {ACTS.map((id, i) => (
          <li
            key={id}
            className="limiar__trilho-marca"
            data-estado={i < current ? "feito" : i === current ? "atual" : undefined}
          >
            <span className="limiar__trilho-rotulo">{labels.railLabels[i]}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
