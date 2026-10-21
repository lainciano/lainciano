"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getRelic } from "@/interaction/relics/catalog";
import { soundEngine } from "@/interaction/sound/engine";
import { readTimeToken } from "@/lib/css-time";
import { getGsap, whenGsap } from "@/lib/motion";
import type { ActProps } from "../LimiarStage";
import { TIMING } from "../sequence";
import { isUncovered, spawnStones, stepStones, type Stone } from "../stones";
import { attachKeyGuard } from "./key-guard";
import { capDpr } from "./opening-plan";
import {
  MAX_THUDS,
  collectStep,
  floorImpacts,
  flyTo,
  placeInBand,
  pointerAt,
  stoneBand,
  stoneCount,
  thudGain,
  trackPointer,
  type CollectState,
  type TrackedPointer,
} from "./relic-plan";

/** As pedras começam a cair um pouco depois da relíquia (ela chega ao chão primeiro, elas por cima). */
const STONE_DELAY_MS = 350;
/** Com movimento reduzido, nada cai: a cena nasce assentada (passos de 16 ms simulados antes do 1º quadro). */
const SETTLE_STEPS = 240;
/** Respiro (px) entre o chão das pedras e o botão "pegar a relíquia". */
const FLOOR_GAP_PX = 12;
/** Baques muito juntos viram um só. */
const THUD_GAP_MS = 70;
/** A relíquia cresce antes de voar. */
const GROW_SCALE = 1.35;
/** Contorno das pedras (px CSS). */
const STONE_EDGE_PX = 1.5;

/** Silhueta de cada pedra: raios por vértice (fração do raio físico) e o giro atual. */
type Shape = { radii: number[]; angle: number };

function makeShape(rand: () => number): Shape {
  const count = 7 + Math.floor(rand() * 3);
  return { radii: Array.from({ length: count }, () => 0.8 + rand() * 0.2), angle: rand() * Math.PI * 2 };
}

/**
 * Ato Relíquia (spec Limiar 3.5): o disco da relíquia (sigilo do Limiar, brilho `--sangue` pulsando) cai e 9 a
 * 14 pedras caem por cima (canvas 2D, `stepStones` no ticker). O ponteiro empurra as pedras (velocidade medida
 * entre eventos); baque escalado nos primeiros impactos. Cursor: `takeVerb` sobre a relíquia descoberta,
 * `revealVerb` no resto. Clicar ou tocar a relíquia pega mesmo com ela meio coberta (`isUncovered` só troca o
 * verbo e a dica); o botão `takeButton`, sempre presente, também pega. Pegar: `onTaken()` (a casca já conta
 * a relíquia para o fechamento), cresce, voa até o contador da
 * faixa de HUD (medido na hora), `onCollected()` (o pip acende com pulo), sino, `labels.ending` e, depois de
 * `TIMING.endingHoldMs`, `done()`. O disco é um elemento sob o canvas (as pedras o cobrem), e é ele que voa.
 */
export function RelicAct({ labels, done, reduced, entered, onTaken, onCollected, hudCounterRef }: ActProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const relicRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const doneRef = useRef(done);
  const takenRef = useRef(onTaken);
  const collectedRef = useRef(onCollected);
  const [ending, setEnding] = useState(false);

  useLayoutEffect(() => {
    doneRef.current = done;
    takenRef.current = onTaken;
    collectedRef.current = onCollected;
  }, [done, onTaken, onCollected]);

  // Enter/espaço que vinham apertados das Inscrições não pegam a relíquia.
  useEffect(() => {
    const button = buttonRef.current;
    return button ? attachKeyGuard(button) : undefined;
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const relicEl = relicRef.current;
    const button = buttonRef.current;
    const ctx = canvas?.getContext("2d");
    if (!entered || !root || !canvas || !relicEl || !button || !ctx) return;

    const tokens = getComputedStyle(document.documentElement);
    const ink = {
      fill: tokens.getPropertyValue("--linha").trim(),
      edge: tokens.getPropertyValue("--apagado").trim(),
    };
    const verbs = { take: labels.takeVerb, reveal: labels.revealVerb };

    let disposed = false;
    let collect: CollectState = "idle";
    let pointer: TrackedPointer | null = null;
    let uncovered: boolean | null = null;
    let thuds = 0;
    let lastThud = -Infinity;
    let endTimer: number | undefined;
    let started = -1;

    let box = root.getBoundingClientRect();
    const r = relicEl.offsetWidth / 2;
    // Física num referencial com um "céu" acima da tela (y' = y + sky): as pedras nascem fora de vista.
    const sky = box.height;
    const floorOf = () => {
      const top = button.getBoundingClientRect().top - box.top;
      return Math.max(box.height / 2, Math.min(box.height, top - FLOOR_GAP_PX));
    };
    let bounds = { width: box.width, height: floorOf() + sky };
    let dpr = capDpr(window.devicePixelRatio);
    const sizeCanvas = () => {
      canvas.width = Math.max(1, Math.round(box.width * dpr));
      canvas.height = Math.max(1, Math.round(box.height * dpr));
    };
    sizeCanvas();

    let relic: Stone = { x: box.width / 2, y: sky - r, vx: 0, vy: 0, r };
    const band = stoneBand(relic.x, r, box.width);
    let stones = placeInBand(
      spawnStones(stoneCount(Math.random), { width: band.width, height: sky }, Math.random),
      band,
    );
    const shapes = stones.map(() => makeShape(Math.random));

    if (reduced) {
      for (let i = 0; i < SETTLE_STEPS; i++) {
        relic = stepStones([relic], 16, bounds, null)[0];
        stones = stepStones(stones, 16, bounds, null);
      }
    }

    const thud = (speeds: number[], now: number) => {
      if (reduced || !speeds.length || thuds >= MAX_THUDS || now - lastThud < THUD_GAP_MS) return;
      thuds += 1;
      lastThud = now;
      soundEngine.play("thud", { gain: thudGain(Math.max(...speeds)) });
    };

    const setVerb = (open: boolean) => {
      if (open === uncovered) return;
      uncovered = open;
      relicEl.dataset.verbo = open ? verbs.take : verbs.reveal;
      if (open) button.dataset.descoberta = "";
      else delete button.dataset.descoberta;
      // O cursor só lê o verbo ao entrar numa zona: com o ponteiro já em cima, avisa de novo.
      if (relicEl.matches(":hover")) relicEl.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    };

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, box.width, box.height);
      ctx.fillStyle = ink.fill;
      ctx.strokeStyle = ink.edge;
      ctx.lineWidth = STONE_EDGE_PX;
      ctx.lineJoin = "round";
      stones.forEach((s, i) => {
        const { radii, angle } = shapes[i];
        const cy = s.y - sky;
        if (cy + s.r < 0) return;
        ctx.beginPath();
        radii.forEach((k, v) => {
          const a = angle + (v / radii.length) * Math.PI * 2;
          ctx.lineTo(s.x + Math.cos(a) * s.r * k, cy + Math.sin(a) * s.r * k);
        });
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      });
      if (collect === "idle") {
        relicEl.style.transform = `translate3d(${relic.x - r}px, ${relic.y - sky - r}px, 0)`;
      }
    };

    const tick = (_time: number, deltaMs: number) => {
      if (disposed) return;
      const now = performance.now();
      if (started < 0) started = now;
      if (collect === "idle" && !reduced) {
        const next = stepStones([relic], deltaMs, bounds, null);
        thud(floorImpacts([relic], next, bounds.height), now);
        relic = next[0];
      }
      if (reduced || now - started >= STONE_DELAY_MS) {
        const next = stepStones(stones, deltaMs, bounds, pointerAt(pointer, now));
        thud(floorImpacts(stones, next, bounds.height), now);
        const dt = Math.min(Math.max(deltaMs, 0), 32);
        next.forEach((s, i) => {
          shapes[i].angle += (s.vx * dt) / s.r; // rola com o deslocamento
        });
        stones = next;
      }
      draw();
      if (collect === "idle") setVerb(isUncovered({ x: relic.x, y: relic.y, r }, stones));
    };

    const arrive = () => {
      if (disposed) return;
      const next = collectStep(collect, "arrive");
      if (!next) return;
      collect = next;
      collectedRef.current();
      soundEngine.bell();
      setEnding(true);
      endTimer = window.setTimeout(() => doneRef.current(), TIMING.endingHoldMs);
    };

    const take = () => {
      const next = collectStep(collect, "take");
      if (!next || disposed) return;
      collect = next;
      // A concessão vale a partir do gesto (pular/Esc durante o voo ainda concede); o voo é só a imagem.
      takenRef.current();
      const gsap = getGsap()?.gsap;
      if (!gsap || reduced) {
        relicEl.dataset.pega = "sem-voo"; // sem voo: a relíquia some (CSS) e o pip acende
        arrive();
        return;
      }
      relicEl.dataset.pega = "";
      const growS = readTimeToken("--motion-base", 300) / 1000;
      const flyS = readTimeToken("--motion-slower", 800) / 1000;
      const fadeS = readTimeToken("--motion-fast", 150) / 1000;
      relicEl.style.transform = "";
      gsap.set(relicEl, { x: relic.x - r, y: relic.y - sky - r, scale: 1 });
      gsap.to(relicEl, {
        scale: GROW_SCALE,
        duration: growS,
        ease: "power2.out",
        onComplete: () => {
          const counter = hudCounterRef.current;
          if (disposed) return;
          if (!counter) {
            arrive();
            return;
          }
          // Posição do contador medida agora (o HUD pode ter mudado desde a montagem).
          const here = root.getBoundingClientRect();
          const target = flyTo(counter.getBoundingClientRect(), { x: here.left, y: here.top }, r * 2);
          gsap.to(relicEl, { x: target.x, y: target.y, scale: target.scale, duration: flyS, ease: "power3.in", onComplete: arrive });
          gsap.to(relicEl, { opacity: 0, duration: fadeS, delay: Math.max(0, flyS - fadeS), ease: "none" });
        },
      });
    };

    const toLocal = (event: PointerEvent) => ({ x: event.clientX - box.left, y: event.clientY - box.top + sky });
    const onPointerMove = (event: PointerEvent) => {
      const p = toLocal(event);
      pointer = trackPointer(pointer, p.x, p.y, performance.now());
    };
    const onPointerLeave = () => {
      pointer = null;
    };
    // Dedo levantado: some o ponteiro (o mouse continua empurrando ao passar).
    const onPointerEnd = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") pointer = null;
    };
    const onRelicClick = () => take();
    const onButtonClick = () => take();
    const onResize = () => {
      box = root.getBoundingClientRect();
      dpr = capDpr(window.devicePixelRatio);
      bounds = { width: box.width, height: floorOf() + sky };
      sizeCanvas();
      draw();
    };

    relicEl.dataset.verbo = verbs.take;
    relicEl.dataset.pronta = "";
    draw();
    root.addEventListener("pointermove", onPointerMove);
    root.addEventListener("pointerdown", onPointerMove);
    root.addEventListener("pointerleave", onPointerLeave);
    root.addEventListener("pointerup", onPointerEnd);
    root.addEventListener("pointercancel", onPointerEnd);
    relicEl.addEventListener("click", onRelicClick);
    button.addEventListener("click", onButtonClick);
    window.addEventListener("resize", onResize);
    const stopTicker = whenGsap(({ gsap }) => {
      gsap.ticker.add(tick);
      return () => gsap.ticker.remove(tick);
    });

    return () => {
      disposed = true;
      stopTicker();
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerdown", onPointerMove);
      root.removeEventListener("pointerleave", onPointerLeave);
      root.removeEventListener("pointerup", onPointerEnd);
      root.removeEventListener("pointercancel", onPointerEnd);
      relicEl.removeEventListener("click", onRelicClick);
      button.removeEventListener("click", onButtonClick);
      window.removeEventListener("resize", onResize);
      if (endTimer !== undefined) window.clearTimeout(endTimer);
      getGsap()?.gsap.killTweensOf(relicEl);
    };
  }, [entered, reduced, labels.takeVerb, labels.revealVerb, hudCounterRef]);

  return (
    <div ref={rootRef} className="limiar-reliquia" data-verbo={labels.revealVerb} data-fim={ending ? "" : undefined}>
      <div ref={relicRef} className="limiar-reliquia__relic" aria-hidden="true">
        <span className="limiar-reliquia__sigilo">{getRelic("limiar").sigil}</span>
      </div>
      <canvas ref={canvasRef} className="limiar-reliquia__pedras" aria-hidden="true" />
      <p className="limiar-reliquia__fim" aria-live="polite">
        {ending ? labels.ending : ""}
      </p>
      <button ref={buttonRef} type="button" data-limiar-foco className="limiar-reliquia__pegar focus-ring">
        {labels.takeButton}
      </button>
    </div>
  );
}
