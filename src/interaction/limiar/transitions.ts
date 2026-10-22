import { readTimeToken } from "@/lib/css-time";
import { getGsap, prefersReducedMotion, type GsapLib } from "@/lib/motion";
import { TIMING, transitionFor, type TransitionKind } from "./sequence";
import { irisRadius, shuffledOrder, slicePlan } from "./stage-plan";

/**
 * Transições mistas do Limiar (spec Limiar 4), fora do JS inicial: chegam com a ilha `LimiarStage` (e a casca
 * pega `playExit` daqui por `import()`). Cada efeito monta suas peças dentro da camada `.limiar__transicao`,
 * que fica abaixo da faixa de HUD e do "pular" e bloqueia cliques enquanto cobre (`data-cobre`).
 * Sem GSAP carregado tudo resolve na hora (corte seco). Um `AbortSignal` mata a timeline e resolve a promessa.
 */

type Origin = { x: number; y: number };
type Gsap = GsapLib["gsap"];
type Timeline = ReturnType<Gsap["timeline"]>;

const s = (ms: number) => ms / 1000;
const OUT = s(TIMING.exitMs[1]);
const IN = s(TIMING.enterMs[1]);
const IN_SHORT = s(TIMING.enterMs[0]);
const ENGRAVING_STRIPES = 14;
const fast = () => s(readTimeToken("--motion-fast", 150));
const center = (): Origin => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 });

const PIECE = {
  ember: "limiar__brasa",
  flash: "limiar__transicao-clarao",
  stripe: "limiar__transicao-faixa",
  sweep: "limiar__transicao-varredura",
  iris: "limiar__transicao-iris",
  slice: "limiar__transicao-fatia",
  veil: "limiar__transicao-veu",
} as const;

function make(layer: HTMLElement, className: string): HTMLElement {
  const el = document.createElement("div");
  el.className = className;
  layer.append(el);
  return el;
}

/** A peça de classe `name` já na camada (vinda da saída) ou uma nova. */
function piece(layer: HTMLElement, name: string, extra = ""): HTMLElement {
  return layer.querySelector<HTMLElement>(`:scope > .${name}`) ?? make(layer, extra ? `${name} ${extra}` : name);
}

function pieces(layer: HTMLElement, name: string): HTMLElement[] {
  return [...layer.querySelectorAll<HTMLElement>(`:scope > .${name}`)];
}

/** Faixa horizontal `index` de `count`, com 1px de sobra para não deixar fresta. */
function band(el: HTMLElement, index: number, count: number) {
  el.style.top = `${(index * 100) / count}%`;
  el.style.height = `calc(${100 / count}% + 1px)`;
}

function cover(layer: HTMLElement) {
  layer.dataset.cobre = "";
}

/** Fim da entrada: camada vazia e solta, cena sem estilo inline. */
function release(layer: HTMLElement, scene: HTMLElement, gsap: Gsap | null) {
  layer.replaceChildren();
  delete layer.dataset.cobre;
  if (gsap) gsap.set(scene, { clearProps: "all" });
  scene.removeAttribute("style");
}

/** Roda a timeline montada por `build` e resolve no fim (ou na hora, sem GSAP ou com o sinal abortado). */
function run(signal: AbortSignal | undefined, build: (tl: Timeline, gsap: Gsap) => void, after?: (gsap: Gsap) => void): Promise<void> {
  const lib = getGsap();
  if (!lib || signal?.aborted) return Promise.resolve();
  const { gsap } = lib;
  return new Promise((resolve) => {
    const stop = () => {
      tl.kill();
      resolve();
    };
    const tl = gsap.timeline({
      paused: true,
      onComplete: () => {
        signal?.removeEventListener("abort", stop);
        after?.(gsap);
        resolve();
      },
    });
    signal?.addEventListener("abort", stop, { once: true });
    build(tl, gsap);
    tl.play();
  });
}

/** A cena encolhe, desfoca e escurece enquanto a brasa viaja de `origin` (ou do centro) até o centro. */
function emberOut(tl: Timeline, gsap: Gsap, scene: HTMLElement, ember: HTMLElement, origin: Origin | null, at: number, duration: number) {
  const c = center();
  gsap.set(ember, { x: origin?.x ?? c.x, y: origin?.y ?? c.y, scale: 0.4, autoAlpha: 0 });
  tl.set(ember, { autoAlpha: 1 }, at)
    .to(scene, { scale: 0.92, filter: "blur(10px) brightness(0)", autoAlpha: 0, duration, ease: "power2.in" }, at)
    .to(ember, { x: c.x, y: c.y, scale: 1, duration, ease: "power2.inOut" }, at);
}

/**
 * Saída do ato Som (casca): a porta escolhida cresce, a outra some e a cena apaga até restar a brasa no centro
 * (movimento reduzido: só um fade). Sem GSAP, corte seco com a brasa já no centro.
 */
export function playExit(scene: HTMLElement, ember: HTMLElement, chosen: HTMLElement, other: HTMLElement | null, origin: Origin | null) {
  const lib = getGsap();
  if (!lib) {
    scene.style.opacity = "0";
    ember.style.visibility = "visible";
    ember.style.opacity = "1";
    return { done: Promise.resolve(), kill() {} };
  }
  const controller = new AbortController();
  const reduced = transitionFor("som", { reduced: prefersReducedMotion() }) === "fade";
  const done = run(controller.signal, (tl, gsap) => {
    if (reduced) {
      tl.to(scene, { autoAlpha: 0, duration: fast() });
      return;
    }
    const doorS = s(TIMING.exitMs[0]);
    if (other) tl.to(other, { autoAlpha: 0, scale: 0.9, duration: doorS / 2, ease: "power2.in" }, 0);
    tl.to(chosen, { scale: 1.08, duration: doorS, ease: "power2.out" }, 0);
    emberOut(tl, gsap, scene, ember, origin, doorS / 2, OUT);
  });
  return { done, kill: () => controller.abort() };
}

/** Cobre a tela com o efeito `kind`, a partir de `origin` (centro se null). Resolve com a tela coberta. */
export function playOut(
  kind: TransitionKind,
  layer: HTMLElement,
  scene: HTMLElement,
  origin: Origin | null,
  signal?: AbortSignal,
): Promise<void> {
  if (!getGsap() || signal?.aborted) return Promise.resolve();
  layer.replaceChildren();
  cover(layer);
  return run(signal, (tl, gsap) => {
    if (kind === "fade") {
      tl.to(scene, { autoAlpha: 0, duration: fast() });
    } else if (kind === "ember") {
      emberOut(tl, gsap, scene, make(layer, PIECE.ember), origin, 0, OUT);
    } else if (kind === "engraving") {
      // Linhas --breu engrossam até cobrir enquanto a varredura --sangue desce.
      const stripes = Array.from({ length: ENGRAVING_STRIPES }, (_, i) => {
        const el = make(layer, PIECE.stripe);
        band(el, i, ENGRAVING_STRIPES);
        return el;
      });
      const sweep = make(layer, PIECE.sweep);
      gsap.set(stripes, { scaleY: 0.06 });
      gsap.set(sweep, { y: 0 });
      tl.to(stripes, { scaleY: 1, duration: OUT * 0.6, ease: "power2.in", stagger: (OUT * 0.4) / ENGRAVING_STRIPES }, 0)
        .to(sweep, { y: window.innerHeight, duration: OUT, ease: "none" }, 0)
        .set(sweep, { autoAlpha: 0 })
        .set(scene, { autoAlpha: 0 });
    } else if (kind === "iris") {
      // Mancha --sangue cresce do ponto do gesto, o --breu vem atrás.
      const o = origin ?? center();
      const radius = irisRadius(o, window.innerWidth, window.innerHeight);
      const at = `${o.x}px ${o.y}px`;
      const ink = make(layer, `${PIECE.iris} ${PIECE.iris}--sangue`);
      const dark = make(layer, `${PIECE.iris} ${PIECE.iris}--breu`);
      gsap.set([ink, dark], { clipPath: `circle(0px at ${at})` });
      tl.to(ink, { clipPath: `circle(${radius}px at ${at})`, duration: OUT * 0.65, ease: "power2.in" }, 0)
        .to(dark, { clipPath: `circle(${radius}px at ${at})`, duration: OUT * 0.65, ease: "power2.in" }, OUT * 0.35)
        .set(scene, { autoAlpha: 0 });
    } else {
      // Fatias: tremor curto e faixas --sangue/--linha entrando de lados alternados, em ordem aleatória.
      const plan = slicePlan(Math.random);
      const each = (OUT * 0.4) / plan.length;
      tl.to(
        scene,
        {
          keyframes: [
            { x: -8, skewX: 3 },
            { x: 6, skewX: -2 },
            { x: -3, skewX: 1 },
            { x: 0, skewX: 0 },
          ],
          duration: OUT * 0.3,
          ease: "none",
        },
        0,
      );
      for (const slice of plan) {
        const el = make(layer, `${PIECE.slice} ${PIECE.slice}--${slice.tone}`);
        band(el, slice.index, plan.length);
        el.dataset.lado = String(slice.side);
        gsap.set(el, { xPercent: slice.side * 101 });
        tl.to(el, { xPercent: 0, duration: OUT * 0.35, ease: "power3.out" }, OUT * 0.25 + slice.order * each);
      }
      tl.set(scene, { autoAlpha: 0 });
    }
  });
}

/** Revela a cena nova pelo efeito inverso de `kind` (sempre a partir do centro). Resolve com a cena à vista. */
export function playIn(
  kind: TransitionKind,
  layer: HTMLElement,
  scene: HTMLElement,
  _origin: Origin | null,
  signal?: AbortSignal,
): Promise<void> {
  const lib = getGsap();
  if (!lib || signal?.aborted) {
    if (!signal?.aborted) release(layer, scene, lib?.gsap ?? null);
    return Promise.resolve();
  }
  const { gsap } = lib;
  const c = center();
  cover(layer);
  // Estados iniciais com gsap.set (pintam já, antes do primeiro tique): a cena nova nunca pisca descoberta.
  gsap.set(scene, { clearProps: "all" });
  return run(
    signal,
    (tl) => {
      if (kind === "fade") {
        gsap.set(scene, { autoAlpha: 0 });
        tl.to(scene, { autoAlpha: 1, duration: fast() });
      } else if (kind === "ember") {
        // Clarão desfocado no centro; a brasa expande e some enquanto a cena sai do borrado.
        const ember = piece(layer, PIECE.ember);
        const flash = piece(layer, PIECE.flash);
        gsap.set(ember, { x: c.x, y: c.y, scale: 1, autoAlpha: 1 });
        gsap.set(flash, { x: c.x, y: c.y, scale: 0.2, autoAlpha: 0 });
        gsap.set(scene, { autoAlpha: 0, scale: 1.04, filter: "blur(12px) brightness(1.6)" });
        tl.to(flash, { scale: 1, autoAlpha: 1, duration: IN * 0.3, ease: "power2.out" }, 0)
          .to(ember, { scale: 8, autoAlpha: 0, duration: IN * 0.6, ease: "power2.out" }, 0)
          .to(scene, { autoAlpha: 1, scale: 1, filter: "blur(0px) brightness(1)", duration: IN * 0.7, ease: "power2.out" }, IN * 0.2)
          .to(flash, { autoAlpha: 0, duration: IN * 0.5 }, IN * 0.35);
      } else if (kind === "engraving") {
        // As linhas afinam até sumir.
        let stripes = pieces(layer, PIECE.stripe);
        if (stripes.length === 0) {
          stripes = Array.from({ length: ENGRAVING_STRIPES }, (_, i) => {
            const el = make(layer, PIECE.stripe);
            band(el, i, ENGRAVING_STRIPES);
            return el;
          });
        }
        pieces(layer, PIECE.sweep).forEach((el) => el.remove());
        gsap.set(stripes, { scaleY: 1 });
        tl.to(stripes, { scaleY: 0, duration: IN_SHORT, ease: "power2.out", stagger: { each: (IN * 0.4) / stripes.length, from: "end" } }, 0);
      } else if (kind === "iris") {
        // O breu fecha no centro.
        pieces(layer, `${PIECE.iris}--sangue`).forEach((el) => el.remove());
        const dark = piece(layer, PIECE.iris, `${PIECE.iris}--breu`);
        const radius = irisRadius(c, window.innerWidth, window.innerHeight);
        const at = `${c.x}px ${c.y}px`;
        gsap.set(dark, { clipPath: `circle(${radius}px at ${at})` });
        tl.to(dark, { clipPath: `circle(0px at ${at})`, duration: IN * 0.8, ease: "power2.inOut" }, 0);
      } else {
        // As fatias saem pelo lado oposto ao que entraram, em nova ordem aleatória.
        let slices = pieces(layer, PIECE.slice);
        if (slices.length === 0) {
          slices = slicePlan(Math.random).map((slice, _i, plan) => {
            const el = make(layer, `${PIECE.slice} ${PIECE.slice}--${slice.tone}`);
            band(el, slice.index, plan.length);
            el.dataset.lado = String(slice.side);
            return el;
          });
        }
        const order = shuffledOrder(slices.length, Math.random);
        const each = (IN_SHORT * 0.5) / slices.length;
        slices.forEach((el, i) => {
          const side = Number(el.dataset.lado) || 1;
          gsap.set(el, { xPercent: 0 });
          tl.to(el, { xPercent: -side * 101, duration: IN_SHORT * 0.6, ease: "power3.in" }, order[i] * each);
        });
      }
    },
    (g) => release(layer, scene, g),
  );
}

/**
 * Cortina final (depois da saída da Relíquia): um véu com o fundo do diálogo cobre a tela, o diálogo fica
 * transparente (`data-cortina`) e o véu abre um buraco a partir do centro enquanto a brasa se expande em tela
 * cheia; a página real aparece por baixo. Movimento reduzido: o véu só esmaece. Quem chama remove
 * `data-cortina` do diálogo ao desmontar.
 */
export function playCurtain(kind: TransitionKind, layer: HTMLElement, signal?: AbortSignal): Promise<void> {
  const lib = getGsap();
  const dialog = layer.closest("dialog");
  if (!lib || !dialog || signal?.aborted) return Promise.resolve();
  const { gsap } = lib;
  cover(layer);
  const veil = make(layer, PIECE.veil);
  dialog.dataset.cortina = "";
  return run(signal, (tl) => {
    if (kind === "fade") {
      tl.to(veil, { autoAlpha: 0, duration: fast() });
      return;
    }
    const c = center();
    const radius = irisRadius(c, window.innerWidth, window.innerHeight);
    const ember = piece(layer, PIECE.ember);
    gsap.set(ember, { x: c.x, y: c.y, autoAlpha: 1 });
    gsap.set(veil, { "--cortina-r": "0px" });
    const size = ember.offsetWidth || 1;
    tl.to(veil, { "--cortina-r": `${radius}px`, duration: IN, ease: "power2.in" }, 0).to(
      ember,
      { scale: (radius * 2) / size, autoAlpha: 0, duration: IN, ease: "power2.in" },
      0,
    );
  });
}
