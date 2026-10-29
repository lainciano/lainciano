import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { MaterialKit } from "../render/materials";
import { createHands, TORCH } from "./hands";

// Rig real (three em Node, kit falso sem canvas): o que o olho do dono veria como "dedo atravessando a lanterna"
// vira uma conta de distância ao eixo do tubo.

function setup() {
  const materials: THREE.Material[] = [];
  const kit: MaterialKit = {
    phong: (o) => {
      const m = new THREE.MeshPhongMaterial(o);
      materials.push(m);
      return m;
    },
    basic: (o) => {
      const m = new THREE.MeshBasicMaterial(o);
      materials.push(m);
      return m;
    },
    texture: () => new THREE.CanvasTexture(undefined as unknown as HTMLCanvasElement),
    dispose: () => {},
  };
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1.6, 0.02, 60);
  scene.add(camera);
  const hands = createHands(THREE, kit, camera, scene, { seed: 1, reduced: false, still: false, flashOn: true });
  return { hands, scene, camera, materials };
}

/** Menor distância ao eixo do tubo entre os vértices dos dedos que ficam na altura do tubo. */
function minFingerClearance(hands: ReturnType<typeof setup>["hands"]) {
  const rig = hands.debug.rig();
  rig.grip.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(rig.grip.matrixWorld).invert();
  const v = new THREE.Vector3();
  let min = Infinity;
  for (const m of rig.fingers) {
    m.updateWorldMatrix(true, false);
    const pos = m.geometry.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).applyMatrix4(inv);
      if (v.z < TORCH.band[0] || v.z > TORCH.tail[1]) continue;
      min = Math.min(min, Math.hypot(v.x, v.y));
    }
  }
  return min;
}

describe("mãos · empunhadura (geometria)", () => {
  it("nenhum vértice de dedo entra no tubo: pegada normal, apertando (ociosa) e afrouxando (guardada)", () => {
    const { hands } = setup();
    expect(minFingerClearance(hands)).toBeGreaterThanOrEqual(TORCH.r - 0.0003);
    hands.debug.forceIdle("regrip");
    hands.debug.step(0.22, {});
    expect(minFingerClearance(hands)).toBeGreaterThanOrEqual(TORCH.r - 0.0003);
    hands.debug.step(0.6, { panel: true });
    expect(minFingerClearance(hands)).toBeGreaterThanOrEqual(TORCH.r - 0.0003);
  });

  it("a ponta do polegar pousa no botão (≤ 11 mm do centro da cúpula, no espaço da lanterna)", () => {
    const { hands } = setup();
    const rig = hands.debug.rig();
    rig.grip.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(rig.grip.matrixWorld).invert();
    const tip = rig.thumbTip.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
    const dome = rig.button.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
    expect(tip.distanceTo(dome)).toBeLessThan(0.011);
  });

  it("a luz sai da cabeça da lanterna (à frente do aro, no eixo)", () => {
    const { hands } = setup();
    const rig = hands.debug.rig();
    expect(rig.flash.parent).toBe(rig.grip);
    expect(rig.flash.position.z).toBeLessThanOrEqual(rig.headFront);
    expect(Math.hypot(rig.flash.position.x, rig.flash.position.y)).toBeLessThan(1e-9);
  });

  it("orçamento: poucas centenas de triângulos por mão (sem manga e sem lanterna)", () => {
    const { hands } = setup();
    const { right, left } = hands.debug.rig().triangles;
    expect(right).toBeGreaterThan(200);
    expect(right).toBeLessThan(1000);
    expect(left).toBeLessThan(1000);
  });
});

describe("mãos · descarte", () => {
  it("dispose solta as mãos, o corpo e o celular, e descarta toda geometria criada (materiais são do kit)", () => {
    const { hands, scene, camera, materials } = setup();
    hands.phone("open");
    hands.debug.step(1.2, {});
    const geos = new Set<THREE.BufferGeometry>();
    const collect = (o: THREE.Object3D) => o.traverse((c) => c instanceof THREE.Mesh && geos.add(c.geometry));
    camera.children.forEach(collect);
    collect(hands.body);
    expect(geos.size).toBeGreaterThan(60);
    const disposed = new Set<THREE.BufferGeometry>();
    for (const geo of geos) geo.addEventListener("dispose", () => disposed.add(geo));
    let materialDisposes = 0;
    for (const m of materials) m.addEventListener("dispose", () => (materialDisposes += 1));
    const cameraBefore = camera.children.length;
    hands.dispose();
    expect(disposed.size).toBe(geos.size);
    expect(camera.children.length).toBe(cameraBefore - 2);
    expect(scene.getObjectByName("corpo-sombra")).toBeUndefined();
    expect(materialDisposes).toBe(0);
  });
});

describe("mãos · polegar", () => {
  it("o polegar fica junto do tubo (nenhum vértice a mais de 5,5 cm do eixo; o tenar chega a 4,6): sem falange torta para fora", () => {
    const { hands } = setup();
    const rig = hands.debug.rig();
    rig.grip.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(rig.grip.matrixWorld).invert();
    const v = new THREE.Vector3();
    let max = 0;
    for (const m of rig.thumb) {
      m.updateWorldMatrix(true, false);
      const pos = m.geometry.getAttribute("position");
      for (let i = 0; i < pos.count; i++) max = Math.max(max, Math.hypot(...v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).applyMatrix4(inv).toArray().slice(0, 2)));
    }
    expect(max).toBeLessThan(0.055);
  });
});

describe("mãos · celular real (T11)", () => {
  /** Abre o celular e devolve a tela projetada: centro (NDC), altura (fração do quadro) e o quanto ela olha para o olho. */
  function openAndProject(fov: number, aspect = 1.6) {
    const s = setup();
    s.camera.fov = fov;
    s.camera.aspect = aspect;
    s.camera.updateProjectionMatrix();
    s.hands.phone("open");
    s.hands.debug.step(1.2, {});
    s.camera.updateMatrixWorld(true);
    const corners = [0, 1, 2, 3].map(() => new THREE.Vector3());
    expect(s.hands.phoneScreen(corners)).toBe(true);
    const ndc = corners.map((c) => c.clone().project(s.camera));
    const center = ndc.reduce((a, c) => a.add(c), new THREE.Vector3()).multiplyScalar(0.25);
    const height = (ndc[0].y + ndc[1].y - ndc[2].y - ndc[3].y) / 4; // meia-altura em NDC = fração do quadro
    const mid = corners.reduce((a, c) => a.add(c), new THREE.Vector3()).multiplyScalar(0.25);
    const normal = new THREE.Vector3().subVectors(corners[1], corners[0]).cross(new THREE.Vector3().subVectors(corners[0], corners[3])).normalize();
    const toEye = new THREE.Vector3().subVectors(s.camera.getWorldPosition(new THREE.Vector3()), mid).normalize();
    return { ...s, center, height, facing: normal.dot(toEye), distance: mid.distanceTo(s.camera.position) };
  }

  it("a tela aberta ocupa ~27 % da altura, um pouco acima do centro, virada para o olho, em FOV 62 e 80", () => {
    for (const fov of [62, 80]) {
      const { center, height, facing } = openAndProject(fov);
      expect(height, `fov ${fov}`).toBeGreaterThan(0.25);
      expect(height, `fov ${fov}`).toBeLessThan(0.29);
      expect(center.y).toBeCloseTo(0.3, 1);
      expect(Math.abs(center.x)).toBeLessThan(0.15);
      expect(facing).toBeGreaterThan(0.995);
    }
    // FOV maior: o aparelho chega mais perto (a tela não encolhe na imagem)
    expect(openAndProject(80).distance).toBeLessThan(openAndProject(62).distance);
  });

  it("phoneScreen só responde com a tampa aberta (abrindo, fechando ou guardado: false)", () => {
    const { hands } = setup();
    const out = [0, 1, 2, 3].map(() => new THREE.Vector3());
    expect(hands.phoneScreen(out)).toBe(false);
    hands.phone("open");
    hands.debug.step(0.2, {});
    expect(hands.phoneScreen(out)).toBe(false);
    hands.debug.step(1, {});
    expect(hands.phoneScreen(out)).toBe(true);
    hands.phone("close");
    hands.debug.step(0.05, {});
    expect(hands.phoneScreen(out)).toBe(false);
  });

  it("apertar: o polegar vai até a tecla e afunda junto com ela (ponta a ≤ 1,5 mm do tampo afundado), falanges sem esticar", () => {
    const { hands } = setup();
    hands.phone("open");
    hands.debug.step(1.2, {});
    for (const key of ["down", "ok", "softR", "up"] as const) {
      expect(hands.press(key)).toBe(true);
      let best = Infinity;
      for (let i = 0; i < 24; i++) {
        hands.debug.step(1 / 60, {});
        const ph = hands.debug.phone()!;
        const top = ph.model.keyTop(key, new THREE.Vector3());
        ph.model.root.updateWorldMatrix(true, false);
        const world = top.applyMatrix4(ph.model.root.matrixWorld);
        // a ponta é uma esfera de 7,4 mm (× escala da mão): a distância do centro ao tampo, menos o raio
        best = Math.min(best, ph.thumbTip.distanceTo(world) - 0.0074 * 1.12 * 0.92);
        expect(ph.thumbBones.proximal).toBeCloseTo(0.028, 4);
        expect(ph.thumbBones.distal).toBeCloseTo(0.024, 4);
      }
      expect(best, key).toBeLessThan(0.0015);
      hands.debug.step(1.5, {});
    }
  });

  it("orçamento do aparelho: 4 malhas (4 chamadas de desenho) e poucos milhares de triângulos; um só aparelho em 20 aberturas", () => {
    const { hands, camera } = setup();
    hands.phone("open");
    hands.debug.step(1.2, {});
    const model = hands.debug.phone()!.model;
    expect(model.stats.meshes).toBe(4);
    let meshes = 0;
    model.root.traverse((o) => o instanceof THREE.Mesh && (meshes += 1));
    expect(meshes).toBe(4);
    expect(model.stats.triangles).toBeGreaterThan(1500);
    expect(model.stats.triangles).toBeLessThan(6000);
    const count = () => {
      const g = new Set<THREE.BufferGeometry>();
      camera.traverse((o) => o instanceof THREE.Mesh && g.add(o.geometry));
      return g.size;
    };
    const before = count();
    for (let i = 0; i < 20; i++) {
      hands.phone("close");
      hands.debug.step(0.8, {});
      hands.phone("open");
      hands.debug.step(1.2, {});
    }
    expect(hands.debug.phone()!.model).toBe(model);
    expect(count()).toBe(before);
  });

  it("a tecla afunda de verdade (vértices dela, só dela) e volta", () => {
    const { hands } = setup();
    hands.phone("open");
    hands.debug.step(1.2, {});
    const model = hands.debug.phone()!.model;
    const keys = model.root.getObjectByName("celular-teclas") as THREE.Mesh;
    const pos = keys.geometry.getAttribute("position");
    const snapshot = () => Float32Array.from({ length: pos.count }, (_, i) => pos.getZ(i));
    const rest = snapshot();
    hands.press("5");
    let deepest = 0;
    let moved = 0;
    for (let i = 0; i < 20; i++) {
      hands.debug.step(1 / 60, {});
      const now = snapshot();
      let d = 0;
      let n = 0;
      for (let k = 0; k < now.length; k++) {
        if (rest[k] - now[k] > 1e-7) n += 1;
        d = Math.max(d, rest[k] - now[k]);
      }
      deepest = Math.max(deepest, d);
      moved = Math.max(moved, n);
    }
    expect(deepest).toBeCloseTo(0.0009, 5);
    expect(moved).toBeGreaterThan(20);
    expect(moved).toBeLessThan(pos.count / 10);
    hands.debug.step(0.5, {});
    expect(Array.from(snapshot())).toEqual(Array.from(rest));
  });
});

describe("mãos · celular, plano próximo (T11, revisão M3)", () => {
  /** Menor distância do olho a qualquer vértice da tampa enquanto ela abre. */
  function minLidDistance(fov: number, aspect: number) {
    const { hands, camera } = setup();
    camera.fov = fov;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    hands.phone("open");
    const eye = camera.getWorldPosition(new THREE.Vector3());
    const v = new THREE.Vector3();
    let min = Infinity;
    for (let i = 0; i < 80; i++) {
      hands.debug.step(1 / 60, {});
      const lid = hands.debug.phone()!.model.lid;
      lid.updateWorldMatrix(true, true);
      lid.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const pos = o.geometry.getAttribute("position");
        for (let k = 0; k < pos.count; k++) min = Math.min(min, v.fromBufferAttribute(pos, k).applyMatrix4(o.matrixWorld).distanceTo(eye));
      });
    }
    return min;
  }

  it("a tampa nunca chega a 3,5 cm do olho abrindo (FOV 55, 62, 80; tela deitada e em pé)", () => {
    for (const fov of [55, 62, 80]) for (const aspect of [1.6, 0.46]) expect(minLidDistance(fov, aspect), `fov ${fov} aspecto ${aspect}`).toBeGreaterThan(0.035);
  });
});

describe("mãos · celular, FOV ao vivo e janelas (T11, revisão M6/M10)", () => {
  const project = (hands: ReturnType<typeof setup>["hands"], camera: THREE.PerspectiveCamera) => {
    camera.updateMatrixWorld(true);
    const c = [0, 1, 2, 3].map(() => new THREE.Vector3());
    if (!hands.phoneScreen(c)) return null;
    const ndc = c.map((v) => v.project(camera));
    return { ndc, center: ndc.reduce((a, v) => a.add(v), new THREE.Vector3()).multiplyScalar(0.25), height: (ndc[0].y + ndc[1].y - ndc[2].y - ndc[3].y) / 4 };
  };

  it("trocar o FOV com o celular na mão: a pose corre (sem salto por quadro) e assenta em ~0,3 s", () => {
    const { hands, camera } = setup();
    hands.phone("open");
    hands.debug.step(1.2, {});
    camera.fov = 80;
    camera.updateProjectionMatrix();
    let prev = project(hands, camera)!.center.clone();
    let maxJump = 0;
    for (let i = 0; i < 24; i++) {
      hands.debug.step(1 / 60, {});
      const now = project(hands, camera)!.center;
      maxJump = Math.max(maxJump, now.distanceTo(prev));
      prev = now.clone();
    }
    const settled = project(hands, camera)!;
    expect(settled.height).toBeGreaterThan(0.25);
    expect(settled.height).toBeLessThan(0.29);
    // o 1º quadro depois da troca muda a projeção inteira (FOV); dali em diante, passos pequenos
    expect(maxJump).toBeLessThan(0.2);
  });

  it("FOV 55 e tela em pé (aspecto 0,46): a tela inteira cabe no quadro", () => {
    const { hands, camera } = setup();
    camera.fov = 55;
    camera.aspect = 0.46;
    camera.updateProjectionMatrix();
    hands.phone("open");
    hands.debug.step(1.2, {});
    const p = project(hands, camera)!;
    for (const v of p.ndc) {
      expect(Math.abs(v.x)).toBeLessThan(1);
      expect(Math.abs(v.y)).toBeLessThan(1);
    }
  });

  it("janela baixa: setPhoneFrac sobe a fração (limitada a 0,42)", () => {
    const { hands, camera } = setup();
    hands.phone("open");
    hands.debug.step(1.2, {});
    hands.setPhoneFrac(0.4);
    hands.debug.step(0.5, {});
    expect(project(hands, camera)!.height).toBeGreaterThan(0.37);
    hands.setPhoneFrac(0.9);
    hands.debug.step(0.5, {});
    expect(project(hands, camera)!.height).toBeLessThan(0.45);
  });
});
