import { Mesh, MeshPhongMaterial, PerspectiveCamera, PointLight, Scene, TorusKnotGeometry, WebGLRenderer } from "three";
import { AsciiEffect } from "three/addons/effects/AsciiEffect.js";
import { vibrate } from "@/interaction/haptics";
import { relicStore } from "@/interaction/relics/store";
import { soundEngine } from "@/interaction/sound/engine";
import type { WebGLScene, WebGLSceneContext } from "@/rooms/shared/webgl";
import { ASCII, ORBIT, dragSpin, easeToward, framesOf, isOrbit, keySpin, settleSpin, tiltFor, type Spin } from "./orbit";

const KEY_DIRECTION: Record<string, 1 | -1> = { ArrowRight: 1, ArrowLeft: -1 };

/**
 * Terminal (spec 7.8): torus knot facetado renderizado em ASCII (porte do altar() do protótipo). Gira
 * devagar; arrastar gira com inércia; o cursor inclina; setas seguradas aceleram. Rápido o bastante dá a
 * relíquia Órbita. O <canvas> WebGL fica escondido: o AsciiEffect lê os pixels dele e escreve texto.
 */
export async function createAsciiScene({ canvas, host, coarse, wake }: WebGLSceneContext): Promise<WebGLScene> {
  const altar = host.parentElement;
  if (!altar) throw new Error("terminal: altar ausente");

  const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: "low-power" });
  renderer.setPixelRatio(1); // o ASCII amostra na resolução CSS: DPR > 1 só custaria
  const effect = new AsciiEffect(renderer, ASCII.charset, {
    invert: true,
    resolution: coarse ? ASCII.resolutionCoarse : ASCII.resolution,
  });
  effect.domElement.className = "altar__ascii";
  effect.domElement.setAttribute("aria-hidden", "true");
  host.appendChild(effect.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(ASCII.fov, 1, 0.1, 100);
  camera.position.z = ASCII.cameraZ;
  // Luzes "legadas" do three r128 do protótipo: sem decaimento e com ×π (D16).
  const key = new PointLight(0xffffff, ASCII.keyLight.intensity * Math.PI, 0, 0);
  key.position.set(...ASCII.keyLight.position);
  const fill = new PointLight(0xffffff, ASCII.fillLight.intensity * Math.PI, 0, 0);
  fill.position.set(...ASCII.fillLight.position);
  const geometry = new TorusKnotGeometry(...ASCII.knot);
  const material = new MeshPhongMaterial({ flatShading: true });
  const knot = new Mesh(geometry, material);
  scene.add(key, fill, knot);

  let spin: Spin = { ...ORBIT.idle };
  let tilt: Spin = { x: 0, y: 0 };
  let pointerId: number | null = null;
  let lastX = 0;
  let lastY = 0;
  const held = new Set<1 | -1>();

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pointerId = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    altar.setPointerCapture(event.pointerId);
    soundEngine.play("grab");
    if (event.pointerType !== "mouse") vibrate(10);
    wake();
  };
  const onPointerMove = (event: PointerEvent) => {
    const box = altar.getBoundingClientRect();
    tilt = tiltFor((event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height);
    if (event.pointerId === pointerId) {
      spin = dragSpin(event.clientX - lastX, event.clientY - lastY);
      lastX = event.clientX;
      lastY = event.clientY;
      if (isOrbit(spin)) relicStore.unlock("orbita");
    }
    wake();
  };
  const onPointerUp = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
    pointerId = null;
    soundEngine.play("drop");
  };
  const onPointerLeave = () => {
    if (pointerId === null) tilt = { x: 0, y: 0 };
  };
  const onKeyDown = (event: KeyboardEvent) => {
    const direction = KEY_DIRECTION[event.key];
    if (!direction || event.altKey || event.ctrlKey || event.metaKey) return; // Alt+← é voltar do navegador
    event.preventDefault();
    held.add(direction);
    wake();
  };
  const onKeyUp = (event: KeyboardEvent) => {
    const direction = KEY_DIRECTION[event.key];
    if (direction) held.delete(direction);
  };
  const onBlur = () => held.clear();

  altar.addEventListener("pointerdown", onPointerDown);
  altar.addEventListener("pointermove", onPointerMove);
  altar.addEventListener("pointerup", onPointerUp);
  altar.addEventListener("pointercancel", onPointerUp);
  altar.addEventListener("pointerleave", onPointerLeave);
  altar.addEventListener("keydown", onKeyDown);
  altar.addEventListener("keyup", onKeyUp);
  altar.addEventListener("blur", onBlur);

  return {
    frame(_now, deltaMs) {
      const frames = framesOf(deltaMs);
      held.forEach((direction) => {
        spin = keySpin(spin, direction, frames);
      });
      if (held.size > 0 && isOrbit(spin)) relicStore.unlock("orbita");
      knot.rotation.x += spin.x * frames;
      knot.rotation.y += spin.y * frames;
      if (pointerId === null && held.size === 0) spin = settleSpin(spin, frames);
      scene.rotation.x = easeToward(scene.rotation.x, tilt.x, ORBIT.tiltEase, frames);
      scene.rotation.y = easeToward(scene.rotation.y, tilt.y, ORBIT.tiltEase, frames);
      effect.render(scene, camera);
      return true; // giro lento contínuo; o useWebGL pausa fora da tela
    },
    resize(width, height) {
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
      effect.setSize(width, height);
    },
    dispose() {
      altar.removeEventListener("pointerdown", onPointerDown);
      altar.removeEventListener("pointermove", onPointerMove);
      altar.removeEventListener("pointerup", onPointerUp);
      altar.removeEventListener("pointercancel", onPointerUp);
      altar.removeEventListener("pointerleave", onPointerLeave);
      altar.removeEventListener("keydown", onKeyDown);
      altar.removeEventListener("keyup", onKeyUp);
      altar.removeEventListener("blur", onBlur);
      effect.domElement.remove();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (!renderer.getContext().isContextLost()) renderer.forceContextLoss();
    },
  };
}
