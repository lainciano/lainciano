import * as THREE from "three";
import { capDpr, createFpsGuard, webglBudget } from "@/rooms/shared/webgl";
import { createMaterialKit, protoColor, type MaterialKit } from "../render/materials";
import { createPost } from "../render/post";
import { createPsxUniforms, PSX_DEFAULTS, type PsxUniforms } from "../render/psx";
import type { Settings } from "../save/schema";
import { createClock } from "./clock";
import { createFrameMetrics } from "./metrics";
import { downgrade, initialQuality, targetSize, type QualityLines } from "./quality";

export type PostMode = 0 | 1 | 2;

export type DebugInfo = {
  quality: QualityLines;
  /** A qualidade desce sozinha (FpsGuard) só com o ajuste em "auto". */
  autoQuality: boolean;
  postMode: PostMode;
  /** Render target da cena (linhas × aspecto). */
  target: { width: number; height: number };
  /** Canvas final, em pixels de dispositivo. */
  canvas: { width: number; height: number };
  dpr: number;
  fps: { p50: number; p95: number };
  frames: number;
  /** Quadros em que algo lançou (callback ou render); o loop segue. */
  frameErrors: number;
  lastError: string | null;
  running: boolean;
  lost: boolean;
  disposed: boolean;
  render: { calls: number; triangles: number; points: number; lines: number };
  memory: { geometries: number; textures: number };
  programs: number;
  /** Tempo do `compileAsync` (cena + pós) antes do primeiro quadro; null antes de `start()` terminar. */
  compileMs: number | null;
};

export type Engine = {
  three: typeof import("three");
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  /** Materiais e texturas compartilhados (PSX ligado); morrem no `dispose()` do engine. */
  kit: MaterialKit;
  /** Uniforms do PSX (snap, grade, afim), compartilhados por todos os materiais do kit. */
  psx: PsxUniforms;
  /**
   * Compila a cena e o pós (`compileAsync`) e só então liga o loop: o primeiro quadro visível já tem os
   * programas prontos. Quem chama mostra a tela de carregamento até resolver. Chamar de novo não faz nada.
   */
  start(): Promise<void>;
  /** Debug/fotos: prende o tempo dos callbacks e do pós em `t` (dt 0); `null` solta. */
  freezeTime(t: number | null): void;
  setQuality(q: QualityLines): void;
  setPostMode(m: PostMode): void;
  setFade(v: number): void;
  glitch(seconds: number, strength: number): void;
  onFrame(fn: (dt: number, t: number) => void): () => void;
  resize(): void;
  info(): DebugInfo;
  dispose(): void;
};

export type EngineOptions = {
  coarse: boolean;
  settings: Settings;
  /** Contexto perdido: o loop já parou; quem chamou mostra o aviso e descarta o engine. */
  onLost(): void;
  /** Abortado antes de nascer (desmontou, StrictMode): resolve null e não fica com o orçamento. */
  signal?: AbortSignal;
};

// Mundo 3D do protótipo 7 (aprovado): fundo e névoa quase pretos. Hex na convenção do protótipo (lineares,
// ver render/materials.ts): com a gama do pós, o fundo sai na tela igual ao de lá.
const BACKGROUND = 0x020202;
const FOG_COLOR = 0x040404;
const FOG_NEAR = 4.5;
const FOG_FAR = 14;
const CAMERA_NEAR = 0.02;
const CAMERA_FAR = 60;
/** Intervalo acima disso é pausa/retomada, não desempenho: fica fora das métricas e do FpsGuard. */
const PAUSE_MS = 250;
/** Os primeiros erros de quadro vão ao console com a pilha; os demais só contam (info/debug). */
const LOGGED_ERRORS = 3;

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Cria o runtime do jogo dentro de `host` (o `[data-game-stage]`). Este módulo (e com ele o `three`) só chega
 * pelo `import()` do GameShell: nada daqui entra no JS inicial nem no chunk do shell.
 *
 * - Orçamento: o slot de contexto só é pedido se `signal` não abortou, e dali até o engine pronto tudo é
 *   síncrono: um efeito desmontado (StrictMode) nunca segura dois slots nem cria dois renderers.
 * - Sem slot (as salas já usam os 2), sem WebGL ou falha ao criar o renderer: resolve `null` (aviso no shell).
 * - `webglcontextlost`: `preventDefault`, o loop para e `onLost` avisa. Restaurar NÃO é suportado: quem
 *   chamou descarta o engine (libera o slot e o canvas) e mostra o aviso; reabrir o jogo cria um contexto novo.
 * - O loop só liga em `start()`, depois do `compileAsync` da cena e do pós (contrato §4).
 * - Loop por rAF com try/catch por callback e pelo render: o erro conta (info/debug), o loop segue.
 * - Pós da T6 (render/post.ts): modo 1 (PSX) lê o render target baixo (Nearest, linhas × aspecto) com o
 *   tremor de vértice ligado; gravura (0) e ASCII (2) leem um alvo do tamanho do canvas, sem tremor, como no
 *   protótipo. O alvo cheio só nasce quando um desses modos é pedido.
 * - Aba escondida para o loop; ao voltar o relógio é reiniciado (dt 0, sem salto).
 * - Cada recurso empilha o seu desfazer; `dispose` (ou uma falha no meio da montagem) desempilha na ordem
 *   inversa: render target, quad, listeners, renderer (com `forceContextLoss`), canvas e, por último, o slot.
 */
export async function createEngine(host: HTMLElement, opts: EngineOptions): Promise<Engine | null> {
  const { coarse, settings, onLost, signal } = opts;
  if (signal?.aborted || !host.isConnected) return null;
  const three = THREE;
  if (!webglBudget.acquire()) return null;

  const undo: (() => void)[] = [];
  const teardown = () => {
    while (undo.length > 0) {
      try {
        undo.pop()?.();
      } catch (error) {
        console.error("[jogo] erro ao descartar o runtime", error);
      }
    }
  };
  undo.push(() => webglBudget.release());

  // Estado do ciclo de vida: declarado antes de qualquer listener que o leia.
  let lost = false;
  let disposed = false;
  let running = false;
  /** `start()` terminou: o loop pode rodar (a aba visível o religa). */
  let started = false;
  let raf = 0;
  const stop = () => {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  // O canvas entra no palco antes do contexto, para o listener de perda valer desde o início.
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.dataset.gameCanvas = "";
  host.appendChild(canvas);
  undo.push(() => canvas.remove());

  // preventDefault é o padrão do WebGL (o three também o faz). Não esperamos o webglcontextrestored.
  const handleLost = (event: Event) => {
    event.preventDefault();
    if (lost || disposed) return;
    lost = true;
    stop();
    onLost();
  };
  canvas.addEventListener("webglcontextlost", handleLost);
  undo.push(() => canvas.removeEventListener("webglcontextlost", handleLost));

  let gl: THREE.WebGLRenderer;
  try {
    gl = new three.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  } catch {
    // three já registrou o motivo no console; o shell mostra o aviso.
    teardown();
    return null;
  }
  undo.push(() => {
    gl.dispose();
    // Solta o contexto já (não espera o GC): abrir e fechar muitas vezes não acumula contextos.
    if (!gl.getContext().isContextLost()) gl.forceContextLoss();
  });

  try {
    return mount(gl);
  } catch (error) {
    teardown();
    throw error;
  }

  function mount(renderer: THREE.WebGLRenderer): Engine {
    renderer.outputColorSpace = three.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = three.BasicShadowMap;
    // Dois passes por quadro (cena + pós): o info é zerado à mão no começo do quadro para somar os dois.
    renderer.info.autoReset = false;

    const scene = new three.Scene();
    scene.background = protoColor(three, BACKGROUND);
    scene.fog = new three.Fog(protoColor(three, FOG_COLOR), FOG_NEAR, FOG_FAR);
    const camera = new three.PerspectiveCamera(settings.fov, 1, CAMERA_NEAR, CAMERA_FAR);
    camera.rotation.order = "YXZ";
    scene.add(camera);
    undo.push(() => scene.clear());

    const psx = createPsxUniforms(three);
    const kit = createMaterialKit(three, psx);
    undo.push(() => kit.dispose());

    // A fonte do atlas ASCII é a JetBrains Mono do site (variável do next/font); sem ela, monospace.
    const post = createPost(three, { font: getComputedStyle(host).getPropertyValue("--font-jetbrains").trim() });
    const quadGeometry = new three.PlaneGeometry(2, 2);
    const postScene = new three.Scene();
    const postCamera = new three.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    postScene.add(new three.Mesh(quadGeometry, post.material));
    undo.push(() => {
      postScene.clear();
      quadGeometry.dispose();
      post.dispose();
    });

    const autoQuality = settings.quality === "auto";
    let quality = initialQuality(coarse, settings.quality);
    let target: THREE.WebGLRenderTarget | null = null;
    /** Alvo do tamanho do canvas para gravura e ASCII (Linear, como o RT.full do protótipo). */
    let fullTarget: THREE.WebGLRenderTarget | null = null;
    let aspect = 1;
    let dpr = capDpr(window.devicePixelRatio, coarse);
    let postMode: PostMode = 1;
    let glitchLeft = 0;
    let frozenTime: number | null = null;
    let compileMs: number | null = null;
    undo.push(() => {
      target?.dispose();
      target = null;
      fullTarget?.dispose();
      fullTarget = null;
    });

    const makeTarget = (width: number, height: number, filter: THREE.MagnificationTextureFilter) =>
      new three.WebGLRenderTarget(width, height, {
        minFilter: filter,
        magFilter: filter,
        generateMipmaps: false,
        depthBuffer: true,
      });

    const rebuildTarget = () => {
      const { width, height } = targetSize(quality, aspect);
      if (target && target.width === width && target.height === height) return;
      target?.dispose();
      target = makeTarget(width, height, three.NearestFilter);
      post.setLow(width, height);
    };

    const rebuildFullTarget = () => {
      if (postMode === 1) {
        // Só existe enquanto gravura/ASCII estão na tela.
        fullTarget?.dispose();
        fullTarget = null;
        return;
      }
      const width = Math.max(2, canvas.width);
      const height = Math.max(2, canvas.height);
      if (fullTarget && fullTarget.width === width && fullTarget.height === height) return;
      fullTarget?.dispose();
      fullTarget = makeTarget(width, height, three.LinearFilter);
    };

    const applyPostMode = (m: PostMode) => {
      postMode = m;
      post.setMode(m);
      // Tremor de vértice só no PSX (o protótipo desliga na gravura e no ASCII).
      psx.uSnap.value = m === 1 ? 1 : 0;
      rebuildFullTarget();
    };

    const resize = () => {
      if (disposed) return;
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      dpr = capDpr(window.devicePixelRatio, coarse);
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height, false);
      aspect = width / height;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      // Como o protótipo: a grade do tremor tem 160 linhas e acompanha o aspecto na horizontal.
      psx.uSnapRes.value.set(Math.round(PSX_DEFAULTS.snap[1] * aspect), PSX_DEFAULTS.snap[1]);
      post.setOutput(canvas.width, canvas.height, dpr);
      rebuildTarget();
      rebuildFullTarget();
    };

    const clock = createClock();
    const metrics = createFrameMetrics();
    let guard = createFpsGuard();
    const callbacks = new Set<(dt: number, t: number) => void>();
    undo.push(() => callbacks.clear());
    let frames = 0;
    let frameErrors = 0;
    let lastError: string | null = null;
    let lastNow: number | null = null;

    const report = (error: unknown) => {
      frameErrors += 1;
      lastError = error instanceof Error ? error.message : String(error);
      if (frameErrors <= LOGGED_ERRORS) console.error("[jogo] erro no quadro", error);
    };

    const step = (now: number) => {
      if (lastNow !== null) {
        const ms = now - lastNow;
        if (ms > 0 && ms <= PAUSE_MS) {
          metrics.push(ms);
          // Manual vence: só o ajuste "auto" desce sozinho, um degrau por vez, nunca sobe.
          if (autoQuality && quality !== 240 && guard.sample(ms)) {
            quality = downgrade(quality);
            guard = createFpsGuard();
            rebuildTarget();
          }
        }
      }
      lastNow = now;
      const tick = clock.tick(now);
      const { dt, t } = frozenTime === null ? tick : { dt: 0, t: frozenTime };
      for (const fn of callbacks) {
        try {
          fn(dt, t);
        } catch (error) {
          report(error);
        }
      }
      if (glitchLeft > 0) {
        glitchLeft = Math.max(0, glitchLeft - dt);
        if (glitchLeft === 0) post.setGlitch(0);
      }
      post.tick(t);
      try {
        renderer.info.reset();
        const source = postMode === 1 ? target : (fullTarget ?? target);
        post.setInput(source?.texture ?? null);
        renderer.setRenderTarget(source);
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);
        renderer.render(postScene, postCamera);
        frames += 1;
      } catch (error) {
        renderer.setRenderTarget(null);
        report(error);
      }
    };

    const loop = (now: number) => {
      raf = 0;
      if (!running) return;
      raf = requestAnimationFrame(loop);
      step(now);
    };

    const run = () => {
      if (!started || running || disposed || lost || document.hidden) return;
      running = true;
      clock.reset();
      lastNow = null;
      raf = requestAnimationFrame(loop);
    };
    undo.push(stop);

    const snapshot = (): DebugInfo => {
      const { render, memory, programs } = renderer.info;
      return {
        quality,
        autoQuality,
        postMode,
        target: { width: target?.width ?? 0, height: target?.height ?? 0 },
        canvas: { width: canvas.width, height: canvas.height },
        dpr,
        fps: { p50: metrics.p50(), p95: metrics.p95() },
        frames,
        frameErrors,
        lastError,
        running,
        lost,
        disposed,
        render: { calls: render.calls, triangles: render.triangles, points: render.points, lines: render.lines },
        memory: { geometries: memory.geometries, textures: memory.textures },
        programs: programs?.length ?? 0,
        compileMs,
      };
    };
    // Depois do dispose o info congela no último retrato (com `lost`), sem tocar no renderer descartado.
    let finalInfo: DebugInfo | null = null;

    resize();

    // Listeners por último: se algo acima lançar, não há o que remover além do que já está na pilha.
    const onVisibility = () => {
      if (document.hidden) stop();
      else run();
    };
    document.addEventListener("visibilitychange", onVisibility);
    undo.push(() => document.removeEventListener("visibilitychange", onVisibility));
    const resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(host);
    undo.push(() => resizeObserver.disconnect());

    let starting: Promise<void> | null = null;
    const start = () => {
      starting ??= (async () => {
        if (disposed || lost) return;
        const t0 = performance.now();
        // O programa depende do alvo (a cor de saída muda entre render target e tela): compila cada cena
        // com o alvo em que ela vai ser desenhada. O compile é síncrono; o await só espera o driver.
        renderer.setRenderTarget(target);
        const sceneReady = renderer.compileAsync(scene, camera);
        renderer.setRenderTarget(null);
        const postReady = renderer.compileAsync(postScene, postCamera);
        await Promise.all([sceneReady, postReady]);
        if (disposed || lost) return;
        compileMs = Math.round(performance.now() - t0);
        started = true;
        run();
      })();
      return starting;
    };

    return {
      three,
      scene,
      camera,
      renderer,
      kit,
      psx,
      start,
      freezeTime(t) {
        frozenTime = t === null || !Number.isFinite(t) ? null : t;
      },
      setQuality(q) {
        if (disposed) return;
        quality = q;
        guard = createFpsGuard();
        rebuildTarget();
      },
      setPostMode(m) {
        if (disposed || (m !== 0 && m !== 1 && m !== 2)) return;
        applyPostMode(m);
      },
      setFade(v) {
        post.setFade(Number.isFinite(v) ? v : 1);
      },
      glitch(seconds, strength) {
        if (prefersReducedMotion() || !(seconds > 0)) return;
        glitchLeft = Math.max(glitchLeft, seconds);
        post.setGlitch(strength);
      },
      onFrame(fn) {
        if (disposed) return () => {};
        callbacks.add(fn);
        return () => {
          callbacks.delete(fn);
        };
      },
      resize,
      info: () => finalInfo ?? snapshot(),
      dispose() {
        if (disposed) return;
        finalInfo = { ...snapshot(), running: false, disposed: true };
        disposed = true;
        teardown();
      },
    };
  }
}
