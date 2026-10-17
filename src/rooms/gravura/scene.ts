import {
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Texture,
  Vector3,
  Vector4,
  WebGLRenderer,
} from "three";
import { cursorStore } from "@/interaction/cursor/store";
import { LONG_PRESS_MS, exceedsSlop } from "@/interaction/gesture";
import { vibrate } from "@/interaction/haptics";
import { relicStore } from "@/interaction/relics/store";
import { soundEngine } from "@/interaction/sound/engine";
import { createRateLimiter } from "@/interaction/sound/limiter";
import { ENGRAVING_VERTEX, buildEngravingFragment, engravingLineCount, hexToVec3 } from "@/rooms/shared/engravingShader";
import type { WebGLScene, WebGLSceneContext } from "@/rooms/shared/webgl";
import { PORTRAIT, cropToUniform, pointToUv } from "./crop";
import { INK, TEAR, beginHold, createInk, endHold, hoverInk, stepInk, tearGain } from "./ink";

/** Uma gota a cada 420 ms enquanto segura (spec 7.3: "gotejar ao segurar"). */
const DRIP_EVERY_MS = 420;

function tokenColor(name: string): Vector3 {
  const [r, g, b] = hexToVec3(getComputedStyle(document.documentElement).getPropertyValue(name));
  return new Vector3(r, g, b);
}

/**
 * Gravura do Sobre — porte de salas.html → gravura(). Mouse corta as linhas; segurar (ou Espaço/Enter
 * com o retrato focado, ou toque longo de 400 ms) derrama tinta até virar sangue; 1,4 s segurando dá a
 * relíquia Sangue. A textura vem da própria <img> do next/image (já baixada).
 */
export async function createGravuraScene({ canvas, host, coarse, wake }: WebGLSceneContext): Promise<WebGLScene> {
  const image = host.parentElement?.querySelector<HTMLImageElement>("img");
  if (!image) throw new Error("gravura: retrato ausente");
  await image.decode();

  // O three dimensiona a textura por image.width/height, que numa <img> é o tamanho EXIBIDO (a caixa de
  // recorte tem ~3× a moldura), não o natural: o upload falha e a textura sai preta. Um ImageBitmap
  // carrega o tamanho real. flipY vem do próprio bitmap (o three não vira bitmaps no upload).
  const bitmap = await createImageBitmap(image, { imageOrientation: "flipY" });
  const renderer = new WebGLRenderer({ canvas, antialias: false });
  const texture = new Texture(bitmap);
  texture.flipY = false;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true; // sem colorSpace: lê e escreve valores crus, como o r128 do protótipo

  const trail = Array.from({ length: INK.points }, () => new Vector3(-1, -1, 0));
  const [cropX, cropY, cropW, cropH] = cropToUniform(PORTRAIT.crop);
  const uniforms = {
    uTex: { value: texture },
    uTime: { value: 0 },
    uAspect: { value: 0.6 },
    uLines: { value: 120 },
    uMotion: { value: 1 },
    uCrop: { value: new Vector4(cropX, cropY, cropW, cropH) },
    uTrail: { value: trail },
    uBone: { value: tokenColor("--osso") },
    uBlack: { value: tokenColor("--breu") },
    uBlood: { value: tokenColor("--sangue") },
    uClot: { value: tokenColor("--coagulo") },
  };
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: ENGRAVING_VERTEX,
    fragmentShader: buildEngravingFragment({ ink: true }),
  });
  const geometry = new PlaneGeometry(2, 2);
  const scene = new Scene();
  scene.add(new Mesh(geometry, material));
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const ink = createInk();
  const tearLimiter = createRateLimiter(TEAR.maxPerSecond, 1000);
  let startedAt: number | null = null;
  let lastDrip = 0;
  let lastMove: { x: number; y: number; t: number } | null = null;
  let pendingTouch: { id: number; x: number; y: number; timer: number } | null = null;

  const uvOf = (event: PointerEvent) => pointToUv(event.clientX, event.clientY, host.getBoundingClientRect());

  const startHold = (x: number, y: number) => {
    const now = performance.now();
    beginHold(ink, x, y, now);
    lastDrip = now;
    soundEngine.play("hold");
    vibrate(10);
    wake();
  };

  const cancelTouch = () => {
    if (!pendingTouch) return;
    window.clearTimeout(pendingTouch.timer);
    pendingTouch = null;
  };

  const release = () => {
    cancelTouch();
    if (endHold(ink)) cursorStore.setCharge(0);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (pendingTouch && event.pointerId === pendingTouch.id) {
      if (exceedsSlop(event.clientX - pendingTouch.x, event.clientY - pendingTouch.y)) cancelTouch();
    }
    // Alt+Tab com o botão solto em outra janela: o pointerup nunca chega, então confere os botões.
    if (ink.holding && event.pointerType === "mouse" && event.buttons === 0) release();
    const [x, y] = uvOf(event);
    hoverInk(ink, x, y);
    const now = performance.now();
    if (lastMove && !ink.holding) {
      const speed = Math.hypot(event.clientX - lastMove.x, event.clientY - lastMove.y) / Math.max(1, now - lastMove.t);
      const gain = tearGain(speed);
      if (gain > 0 && tearLimiter.tryHit(now)) soundEngine.noise("tear", { gain });
    }
    lastMove = { x: event.clientX, y: event.clientY, t: now };
    wake();
  };

  const onPointerLeave = () => {
    ink.inside = false;
    lastMove = null;
    release();
  };

  const onPointerDown = (event: PointerEvent) => {
    const [x, y] = uvOf(event);
    if (event.pointerType === "touch") {
      // Toque: só vira "segurar" depois de 400 ms parado (senão é rolagem — touch-action: pan-y).
      cancelTouch();
      const timer = window.setTimeout(() => {
        pendingTouch = null;
        startHold(x, y);
      }, LONG_PRESS_MS);
      pendingTouch = { id: event.pointerId, x: event.clientX, y: event.clientY, timer };
      return;
    }
    startHold(x, y);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    if (!ink.holding) startHold(INK.keyboardPoint[0], INK.keyboardPoint[1]);
  };

  const onKeyUp = (event: KeyboardEvent) => {
    if (event.key === " " || event.key === "Enter") release();
  };

  const onContextMenu = (event: Event) => event.preventDefault();

  host.addEventListener("pointermove", onPointerMove);
  host.addEventListener("pointerleave", onPointerLeave);
  host.addEventListener("pointerdown", onPointerDown);
  host.addEventListener("pointercancel", release);
  host.addEventListener("keydown", onKeyDown);
  host.addEventListener("keyup", onKeyUp);
  host.addEventListener("blur", release);
  host.addEventListener("contextmenu", onContextMenu);
  window.addEventListener("pointerup", release);
  window.addEventListener("blur", release);

  return {
    resize(width, height, dpr) {
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height, false);
      uniforms.uAspect.value = width / height;
      uniforms.uLines.value = engravingLineCount(height, coarse);
    },
    frame(now, deltaMs) {
      if (startedAt === null) startedAt = now;
      uniforms.uTime.value = (now - startedAt) / 1000;
      const { active, holdProgress } = stepInk(ink, now, deltaMs);
      if (ink.holding) {
        cursorStore.setCharge(holdProgress);
        if (holdProgress >= 1) relicStore.unlock("sangue");
        if (now - lastDrip >= DRIP_EVERY_MS) {
          lastDrip = now;
          soundEngine.play("drip");
        }
      }
      for (let i = 0; i < INK.points; i += 1) {
        trail[i].set(ink.trail[i * 3], ink.trail[i * 3 + 1], ink.trail[i * 3 + 2]);
      }
      renderer.render(scene, camera);
      // Com o ponteiro dentro, as linhas seguem ondulando (uTime); fora e sem tinta, dorme.
      return active || ink.inside;
    },
    dispose() {
      release();
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerleave", onPointerLeave);
      host.removeEventListener("pointerdown", onPointerDown);
      host.removeEventListener("pointercancel", release);
      host.removeEventListener("keydown", onKeyDown);
      host.removeEventListener("keyup", onKeyUp);
      host.removeEventListener("blur", release);
      host.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("blur", release);
      geometry.dispose();
      material.dispose();
      texture.dispose();
      bitmap.close();
      renderer.dispose();
      if (!renderer.getContext().isContextLost()) renderer.forceContextLoss();
    },
  };
}
