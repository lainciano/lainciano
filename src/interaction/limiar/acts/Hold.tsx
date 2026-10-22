"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { cursorStore } from "@/interaction/cursor/store";
import { soundEngine, type DroneHandle } from "@/interaction/sound/engine";
import { whenGsap } from "@/lib/motion";
import { stepHold } from "../hold";
import type { ActProps } from "../LimiarStage";
import {
  IDLE_INPUT,
  droneShouldStop,
  holdOrigin,
  isAssistiveClick,
  isHoldKey,
  isHolding,
  progressStep,
  reduceHoldInput,
  shakeAmplitude,
  type HoldEvent,
} from "./hold-plan";

type Point = { x: number; y: number };

/**
 * Ato Gesto (spec Limiar 3.3): anel no centro, "segure para acender a cripta". Segurar (ponteiro em qualquer
 * ponto do ato, ou espaço/Enter com foco no botão do anel) enche a carga em `TIMING.holdFillMs` no ticker do
 * GSAP: anel `--sangue`, anel de carga do cursor, clarão radial, drone subindo e tremor perto do fim (não com
 * movimento reduzido). Soltar antes esvazia em `TIMING.holdDrainMs`. Em 1: baque, clarão `--osso` e
 * `done(ponto)` — onde o ponteiro segurou ou, pelo teclado, o centro do anel (a íris nasce dali).
 */
export function HoldAct({ labels, done, reduced }: ActProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLButtonElement>(null);
  const chargeRef = useRef<SVGCircleElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef(done);
  const textId = useId();
  const [step, setStep] = useState(0);

  useLayoutEffect(() => {
    doneRef.current = done;
  }, [done]);

  useEffect(() => {
    const root = rootRef.current;
    const frame = frameRef.current;
    const ring = ringRef.current;
    const charge = chargeRef.current;
    const flash = flashRef.current;
    if (!root || !frame || !ring || !charge || !flash) return;

    let input = IDLE_INPUT;
    let progress = 0;
    let finished = false;
    let pointerId: number | null = null;
    let pointerPoint: Point | null = null;
    let drone: DroneHandle | null = null;
    let announced = 0;

    const stopDrone = () => {
      drone?.stop();
      drone = null;
    };

    const paint = () => {
      charge.setAttribute("stroke-dashoffset", String(1 - progress));
      flash.style.opacity = String(progress);
      cursorStore.setCharge(progress);
      drone?.set(progress);
      const amp = shakeAmplitude(progress, reduced);
      frame.style.transform = amp
        ? `translate(${(Math.random() * 2 - 1) * amp}px, ${(Math.random() * 2 - 1) * amp}px)`
        : "";
      const next = progressStep(progress);
      if (next !== announced) {
        announced = next;
        setStep(next);
      }
    };

    const send = (event: HoldEvent) => {
      if (finished) return;
      const was = isHolding(input);
      input = reduceHoldInput(input, event);
      const now = isHolding(input);
      if (now && !was) {
        drone ??= soundEngine.drone("play"); // null com som desligado
        root.dataset.segurando = "";
      } else if (!now && was) {
        delete root.dataset.segurando;
        // Soltou antes de o ticker rodar (toque mais curto que um quadro): o tick não chega a parar o drone.
        if (droneShouldStop(now, progress)) stopDrone();
      }
    };

    const complete = () => {
      finished = true;
      frame.style.transform = ""; // sem tremor antes de medir o anel
      // A íris nasce do ponto do ponteiro se ele ainda segurava; pelo teclado ou leitor de tela, do centro do anel.
      const origin = holdOrigin(input.pointer ? pointerPoint : null, ring.getBoundingClientRect());
      input = IDLE_INPUT;
      delete root.dataset.segurando;
      root.dataset.aceso = "";
      soundEngine.play("thud");
      cursorStore.setCharge(0);
      stopDrone();
      doneRef.current(origin);
    };

    const tick = (_time: number, deltaMs: number) => {
      if (finished) return;
      const holding = isHolding(input);
      if (droneShouldStop(holding, progress)) {
        stopDrone(); // vazio e solto: sem drone (no-op se já parou)
        return;
      }
      progress = stepHold(progress, deltaMs, holding);
      paint();
      if (progress >= 1) complete();
      else if (droneShouldStop(holding, progress)) stopDrone(); // esvaziou depois de soltar
    };

    const onPointerDown = (event: PointerEvent) => {
      if (finished || pointerId !== null || (event.pointerType === "mouse" && event.button !== 0)) return;
      pointerId = event.pointerId;
      pointerPoint = { x: event.clientX, y: event.clientY };
      try {
        root.setPointerCapture(event.pointerId);
      } catch {}
      send({ type: "pointerdown" });
    };
    const onPointerEnd = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      pointerId = null;
      send({ type: "pointerup" });
    };
    // Toque longo abre o menu de contexto no Android: aqui ele é o gesto.
    const onContextMenu = (event: Event) => event.preventDefault();
    // Teclado só no botão do anel (focado; durante as transições a cena fica inerte e nada chega aqui).
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isHoldKey(event.key)) return;
      event.preventDefault();
      send({ type: "keydown", key: event.key, repeat: event.repeat });
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (!isHoldKey(event.key)) return;
      event.preventDefault();
      send({ type: "keyup", key: event.key });
    };
    // Leitor de tela em modo navegação aciona o botão com um clique sintético (detail 0): o anel enche sozinho
    // pelo mesmo caminho (anel, clarão, drone, baque) e acende uma vez só (`finished`).
    const onClick = (event: MouseEvent) => {
      if (isAssistiveClick(event.detail, finished)) send({ type: "assist" });
    };
    const onBlur = () => send({ type: "blur" });
    const onWindowBlur = () => {
      pointerId = null;
      send({ type: "reset" });
    };
    const onVisibility = () => {
      if (document.hidden) onWindowBlur();
    };

    root.addEventListener("pointerdown", onPointerDown);
    root.addEventListener("pointerup", onPointerEnd);
    root.addEventListener("pointercancel", onPointerEnd);
    root.addEventListener("lostpointercapture", onPointerEnd);
    root.addEventListener("contextmenu", onContextMenu);
    ring.addEventListener("keydown", onKeyDown);
    ring.addEventListener("keyup", onKeyUp);
    ring.addEventListener("click", onClick);
    ring.addEventListener("blur", onBlur);
    window.addEventListener("blur", onWindowBlur);
    document.addEventListener("visibilitychange", onVisibility);
    const stopTicker = whenGsap(({ gsap }) => {
      gsap.ticker.add(tick);
      return () => gsap.ticker.remove(tick);
    });

    return () => {
      finished = true;
      stopTicker();
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("pointerup", onPointerEnd);
      root.removeEventListener("pointercancel", onPointerEnd);
      root.removeEventListener("lostpointercapture", onPointerEnd);
      root.removeEventListener("contextmenu", onContextMenu);
      ring.removeEventListener("keydown", onKeyDown);
      ring.removeEventListener("keyup", onKeyUp);
      ring.removeEventListener("click", onClick);
      ring.removeEventListener("blur", onBlur);
      window.removeEventListener("blur", onWindowBlur);
      document.removeEventListener("visibilitychange", onVisibility);
      stopDrone();
      cursorStore.setCharge(0);
    };
  }, [reduced]);

  return (
    <div ref={rootRef} className="limiar-gesto" data-verbo={labels.holdVerb}>
      <div ref={frameRef} className="limiar-gesto__quadro">
        <div ref={flashRef} className="limiar-gesto__clarao" aria-hidden="true" />
        <button
          ref={ringRef}
          type="button"
          data-limiar-foco
          className="limiar-gesto__anel focus-ring"
          aria-describedby={textId}
        >
          <svg className="limiar-gesto__carga" viewBox="0 0 100 100" aria-hidden="true">
            <circle className="limiar-gesto__trilha" cx="50" cy="50" r="46" />
            <circle ref={chargeRef} cx="50" cy="50" r="46" pathLength={1} strokeDasharray="1" strokeDashoffset="1" />
          </svg>
          <span className="limiar-gesto__verbo">{labels.holdVerb}</span>
        </button>
        <div
          role="progressbar"
          className="sr-only"
          aria-labelledby={textId}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={step}
        />
        <p id={textId} className="limiar-gesto__texto">
          {labels.holdText}
        </p>
      </div>
    </div>
  );
}
