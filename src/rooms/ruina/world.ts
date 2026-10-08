import gsap from "gsap";
import Matter from "matter-js";
import { createRateLimiter } from "@/interaction/sound/limiter";
import {
  IMPACT,
  RUINA,
  arenaWalls,
  fixedSteps,
  impactGain,
  isThrown,
  opensCase,
  pushForce,
  type TapRecord,
} from "./physics";

export type RuinaWorldCallbacks = {
  onCollapse: () => void;
  onRestore: () => void;
  onGrab: () => void;
  onDrop: () => void;
  onThrow: () => void;
  onImpact: (gain: number) => void;
  onDoubleTap: (slab: HTMLElement) => void;
};

export type RuinaWorld = { collapse: () => void; restore: () => void; dispose: () => void };

type Point = { x: number; y: number };
type Piece = { el: HTMLElement; body: Matter.Body; x: number; y: number; slab: boolean };

const DEV = process.env.NODE_ENV !== "production";
const ZERO: Point = { x: 0, y: 0 };

/**
 * Física da Ruína — porte de salas.html → ruina(). Os corpos nascem nas posições do layout em
 * repouso e cada elemento ([data-piece]) continua no fluxo recebendo só transform; o HTML (h1 com
 * letras, lista de links) segue sendo o conteúdo. Loop no gsap.ticker, passo fixo de 1/60 s,
 * pausado fora da tela. Desaba sozinho com 60% da arena visível por 500 ms.
 */
export function createRuinaWorld(arena: HTMLElement, callbacks: RuinaWorldCallbacks): RuinaWorld {
  const { Bodies, Body, Composite, Constraint, Engine, Events, Query } = Matter;
  const elements = Array.from(arena.querySelectorAll<HTMLElement>("[data-piece]"));
  const impactLimiter = createRateLimiter(IMPACT.maxPerSecond, 1000);
  const previousVelocity = new Map<number, Point>();
  let engine: Matter.Engine | null = null;
  let pieces: Piece[] = [];
  let drag: Matter.Constraint | null = null;
  let dragPointer: number | null = null;
  let lastTap: TapRecord | null = null;
  let accumulator = 0;
  let running = false;
  let visible = false;
  let thrown = false;
  let collapseTimer = 0;
  let lastWidth = arena.clientWidth;

  // Coordenadas da área interna (sem a moldura de 2 px): é onde as peças e as ondas são posicionadas.
  const inner = () => {
    const rect = arena.getBoundingClientRect();
    return { left: rect.left + arena.clientLeft, top: rect.top + arena.clientTop, width: arena.clientWidth, height: arena.clientHeight };
  };

  const relative = (event: PointerEvent): Point => {
    const box = inner();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };

  const tick = (_time: number, deltaMs: number) => {
    if (!engine) return;
    const { steps, rest } = fixedSteps(accumulator, deltaMs);
    accumulator = rest;
    for (let step = 0; step < steps; step += 1) {
      // Velocidade antes do passo: o collisionStart (matter ≥ 0.19) chega já com a velocidade resolvida.
      for (const piece of pieces) {
        previousVelocity.set(piece.body.id, { x: piece.body.velocity.x, y: piece.body.velocity.y });
      }
      Engine.update(engine, RUINA.stepMs);
    }
    for (const piece of pieces) {
      const { position, angle } = piece.body;
      piece.el.style.transform = `translate(${position.x - piece.x}px, ${position.y - piece.y}px) rotate(${angle}rad)`;
      if (!thrown && isThrown(position.y)) {
        thrown = true;
        callbacks.onThrow();
      }
    }
  };

  const start = () => {
    if (running || !visible || !engine) return;
    running = true;
    accumulator = 0;
    gsap.ticker.add(tick);
  };

  const stop = () => {
    if (!running) return;
    running = false;
    gsap.ticker.remove(tick);
  };

  const onCollisions = (event: Matter.IEventCollision<Matter.Engine>) => {
    const now = performance.now();
    for (const pair of event.pairs) {
      const a = previousVelocity.get(pair.bodyA.id) ?? ZERO;
      const b = previousVelocity.get(pair.bodyB.id) ?? ZERO;
      const gain = impactGain(Math.hypot(a.x - b.x, a.y - b.y));
      if (gain > 0 && impactLimiter.tryHit(now)) callbacks.onImpact(gain);
    }
  };

  function collapse() {
    if (engine) return;
    // Um "reerguer" ainda animando (ou o efeito das letras) deixaria transform/cor residual: medir sempre do repouso.
    gsap.killTweensOf(elements);
    gsap.set(elements, { clearProps: "transform,color" });
    const arenaRect = inner();
    const measures = elements.map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        el,
        x: rect.left - arenaRect.left + rect.width / 2,
        y: rect.top - arenaRect.top + rect.height / 2,
        w: rect.width,
        h: rect.height,
      };
    });
    const created = Engine.create();
    created.gravity.y = RUINA.gravityY;
    Composite.add(
      created.world,
      arenaWalls(arenaRect.width, arenaRect.height).map((wall) =>
        Bodies.rectangle(wall.x, wall.y, wall.width, wall.height, { isStatic: true }),
      ),
    );
    pieces = measures.map((m) => {
      const slab = m.el.dataset.piece === "slab";
      const body = Bodies.rectangle(m.x, m.y, m.w * RUINA.bodyScale, m.h * RUINA.bodyScale, {
        chamfer: { radius: RUINA.chamferRadius },
        restitution: RUINA.restitution,
        friction: RUINA.friction,
        density: slab ? RUINA.densitySlab : RUINA.densityGlyph,
      });
      Body.setAngularVelocity(body, (Math.random() - 0.5) * RUINA.initialSpin);
      return { el: m.el, body, x: m.x, y: m.y, slab };
    });
    Composite.add(created.world, pieces.map((piece) => piece.body));
    Events.on(created, "collisionStart", onCollisions);
    engine = created;
    thrown = false;
    arena.dataset.live = "on";
    callbacks.onCollapse();
    gsap.fromTo(arena, { x: -RUINA.shakePx }, { x: 0, duration: RUINA.shakeDuration, ease: "elastic.out(1.2, .2)" });
    start();
  }

  function release() {
    if (!drag || !engine) return;
    Composite.remove(engine.world, drag);
    drag = null;
    dragPointer = null;
    callbacks.onDrop();
  }

  function teardownEngine() {
    stop();
    release();
    if (engine) {
      Events.off(engine, "collisionStart", onCollisions);
      Composite.clear(engine.world, false);
      Engine.clear(engine);
    }
    engine = null;
    previousVelocity.clear();
    lastTap = null;
    delete arena.dataset.live;
  }

  function restore() {
    if (!engine) return;
    const offsets = pieces.map((piece) => ({
      el: piece.el,
      dx: piece.body.position.x - piece.x,
      dy: piece.body.position.y - piece.y,
    }));
    teardownEngine();
    pieces = [];
    // FLIP do protótipo: volta ao layout em 700 ms expo.out, 20 ms entre peças, rotação zera de imediato.
    offsets.forEach(({ el, dx, dy }, index) => {
      gsap.fromTo(
        el,
        { x: dx, y: dy, rotation: 0 },
        {
          x: 0,
          y: 0,
          duration: RUINA.restoreDuration,
          ease: "expo.out",
          delay: index * RUINA.restoreStagger,
          clearProps: "transform",
        },
      );
    });
    callbacks.onRestore();
  }

  function wave(point: Point) {
    const ring = document.createElement("span");
    ring.className = "arena__onda";
    ring.style.left = `${point.x}px`;
    ring.style.top = `${point.y}px`;
    arena.appendChild(ring);
    gsap.to(ring, {
      scale: RUINA.waveScale,
      opacity: 0,
      duration: RUINA.waveDuration,
      ease: "expo.out",
      onComplete: () => ring.remove(),
    });
  }

  const onPointerDown = (event: PointerEvent) => {
    if ((event.target as Element | null)?.closest("[data-arena-ui]")) return;
    if (event.button !== 0) return; // botão do meio/direito não agarra nem sequestra o ponteiro
    if (drag) return; // segundo dedo/ponteiro enquanto há um arrasto: ignora (senão a constraint do primeiro fica órfã)
    if (!engine) {
      collapse();
      return;
    }
    const point = relative(event);
    wave(point);
    const hit = Query.point(pieces.map((piece) => piece.body), point)[0];
    if (!hit) return;
    const piece = pieces.find((candidate) => candidate.body === hit);
    if (!piece) return;
    const now = performance.now();
    if (opensCase(piece.slab, lastTap, hit.id, now)) callbacks.onDoubleTap(piece.el);
    lastTap = { id: hit.id, time: now };
    event.preventDefault();
    arena.setPointerCapture(event.pointerId);
    drag = Constraint.create({
      pointA: point,
      bodyB: hit,
      pointB: { x: point.x - hit.position.x, y: point.y - hit.position.y },
      stiffness: RUINA.dragStiffness,
      damping: RUINA.dragDamping,
      length: 0,
    });
    dragPointer = event.pointerId;
    Composite.add(engine.world, drag);
    callbacks.onGrab();
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!engine) return;
    const point = relative(event);
    if (drag) {
      if (event.pointerId === dragPointer) drag.pointA = point;
      return;
    }
    for (const piece of pieces) {
      const force = pushForce(piece.body.position.x - point.x, piece.body.position.y - point.y, piece.body.mass);
      if (force) Body.applyForce(piece.body, piece.body.position, force);
    }
  };

  const onPointerUp = (event: PointerEvent) => {
    if (event.pointerId === dragPointer) release();
  };

  const visibility = new IntersectionObserver(
    ([entry]) => {
      if (!entry) return;
      visible = entry.isIntersecting;
      if (visible) start();
      else stop();
      window.clearTimeout(collapseTimer);
      if (entry.isIntersecting && entry.intersectionRatio >= RUINA.collapseRatio) {
        collapseTimer = window.setTimeout(collapse, RUINA.collapseDelayMs);
      }
    },
    { threshold: [0, RUINA.collapseRatio] },
  );
  visibility.observe(arena);

  // Mudou a largura com a física viva: paredes ficariam erradas → reergue.
  const resize = new ResizeObserver(([entry]) => {
    const width = arena.clientWidth || entry?.contentRect.width || lastWidth;
    if (Math.abs(width - lastWidth) > 1 && engine) restore();
    lastWidth = width;
  });
  resize.observe(arena);

  arena.addEventListener("pointerdown", onPointerDown);
  arena.addEventListener("pointermove", onPointerMove);
  arena.addEventListener("pointerup", onPointerUp);
  arena.addEventListener("pointercancel", onPointerUp);
  if (DEV) console.debug("[ruina] mundo criado");

  return {
    collapse,
    restore,
    dispose() {
      visibility.disconnect();
      resize.disconnect();
      window.clearTimeout(collapseTimer);
      arena.removeEventListener("pointerdown", onPointerDown);
      arena.removeEventListener("pointermove", onPointerMove);
      arena.removeEventListener("pointerup", onPointerUp);
      arena.removeEventListener("pointercancel", onPointerUp);
      teardownEngine();
      pieces = [];
      gsap.killTweensOf([arena, ...elements]);
      gsap.set([arena, ...elements], { clearProps: "transform,color" });
      arena.querySelectorAll(".arena__onda").forEach((ring) => ring.remove());
      if (DEV) console.debug("[ruina] mundo descartado");
    },
  };
}
