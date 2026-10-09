"use client";

import gsap from "gsap";
import { useCallback, useEffect, useEffectEvent, useRef, useState, type RefObject } from "react";
import { useInView } from "./useInView";
import { capDpr, createFpsGuard, webglBudget, type WebGLScene, type WebGLSceneContext } from "./webgl";

export type WebGLStatus = "idle" | "live" | "fallback";

type Tick = (time: number, deltaTime: number) => void;

type UseWebGLOptions = {
  /** false em modo leitura: nada é criado e a sala mostra o estático. */
  enabled: boolean;
  /** Cria a cena (via import() de um módulo com three). Rejeitar = fallback estático. */
  create: (context: WebGLSceneContext) => Promise<WebGLScene>;
  /** Classe do <canvas> criado dentro da camada. */
  canvasClassName: string;
};

const DEV = process.env.NODE_ENV !== "production";

/**
 * Monta uma cena WebGL numa camada vazia (spec 9.3): carrega a 400 px da viewport, limita o DPR,
 * respeita o orçamento de 2 contextos, roda no gsap.ticker só enquanto há animação e a camada está
 * visível, e cai para o estático em webglcontextlost. Desmontar (troca de rota/View Transition,
 * modo leitura) descarta a cena, libera o contexto e remove o canvas.
 */
export function useWebGL(layerRef: RefObject<HTMLElement | null>, { enabled, create, canvasClassName }: UseWebGLOptions) {
  const near = useInView(layerRef, { rootMargin: "400px", once: true });
  const visible = useInView(layerRef, { rootMargin: "0px" });
  const [status, setStatus] = useState<WebGLStatus>("idle");
  const tickRef = useRef<Tick | null>(null);
  const runningRef = useRef(false);
  const visibleRef = useRef(false);
  const createScene = useEffectEvent((context: WebGLSceneContext) => create(context));

  const sleep = useCallback(() => {
    if (tickRef.current) gsap.ticker.remove(tickRef.current);
    runningRef.current = false;
  }, []);

  const wake = useCallback(() => {
    const tick = tickRef.current;
    if (!tick || runningRef.current || !visibleRef.current) return;
    runningRef.current = true;
    gsap.ticker.add(tick);
  }, []);

  useEffect(() => {
    visibleRef.current = visible;
    if (visible) wake();
    else sleep();
  }, [visible, wake, sleep]);

  useEffect(() => {
    const layer = layerRef.current;
    if (!enabled || !near || !layer) return;
    let cancelled = false;
    let scene: WebGLScene | null = null;
    let holdsSlot = false;
    let pending = true;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    let dpr = capDpr(window.devicePixelRatio, coarse);
    const guard = createFpsGuard();
    const canvas = document.createElement("canvas");
    canvas.className = canvasClassName;
    canvas.setAttribute("aria-hidden", "true");
    layer.appendChild(canvas);

    const releaseSlot = () => {
      if (!holdsSlot) return;
      holdsSlot = false;
      webglBudget.release();
      if (DEV) console.debug(`[webgl] contextos vivos: ${webglBudget.live()}`);
    };
    // Tamanho de layout (ignora transform): a prévia do Relicário inclina, e o retângulo de uma caixa
    // girada é maior que ela (D9). Sem transform, é o mesmo valor de antes.
    const measure = () => {
      scene?.resize(layer.clientWidth, layer.clientHeight, dpr);
    };
    const tick: Tick = (_time, deltaTime) => {
      if (!scene) return;
      if (dpr > 1 && guard.sample(deltaTime)) {
        dpr = 1;
        measure();
      }
      if (!scene.frame(performance.now(), deltaTime)) sleep();
    };
    const onLost = () => {
      sleep();
      tickRef.current = null;
      scene?.dispose();
      scene = null;
      releaseSlot();
      canvas.remove();
      setStatus("fallback");
    };
    const resizeObserver = new ResizeObserver(() => {
      measure();
      wake();
    });
    canvas.addEventListener("webglcontextlost", onLost);

    const start = async () => {
      if (!webglBudget.acquire()) throw new Error("webgl: limite de contextos");
      holdsSlot = true;
      if (DEV) console.debug(`[webgl] contextos vivos: ${webglBudget.live()}`);
      return createScene({ canvas, host: layer, dpr, coarse, wake });
    };

    start().then(
      (created) => {
        pending = false;
        if (cancelled) {
          created.dispose();
          releaseSlot(); // o contexto só morre no dispose: o slot é liberado depois dele (D26)
          return;
        }
        scene = created;
        tickRef.current = tick;
        measure();
        resizeObserver.observe(layer);
        canvas.dataset.ready = "on";
        setStatus("live");
        wake();
      },
      () => {
        pending = false;
        releaseSlot();
        canvas.remove();
        if (!cancelled) setStatus("fallback");
      },
    );

    return () => {
      cancelled = true;
      sleep();
      tickRef.current = null;
      resizeObserver.disconnect();
      canvas.removeEventListener("webglcontextlost", onLost);
      scene?.dispose();
      scene = null;
      if (!pending) releaseSlot(); // cena ainda em criação: o .then libera depois do dispose
      canvas.remove();
    };
  }, [enabled, near, layerRef, canvasClassName, sleep, wake]);

  return { status: enabled ? status : "idle", wake } as const;
}
