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
