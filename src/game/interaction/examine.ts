import type * as THREE from "three";
import { applyPsx } from "../render/psx";
import type { Engine } from "../runtime/engine";

/**
 * Exame (T9): o objeto em primeiro plano, preso à câmera, girável (arrastar/setas), com zoom. É um PAINEL: quem
 * abre empilha em `shell/panelStack.ts`; este módulo só cuida da cena.
 *
 * - O que se examina é uma CÓPIA do modelo da sala (`clone(true)`: a geometria e a textura são as mesmas, nada é
 *   duplicado na GPU). O original fica escondido enquanto a cópia está na mão e volta ao fechar.
 * - Os materiais são copiados (o `emissive`, o `visible` e o PSX são por material) e as cópias — só elas — são
 *   descartadas ao fechar. Geometria, textura e material do original NUNCA são descartados aqui.
 * - A cópia não leva luz (uma luz a mais religaria e recompilaria todos os programas) e não projeta nem recebe
 *   sombra (a sombra de um objeto a 30 cm do olho cairia na sala).
 * - Enquadramento: o raio da esfera do modelo ocupa 70% da menor meia-tela (qualquer proporção de janela). Peça
 *   deitada (bilhete, caderno) vem com a face de cima para a câmera; peça de pé fica como está.
 */
export const EXAMINE = {
  /** Radianos por pixel de arrasto. */
  turnPerPx: 0.011,
  tiltPerPx: 0.008,
  /** Inclinação máxima para cima/baixo (a cabeça nunca vira de ponta-cabeça). */
  tiltMax: 1.2,
  /** Limites do zoom, como fração da distância inicial. */
  zoomMin: 0.55,
  zoomMax: 1.6,
  zoomStep: 0.05,
  /** Fração da menor meia-tela que o raio do modelo ocupa. */
  fill: 0.7,
  /** Pose de repouso: um pouco de lado e inclinado, para ler o volume. */
  restTurn: 0.3,
  restTilt: -0.2,
  /** Deslocamento vertical do centro (m), como o protótipo. */
  drop: 0.01,
  /**
   * Realce das cópias (o objeto a 30 cm do olho fica de costas para a luz da sala e lia escuro): a cor sobe e um
   * emissivo da própria cor entra. Só uniforms: o programa de shader é o mesmo do original.
   */
  lift: 2.2,
  selfLit: 0.05,
  /** Taxas de suavização (1/s). */
  turnRate: 14,
  zoomRate: 10,
} as const;

export type ExamineOpen = { distance: number; title: string; text: string };
export type ExamineState = { open: boolean; title: string; text: string; turn: number; tilt: number; distance: number };

export type Examine = {
  open(obj: THREE.Object3D, opts: ExamineOpen): void;
  /** Delta de arrasto em pixels (a suavização cuida do resto). */
  rotate(dx: number, dy: number): void;
  /** `delta` < 0 aproxima, > 0 afasta (o sinal do `wheel`). */
  zoom(delta: number): void;
  update(dt: number): void;
  close(): void;
  isOpen(): boolean;
  state(): ExamineState;
  dispose(): void;
};

type ExamineEngine = Pick<Engine, "three" | "camera" | "psx">;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function createExamine(engine: ExamineEngine, opts: { reduced?: () => boolean } = {}): Examine {
  const { three: T, camera, psx } = engine;
  const reduced = opts.reduced ?? (() => false);

  type Held = {
    rig: THREE.Group;
    tiltG: THREE.Group;
    turnG: THREE.Group;
    base: THREE.Group;
    original: THREE.Object3D;
    wasVisible: boolean;
    materials: THREE.Material[];
    radius: number;
    baseDistance: number;
    aspect: number;
  };
  let held: Held | null = null;
  let disposed = false;
  let title = "";
  let text = "";
  let turn = 0;
  let turnT = 0;
  let tilt = 0;
  let tiltT = 0;
  let dist = 0;
  let distT = 0;

  /** Escala que põe o raio do modelo em `fill` da menor meia-tela à distância `d`. */
  const fitScale = (h: Held, d: number) => {
    const halfH = d * Math.tan((camera.fov * Math.PI) / 360);
    const halfW = halfH * camera.aspect;
    return (EXAMINE.fill * Math.min(halfH, halfW)) / h.radius;
  };

  const release = () => {
    const h = held;
    if (!h) return;
    held = null;
    h.rig.removeFromParent();
    h.original.visible = h.wasVisible;
    // Só as cópias morrem; geometria e textura são do original (e do kit).
    for (const m of h.materials) m.dispose();
  };

  const cloneMaterials = (root: THREE.Object3D): THREE.Material[] => {
    const made = new Map<THREE.Material, THREE.Material>();
    const copy = (m: THREE.Material) => {
      let c = made.get(m);
      if (!c) {
        c = applyPsx(m.clone(), psx);
        const lit = c as THREE.Material & { color?: THREE.Color; emissive?: THREE.Color };
        if (lit.color?.isColor && lit.emissive?.isColor) {
          lit.emissive.r += lit.color.r * EXAMINE.selfLit;
          lit.emissive.g += lit.color.g * EXAMINE.selfLit;
          lit.emissive.b += lit.color.b * EXAMINE.selfLit;
          lit.color.multiplyScalar(EXAMINE.lift);
        }
        made.set(m, c);
      }
      return c;
    };
    root.traverse((n) => {
      const mesh = n as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(copy) : copy(mesh.material);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    });
    return [...made.values()];
  };

  return {
    open(obj, o) {
      if (disposed) return;
      release();
      const clone = obj.clone(true);
      clone.position.set(0, 0, 0);
      clone.rotation.set(0, 0, 0);
      clone.scale.set(1, 1, 1);
      clone.visible = true;
      const lights: THREE.Object3D[] = [];
      clone.traverse((n) => {
        if ((n as THREE.Light).isLight) lights.push(n);
      });
      for (const l of lights) l.removeFromParent();
      const materials = cloneMaterials(clone);

      clone.updateMatrixWorld(true);
      const box = new T.Box3().setFromObject(clone);
      const size = box.getSize(new T.Vector3());
      const center = box.getCenter(new T.Vector3());
      const sphere = box.getBoundingSphere(new T.Sphere());
      clone.position.copy(center).multiplyScalar(-1);

      // Peça deitada: a face de cima para a câmera. Peça em pé de lado: a face larga para a câmera.
      const base = new T.Group();
      const flat = size.y < 0.6 * Math.min(size.x, size.z);
      if (flat) base.rotation.x = Math.PI / 2;
      else if (size.x < 0.6 * Math.min(size.y, size.z)) base.rotation.y = -Math.PI / 2;
      base.add(clone);
      const turnG = new T.Group();
      turnG.add(base);
      const tiltG = new T.Group();
      tiltG.add(turnG);
      const rig = new T.Group();
      rig.name = "exame";
      rig.add(tiltG);
      rig.position.set(0, -EXAMINE.drop, -o.distance);
      camera.add(rig);

      held = {
        rig,
        tiltG,
        turnG,
        base,
        original: obj,
        wasVisible: obj.visible,
        materials,
        radius: Math.max(sphere.radius, 1e-4),
        baseDistance: o.distance,
        aspect: camera.aspect,
      };
      obj.visible = false;
      title = o.title;
      text = o.text;
      turn = turnT = EXAMINE.restTurn;
      tilt = tiltT = EXAMINE.restTilt;
      dist = distT = o.distance;
      base.scale.setScalar(fitScale(held, o.distance));
      turnG.rotation.y = turn;
      tiltG.rotation.x = tilt;
    },
    rotate(dx, dy) {
      if (!held) return;
      turnT += dx * EXAMINE.turnPerPx;
      tiltT = clamp(tiltT + dy * EXAMINE.tiltPerPx, -EXAMINE.tiltMax, EXAMINE.tiltMax);
    },
    zoom(delta) {
      const h = held;
      if (!h || delta === 0) return;
      distT = clamp(distT + Math.sign(delta) * EXAMINE.zoomStep * h.baseDistance, h.baseDistance * EXAMINE.zoomMin, h.baseDistance * EXAMINE.zoomMax);
    },
    update(dt) {
      const h = held;
      if (!h) return;
      const instant = reduced();
      const kt = instant ? 1 : 1 - Math.exp(-Math.max(0, dt) * EXAMINE.turnRate);
      const kz = instant ? 1 : 1 - Math.exp(-Math.max(0, dt) * EXAMINE.zoomRate);
      turn += (turnT - turn) * kt;
      tilt += (tiltT - tilt) * kt;
      dist += (distT - dist) * kz;
      h.turnG.rotation.y = turn;
      h.tiltG.rotation.x = tilt;
      h.rig.position.z = -dist;
      if (camera.aspect !== h.aspect) {
        h.aspect = camera.aspect;
        h.base.scale.setScalar(fitScale(h, h.baseDistance));
      }
    },
    close: release,
    isOpen: () => held !== null,
    state: () => ({ open: held !== null, title, text, turn, tilt, distance: dist }),
    dispose() {
      release();
      disposed = true;
    },
  };
}
