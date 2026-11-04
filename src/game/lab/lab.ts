import type * as THREE from "three";
import { createMaker } from "../render/kit";
import { protoColor } from "../render/materials";
import { createEngine, type Engine, type PostMode } from "../runtime/engine";
import { DEFAULT_SETTINGS } from "../save/schema";
import type { Own } from "../layers/types";
import { clampDist, clampPitch, createOrbit, drag, eye, fitDistance, release, step, zoom, type Orbit } from "./orbit";
import { labMeta, loadBuilder, type LabBudget, type LabId, type LabMeta, type V3 } from "./registry";
import { measure, type ModelStats } from "./stats";

/**
 * Laboratório de modelos (B2, só debug: `?jogo=1&debug=1&lab=1`): o engine do jogo (kit, pós PSX/gravura/ASCII) com
 * uma cena de estúdio própria (fundo neutro, três luzes, um modelo centralizado na origem) e a órbita de `orbit.ts`.
 * Nada daqui toca a sala: a sessão do jogo nem nasce. Tudo o que o modelo cria passa por `own` e é descartado ao
 * trocar de modelo; o que vem do kit (materiais, texturas) é do engine e morre com ele.
 */

export type LabStatus = "idle" | "loading" | "ready" | "error";

export type LabSnapshot = {
  id: LabId | null;
  status: LabStatus;
  error: string | null;
  stats: ModelStats | null;
  /** Largura × altura × profundidade da caixa do modelo, em cm (uma casa). */
  sizeCm: V3 | null;
  budget: LabBudget | null;
  goal: LabBudget | null;
  /** Contra o `budget` do registro; null sem modelo. */
  withinBudget: boolean | null;
  /** Contra a meta global do plano; null quando a peça não tem meta. */
  withinGoal: boolean | null;
  wireframe: boolean;
  post: PostMode;
  spin: boolean;
  /** Ângulo da luz principal em torno do modelo (rad). */
  light: number;
  reduced: boolean;
};

export type LabInspect = {
  /** Materiais originais do modelo (compartilhados com o kit) e quantos têm `wireframe` ligado: deve ser sempre 0. */
  originals: { count: number; wireframe: number };
  /** Clones do laboratório e quantos têm `wireframe` ligado. */
  clones: { count: number; wireframe: number };
  /** Material em uso por malha: é um clone? tem `wireframe`? */
  meshes: { clone: boolean; wireframe: boolean }[];
};

export type Lab = {
  select(id: LabId): Promise<void>;
  setWireframe(on: boolean): void;
  setPost(mode: PostMode): void;
  setSpin(on: boolean): void;
  setLight(angle: number): void;
  resetView(): void;
  /** Muda só os campos passados da órbita (fotos: frente, 3/4, topo), dentro dos limites. */
  setView(v: Partial<{ yaw: number; pitch: number; dist: number }>): void;
  snapshot(): LabSnapshot;
  subscribe(fn: (s: LabSnapshot) => void): () => void;
  inspect(): LabInspect;
  /** Chamadas e triângulos que o último quadro desenhou na cena (o que a GPU recebeu de verdade) e o que está na GPU. */
  live(): { calls: number; triangles: number; geometries: number; textures: number };
  /** A câmera de órbita (yaw/pitch em rad, distância em m). */
  view(): { yaw: number; pitch: number; dist: number };
  dispose(): void;
};

declare global {
  interface Window {
    __criptaLab?: Lab;
  }
}

const BACKGROUND = 0x262626;
const SPIN_SPEED = 0.7;
const LIGHT_RADIUS = 3;

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/** Coletor de descarte do modelo (o mesmo contrato do `own` das camadas). */
function createOwn(): { own: Own; drain(): void } {
  const items: (() => void)[] = [];
  const own = (<R extends { dispose(): void }>(resource: R): R => {
    items.push(() => resource.dispose());
    return resource;
  }) as Own;
  own.add = (cleanup) => {
    items.push(cleanup);
  };
  return {
    own,
    drain() {
      for (const fn of items.splice(0).reverse()) {
        try {
          fn();
        } catch (error) {
          console.error("[lab] erro ao descartar", error);
        }
      }
    },
  };
}

type Current = {
  id: LabId;
  holder: THREE.Group;
  drain(): void;
  meshes: THREE.Mesh[];
  originals: Map<THREE.Mesh, THREE.Material | THREE.Material[]>;
  clones: Map<THREE.Mesh, THREE.Material | THREE.Material[]>;
};

export type StartLabOptions = {
  signal: AbortSignal;
  onLost(): void;
  /** Largura (px) coberta pelo painel à esquerda: o modelo fica centrado no resto da tela. */
  inset?(): number;
};

export async function startLab(host: HTMLElement, opts: StartLabOptions): Promise<Lab | null> {
  const coarse = window.matchMedia?.("(pointer: coarse)").matches === true;
  let lab: Lab | null = null;
  let disposed = false;
  const engine: Engine | null = await createEngine(host, {
    coarse,
    settings: { ...DEFAULT_SETTINGS },
    signal: opts.signal,
    onLost: () => {
      lab?.dispose();
      opts.onLost();
    },
    onBroken: () => {
      lab?.dispose();
      opts.onLost();
    },
  });
  if (!engine) return null;
  if (opts.signal.aborted) {
    engine.dispose();
    return null;
  }
  const { three: T, scene, camera } = engine;

  /* ------------------------------------------------ estúdio */
  scene.fog = null;
  scene.background = protoColor(T, BACKGROUND);
  const studio = new T.Group();
  studio.name = "estudio";
  scene.add(studio);
  const ambient = new T.AmbientLight(protoColor(T, 0x707070), 1);
  const hemi = new T.HemisphereLight(protoColor(T, 0x8e9aa8), protoColor(T, 0x3a2f26), 1.1);
  const key = new T.DirectionalLight(protoColor(T, 0xfff2e2), 2.6);
  key.target.position.set(0, 0, 0);
  studio.add(ambient, hemi, key, key.target);

  const orbit: Orbit = createOrbit();
  const maker = (own: Own) => createMaker(T, engine.kit, own, "lab");
  const listeners = new Set<(s: LabSnapshot) => void>();
  let current: Current | null = null;
  let token = 0;
  const state: LabSnapshot = {
    id: null,
    status: "idle",
    error: null,
    stats: null,
    sizeCm: null,
    budget: null,
    goal: null,
    withinBudget: null,
    withinGoal: null,
    wireframe: false,
    post: 1,
    spin: false,
    light: 0.9,
    reduced: reducedMotion(),
  };
  let fitted = 1.5;
  const publish = () => {
    state.reduced = reducedMotion();
    const copy = { ...state };
    for (const fn of listeners) fn(copy);
  };

  const placeLight = () => {
    key.position.set(Math.cos(state.light) * LIGHT_RADIUS, 2.2, Math.sin(state.light) * LIGHT_RADIUS);
  };
  placeLight();

  /* ------------------------------------------------ modelo atual */
  const clearCurrent = () => {
    const c = current;
    if (!c) return;
    current = null;
    c.holder.removeFromParent();
    for (const clone of c.clones.values()) for (const m of Array.isArray(clone) ? clone : [clone]) m.dispose();
    c.holder.traverse((o) => {
      const dispose = o.userData.labDispose as (() => void) | undefined;
      if (dispose) {
        try {
          dispose();
        } catch (error) {
          console.error("[lab] erro ao descartar o modelo", error);
        }
      }
    });
    c.drain();
  };

  const applyWireframe = () => {
    const c = current;
    if (!c) return;
    for (const mesh of c.meshes) {
      const original = c.originals.get(mesh);
      if (!original) continue;
      if (!state.wireframe) {
        mesh.material = original;
        continue;
      }
      let clone = c.clones.get(mesh);
      if (!clone) {
        const wire = (m: THREE.Material) => {
          const copy = m.clone();
          (copy as THREE.MeshBasicMaterial).wireframe = true;
          return copy;
        };
        clone = Array.isArray(original) ? original.map(wire) : wire(original);
        c.clones.set(mesh, clone);
      }
      mesh.material = clone;
    }
  };

  const select = async (id: LabId): Promise<void> => {
    const mine = ++token;
    state.id = id;
    state.status = "loading";
    state.error = null;
    publish();
    try {
      const build = await loadBuilder(id);
      if (disposed || mine !== token) return;
      const { own, drain } = createOwn();
      let model: THREE.Object3D;
      try {
        model = build(maker(own));
      } catch (error) {
        drain();
        throw error;
      }
      clearCurrent();
      const holder = new T.Group();
      holder.name = `lab:${id}`;
      holder.add(model);
      studio.add(holder);
      holder.updateMatrixWorld(true);
      const box = visibleBox(T, model);
      const center = box.getCenter(new T.Vector3());
      const size = box.getSize(new T.Vector3());
      holder.position.copy(center).negate();
      holder.updateMatrixWorld(true);

      const meshes: THREE.Mesh[] = [];
      const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
      model.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        meshes.push(mesh);
        originals.set(mesh, mesh.material);
      });
      current = { id, holder, drain, meshes, originals, clones: new Map() };
      applyWireframe();

      const meta = labMeta(id);
      const stats = measure(model);
      state.stats = stats;
      state.sizeCm = [round1(size.x * 100), round1(size.y * 100), round1(size.z * 100)];
      state.budget = meta.budget;
      state.goal = (meta as LabMeta).goal ?? null;
      state.withinBudget = stats.triangles <= meta.budget.triangles && stats.calls <= meta.budget.calls;
      state.withinGoal = state.goal ? stats.triangles <= state.goal.triangles && stats.calls <= state.goal.calls : null;
      state.status = "ready";
      fitted = fitDistance(Math.max(size.length() / 2, 0.01), camera.fov, camera.aspect);
      orbit.dist = fitted;
      orbit.vYaw = 0;
      orbit.vPitch = 0;
      publish();
      // O programa do modelo novo compila agora, não no primeiro quadro dele (SwiftShader leva centenas de ms).
      await engine.precompile().catch(() => undefined);
    } catch (error) {
      if (disposed || mine !== token) return;
      console.error(`[lab] não montou "${id}"`, error);
      state.status = "error";
      state.error = error instanceof Error ? error.message : String(error);
      state.stats = null;
      publish();
    }
  };

  /* ------------------------------------------------ ponteiro: arrastar gira, roda e pinça aproximam */
  const canvas = engine.renderer.domElement;
  const pointers = new Map<number, { x: number; y: number; t: number }>();
  let pinch = 0;
  const onDown = (e: PointerEvent) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, t: e.timeStamp });
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ponteiro sintético sem captura: o arrasto segue pelo canvas */
    }
    if (pointers.size === 2) pinch = pinchDistance();
    orbit.dragging = true;
    orbit.vYaw = 0;
    orbit.vPitch = 0;
  };
  const pinchDistance = () => {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const onMove = (e: PointerEvent) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    const dt = Math.max(0.004, (e.timeStamp - p.t) / 1000);
    p.x = e.clientX;
    p.y = e.clientY;
    p.t = e.timeStamp;
    if (pointers.size >= 2) {
      const d = pinchDistance();
      if (pinch > 0 && d > 0) orbit.dist = clampDist(orbit.dist * (pinch / d));
      pinch = d;
      return;
    }
    drag(orbit, dx, dy, dt);
  };
  const onUp = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    pinch = 0;
    if (pointers.size === 0) release(orbit, reducedMotion());
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    // pixels, linhas (×16) ou páginas (×100) -> o "clique" de 100 da roda
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
    zoom(orbit, e.deltaY * unit);
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.style.cursor = "grab";

  /* ------------------------------------------------ quadro */
  let viewShift = 0;
  let viewW = 0;
  let viewH = 0;
  const stopFrame = engine.onFrame((dt) => {
    const reduced = reducedMotion();
    step(orbit, dt, reduced);
    if (state.spin && !reduced) {
      state.light += SPIN_SPEED * dt;
      placeLight();
    }
    const [x, y, z] = eye(orbit);
    camera.position.set(x, y, z);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    // O painel cobre a esquerda: a imagem inteira desliza para a direita, e o modelo fica no meio do que sobra.
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    const shift = Math.min(width * 0.45, Math.max(0, opts.inset?.() ?? 0)) / 2;
    if (shift !== viewShift || width !== viewW || height !== viewH) {
      viewShift = shift;
      viewW = width;
      viewH = height;
      if (shift === 0) camera.clearViewOffset();
      else camera.setViewOffset(width, height, -shift, 0, width, height);
    }
  });

  lab = {
    select,
    setWireframe(on) {
      state.wireframe = on;
      applyWireframe();
      publish();
    },
    setPost(mode) {
      engine.setPostMode(mode);
      state.post = mode;
      publish();
    },
    setSpin(on) {
      state.spin = on && !reducedMotion();
      publish();
    },
    setLight(angle) {
      if (!Number.isFinite(angle)) return;
      state.light = angle;
      placeLight();
      publish();
    },
    resetView() {
      Object.assign(orbit, createOrbit({ dist: fitted }));
    },
    setView(v) {
      orbit.vYaw = 0;
      orbit.vPitch = 0;
      if (v.yaw !== undefined && Number.isFinite(v.yaw)) orbit.yaw = v.yaw;
      if (v.pitch !== undefined && Number.isFinite(v.pitch)) orbit.pitch = clampPitch(v.pitch);
      if (v.dist !== undefined && Number.isFinite(v.dist)) orbit.dist = clampDist(v.dist);
    },
    snapshot: () => ({ ...state, reduced: reducedMotion() }),
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    inspect() {
      const c = current;
      const out: LabInspect = { originals: { count: 0, wireframe: 0 }, clones: { count: 0, wireframe: 0 }, meshes: [] };
      if (!c) return out;
      const flat = (m: THREE.Material | THREE.Material[]) => (Array.isArray(m) ? m : [m]);
      const seen = new Set<THREE.Material>();
      for (const original of c.originals.values())
        for (const m of flat(original))
          if (!seen.has(m)) {
            seen.add(m);
            out.originals.count++;
            if ((m as THREE.MeshBasicMaterial).wireframe) out.originals.wireframe++;
          }
      for (const clone of c.clones.values())
        for (const m of flat(clone)) {
          out.clones.count++;
          if ((m as THREE.MeshBasicMaterial).wireframe) out.clones.wireframe++;
        }
      const cloneSet = new Set([...c.clones.values()].flatMap(flat));
      for (const mesh of c.meshes) {
        const m = flat(mesh.material)[0];
        out.meshes.push({ clone: !!m && cloneSet.has(m), wireframe: !!m && !!(m as THREE.MeshBasicMaterial).wireframe });
      }
      return out;
    },
    live() {
      const { frame, memory } = engine.info();
      return { calls: frame.scene.calls, triangles: frame.scene.triangles, geometries: memory.geometries, textures: memory.textures };
    },
    view: () => ({ yaw: orbit.yaw, pitch: orbit.pitch, dist: orbit.dist }),
    dispose() {
      if (disposed) return;
      disposed = true;
      token++;
      stopFrame();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("wheel", onWheel);
      clearCurrent();
      studio.removeFromParent();
      for (const light of [ambient, hemi, key]) light.dispose?.();
      listeners.clear();
      if (window.__criptaLab === lab) delete window.__criptaLab;
      engine.dispose();
    },
  };
  window.__criptaLab = lab;
  try {
    await engine.start();
  } catch (error) {
    lab.dispose();
    throw error;
  }
  if (opts.signal.aborted) {
    lab.dispose();
    return null;
  }
  return lab;
}

/** Caixa só do que se desenha (o `Box3.setFromObject` conta também o invisível, como a "além" da porta). */
function visibleBox(T: Engine["three"], root: THREE.Object3D): THREE.Box3 {
  const box = new T.Box3();
  const part = new T.Box3();
  root.updateWorldMatrix(true, true);
  const walk = (o: THREE.Object3D) => {
    if (!o.visible) return;
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      if (mesh.geometry.boundingBox) box.union(part.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld));
    }
    for (const child of o.children) walk(child);
  };
  walk(root);
  return box;
}

const round1 = (v: number) => Math.round(v * 10) / 10;
