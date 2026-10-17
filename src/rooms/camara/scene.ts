import {
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Texture,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
} from "three";
import { cursorStore } from "@/interaction/cursor/store";
import { LONG_PRESS_MS, exceedsSlop } from "@/interaction/gesture";
import { vibrate } from "@/interaction/haptics";
import { relicStore } from "@/interaction/relics/store";
import { soundEngine } from "@/interaction/sound/engine";
import { cropToUniform } from "@/rooms/gravura/crop";
import { coverCrop } from "@/rooms/shared/cover";
import { ENGRAVING_VERTEX, buildEngravingFragment, engravingLineCount } from "@/rooms/shared/engravingShader";
import { tokenRgb } from "@/rooms/shared/tokens";
import type { WebGLScene, WebGLSceneContext } from "@/rooms/shared/webgl";
import { coverageRatio, createCoverage, isRevealed, visitCircle } from "./coverage";
import {
  LENS,
  addMark,
  chargeOf,
  createMarks,
  fadeMarks,
  lensRadii,
  lensTarget,
  moveLensByKey,
  pxToUv,
  shouldMark,
  stepLensRadius,
} from "./lens";

const color = (name: string) => new Vector3(...tokenRgb(name));

type LensOptions = {
  /** Percentual revelado (inteiro 0–100), chamado só quando muda — alimenta o contador "revelado N%". */
  onProgress?: (percent: number) => void;
};

/**
 * Câmara (spec 7.5): a captura em gravura; uma lente circular revela a cor real, cresce ao segurar
 * (anel de carga), anda com as setas e deixa marcas que desvanecem. Revelar ≥ 80% da grade 12×8 dá a
 * relíquia Lente. Toque: a lente só abre após 400 ms parado (senão é rolagem — D16).
 */
export async function createLensScene(
  { canvas, host, coarse, wake }: WebGLSceneContext,
  { onProgress }: LensOptions = {},
): Promise<WebGLScene> {
  const image = host.parentElement?.querySelector<HTMLImageElement>("img");
  if (!image) throw new Error("câmara: captura ausente");
  await image.decode();
  // Tamanho natural da fonte atual do srcset; nunca a <img> exibida no Texture (lição da Fase 2).
  const bitmap = await createImageBitmap(image, { imageOrientation: "flipY" });

  const renderer = new WebGLRenderer({ canvas, antialias: false });
  const texture = new Texture(bitmap);
  texture.flipY = false;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true; // sem colorSpace: valores crus, como a Gravura (a cor real sai igual à <img>)

  const radii = lensRadii(coarse);
  const marks = createMarks();
  const coverage = createCoverage();
  const markUniforms = Array.from({ length: LENS.marks }, () => new Vector4());
  const uniforms = {
    uTex: { value: texture },
    uTime: { value: 0 },
    uAspect: { value: 16 / 9 },
    uLines: { value: 120 },
    uMotion: { value: 1 },
    uCrop: { value: new Vector4(0, 0, 1, 1) },
    uLens: { value: new Vector3(0, 0, 0) },
    uSize: { value: new Vector2(1, 1) },
    uMarks: { value: markUniforms },
    uBone: { value: color("--osso") },
    uBlack: { value: color("--breu") },
    uBlood: { value: color("--sangue") },
    uClot: { value: color("--coagulo") },
  };
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: ENGRAVING_VERTEX,
    fragmentShader: buildEngravingFragment({ ink: false, lens: true }),
  });
  const geometry = new PlaneGeometry(2, 2);
  const scene = new Scene();
  scene.add(new Mesh(geometry, material));
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  let width = 1;
  let height = 1;
  let position = { x: 0, y: 0 }; // centro da lente em px da captura (origem em cima à esquerda)
  let active = false;
  let holding = false;
  let radius = 0;
  let revealed = false;
  let lastPercent = 0;
  let startedAt: number | null = null;
  let pendingTouch: { id: number; x: number; y: number; timer: number } | null = null;
  let touchLens = false;

  const local = (event: PointerEvent) => {
    const rect = host.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const center = () => ({ x: width / 2, y: height / 2 });

  const open = (point: { x: number; y: number }) => {
    position = point;
    active = true;
    wake();
  };
  const startHold = () => {
    if (holding) return;
    holding = true;
    soundEngine.play("hold");
    wake();
  };
  const endHold = () => {
    if (!holding) return;
    holding = false;
    cursorStore.setCharge(0);
    wake();
  };
  const close = () => {
    active = false;
    endHold();
    wake();
  };
  const cancelTouch = () => {
    if (!pendingTouch) return;
    window.clearTimeout(pendingTouch.timer);
    pendingTouch = null;
  };

  const onPointerMove = (event: PointerEvent) => {
    if (pendingTouch && event.pointerId === pendingTouch.id) {
      if (exceedsSlop(event.clientX - pendingTouch.x, event.clientY - pendingTouch.y)) cancelTouch();
      return;
    }
    if (event.pointerType === "touch" && !touchLens) return; // dedo sem lente: é rolagem
    // Botão solto fora da janela: o pointerup nunca chega, então confere os botões.
    if (holding && event.pointerType === "mouse" && event.buttons === 0) endHold();
    open(local(event));
  };

  const onPointerLeave = (event: PointerEvent) => {
    if (event.pointerType === "touch") return;
    close();
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === "touch") {
      cancelTouch();
      const point = local(event);
      const timer = window.setTimeout(() => {
        pendingTouch = null;
        touchLens = true;
        vibrate(10);
        open(point);
        startHold();
      }, LONG_PRESS_MS);
      pendingTouch = { id: event.pointerId, x: event.clientX, y: event.clientY, timer };
      return;
    }
    if (event.button !== 0) return;
    open(local(event));
    startHold();
  };

  const onPointerUp = () => {
    cancelTouch();
    if (touchLens) {
      touchLens = false;
      close();
      return;
    }
    endHold();
  };

  // Só com a lente aberta pelo toque: o arrasto move a lente em vez de rolar (listener não-passivo).
  const onTouchMove = (event: TouchEvent) => {
    if (touchLens) event.preventDefault();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const moved = moveLensByKey(active ? position : center(), event.key, { width, height }, event.shiftKey);
    if (moved) {
      event.preventDefault();
      open(moved);
      return;
    }
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (!active) open(center());
      startHold();
    }
  };

  const onKeyUp = (event: KeyboardEvent) => {
    if (event.key === " " || event.key === "Enter") endHold();
  };

  // Foco por teclado abre a lente no centro; foco por clique não (o mouse já posiciona).
  const onFocus = () => {
    if (host.matches(":focus-visible")) open(center());
  };

  const onContextMenu = (event: Event) => event.preventDefault();

  host.addEventListener("pointermove", onPointerMove);
  host.addEventListener("pointerleave", onPointerLeave);
  host.addEventListener("pointerdown", onPointerDown);
  host.addEventListener("pointercancel", onPointerUp);
  host.addEventListener("touchmove", onTouchMove, { passive: false });
  host.addEventListener("keydown", onKeyDown);
  host.addEventListener("keyup", onKeyUp);
  host.addEventListener("focus", onFocus);
  host.addEventListener("blur", close);
  host.addEventListener("contextmenu", onContextMenu);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("blur", endHold);

  return {
    resize(w, h, dpr) {
      width = w;
      height = h;
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      uniforms.uAspect.value = w / h;
      uniforms.uLines.value = engravingLineCount(h, coarse);
      uniforms.uSize.value.set(w, h);
      const [x, y, cw, ch] = cropToUniform(coverCrop(bitmap.width / bitmap.height, w / h));
      uniforms.uCrop.value.set(x, y, cw, ch);
      position = { x: Math.min(position.x, w), y: Math.min(position.y, h) };
    },
    frame(now, deltaMs) {
      if (startedAt === null) startedAt = now;
      uniforms.uTime.value = (now - startedAt) / 1000;
      radius = stepLensRadius(radius, lensTarget(active, holding, radii), deltaMs, radii.base);
      if (holding) cursorStore.setCharge(chargeOf(radius, radii));
      if (radius >= 1) {
        if (shouldMark(marks, position.x, position.y, radius, holding, now)) {
          const [u, v] = pxToUv(position.x, position.y, width, height);
          addMark(marks, u, v, radius, position.x, position.y, now);
        }
        if (visitCircle(coverage, position.x, position.y, radius, width, height) > 0) {
          const percent = Math.round(coverageRatio(coverage) * 100);
          if (percent !== lastPercent) {
            lastPercent = percent;
            onProgress?.(percent);
          }
        }
        if (!revealed && isRevealed(coverage)) {
          revealed = true;
          relicStore.unlock("lente");
        }
      }
      const marking = fadeMarks(marks, deltaMs);
      for (let i = 0; i < LENS.marks; i += 1) {
        markUniforms[i].set(marks.data[i * 4], marks.data[i * 4 + 1], marks.data[i * 4 + 2], marks.data[i * 4 + 3]);
      }
      const [u, v] = pxToUv(position.x, position.y, width, height);
      uniforms.uLens.value.set(u, v, radius);
      renderer.render(scene, camera);
      // Lente aberta: linhas ondulam; fechada e sem marcas, o loop dorme.
      return active || radius > 0 || marking;
    },
    dispose() {
      cancelTouch();
      if (holding) cursorStore.setCharge(0);
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerleave", onPointerLeave);
      host.removeEventListener("pointerdown", onPointerDown);
      host.removeEventListener("pointercancel", onPointerUp);
      host.removeEventListener("touchmove", onTouchMove);
      host.removeEventListener("keydown", onKeyDown);
      host.removeEventListener("keyup", onKeyUp);
      host.removeEventListener("focus", onFocus);
      host.removeEventListener("blur", close);
      host.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("blur", endHold);
      geometry.dispose();
      material.dispose();
      texture.dispose();
      bitmap.close();
      renderer.dispose();
      if (!renderer.getContext().isContextLost()) renderer.forceContextLoss();
    },
  };
}
