import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { InteractiveObject } from "../layers/types";
import { createExamine, EXAMINE } from "./examine";
import { cinzaWorld, run } from "./testWorld";

const OPEN = { distance: 0.34, title: "bilhete", text: "um bilhete dobrado." };

async function setup() {
  const w = await cinzaWorld();
  const note = w.layer.objects.find((o) => o.id === "bilhete") as InteractiveObject;
  const book = w.layer.objects.find((o) => o.id === "caderno") as InteractiveObject;
  const ex = createExamine(w.engine);
  const cameraKids = w.camera.children.length;
  return { ...w, ex, note, book, cameraKids };
}

/** Todo geometria/material/textura de um objeto, com contagem de `dispose`. */
function watchDisposals(root: THREE.Object3D) {
  const counts = { geometry: 0, material: 0, texture: 0 };
  const seen = new Set<unknown>();
  root.traverse((n) => {
    const mesh = n as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (!seen.has(mesh.geometry)) {
      seen.add(mesh.geometry);
      mesh.geometry.addEventListener("dispose", () => counts.geometry++);
    }
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (seen.has(m)) continue;
      seen.add(m);
      m.addEventListener("dispose", () => counts.material++);
      const map = (m as THREE.MeshPhongMaterial).map;
      if (map && !seen.has(map)) {
        seen.add(map);
        map.addEventListener("dispose", () => counts.texture++);
      }
    }
  });
  return counts;
}

const livesOnCamera = (camera: THREE.Camera) => camera.children.length;

describe("exame · abrir e fechar", () => {
  it("abre uma cópia presa à câmera e esconde o original; fechar devolve tudo", async () => {
    const { ex, note, camera, cameraKids } = await setup();
    const root = note.roots[0];
    expect(ex.isOpen()).toBe(false);
    ex.open(root, OPEN);
    expect(ex.isOpen()).toBe(true);
    expect(root.visible).toBe(false);
    expect(livesOnCamera(camera)).toBe(cameraKids + 1);
    ex.close();
    expect(ex.isOpen()).toBe(false);
    expect(root.visible).toBe(true);
    expect(livesOnCamera(camera)).toBe(cameraKids);
  });

  it("fechar sem abrir é inofensivo", async () => {
    const { ex } = await setup();
    expect(() => ex.close()).not.toThrow();
  });

  it("não vaza: materiais clonados morrem no fechar; geometria, material e textura do original ficam", async () => {
    const { ex, note, book } = await setup();
    const clones: THREE.Material[] = [];
    const orig = THREE.MeshPhongMaterial.prototype.clone;
    const spy = vi.spyOn(THREE.MeshPhongMaterial.prototype, "clone").mockImplementation(function (this: THREE.MeshPhongMaterial) {
      const c = orig.call(this);
      clones.push(c);
      return c;
    });
    for (const o of [note, book]) {
      const watched = watchDisposals(o.roots[0]);
      ex.open(o.roots[0], OPEN);
      const created = clones.length;
      expect(created, "o exame cria cópias dos materiais").toBeGreaterThan(0);
      let disposedClones = 0;
      for (const c of clones) c.addEventListener("dispose", () => disposedClones++);
      ex.close();
      expect(disposedClones, "cada cópia é descartada no fechar").toBe(created);
      expect(watched).toEqual({ geometry: 0, material: 0, texture: 0 });
      clones.length = 0;
    }
    spy.mockRestore();
  });

  it("abrir de novo sem fechar fecha o anterior (nada fica pendurado)", async () => {
    const { ex, note, book, camera, cameraKids } = await setup();
    ex.open(note.roots[0], OPEN);
    ex.open(book.roots[0], { ...OPEN, title: "caderno" });
    expect(livesOnCamera(camera)).toBe(cameraKids + 1);
    expect(note.roots[0].visible, "o primeiro volta à mesa").toBe(true);
    expect(book.roots[0].visible).toBe(false);
    ex.close();
    expect(book.roots[0].visible).toBe(true);
    expect(livesOnCamera(camera)).toBe(cameraKids);
  });

  it("20 ciclos de abrir e fechar não deixam filho na câmera nem objeto escondido", async () => {
    const { ex, note, camera, cameraKids } = await setup();
    for (let i = 0; i < 20; i++) {
      ex.open(note.roots[0], OPEN);
      run(ex, 0.2);
      ex.close();
    }
    expect(livesOnCamera(camera)).toBe(cameraKids);
    expect(note.roots[0].visible).toBe(true);
  });

  it("dispose com o exame aberto devolve o objeto e solta a cópia", async () => {
    const { ex, note, camera, cameraKids } = await setup();
    ex.open(note.roots[0], OPEN);
    ex.dispose();
    expect(note.roots[0].visible).toBe(true);
    expect(livesOnCamera(camera)).toBe(cameraKids);
    expect(ex.isOpen()).toBe(false);
    // depois do dispose, abrir não faz nada
    ex.open(note.roots[0], OPEN);
    expect(ex.isOpen()).toBe(false);
  });

  it("a cópia não leva luz (ligaria uma luz a mais e recompilaria todos os programas) nem projeta sombra", async () => {
    const { ex, camera, scene } = await setup();
    const model = new THREE.Group();
    model.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshPhongMaterial()));
    model.add(new THREE.PointLight(0xffffff, 1));
    scene.add(model);
    ex.open(model, OPEN);
    let lights = 0;
    let casting = 0;
    camera.traverse((n) => {
      if ((n as THREE.Light).isLight) lights++;
      if ((n as THREE.Mesh).isMesh && n.castShadow) casting++;
    });
    expect(lights).toBe(0);
    expect(casting).toBe(0);
    ex.close();
  });
});

describe("exame · enquadramento", () => {
  const corners = (camera: THREE.PerspectiveCamera, group: THREE.Object3D) => {
    camera.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(group);
    const out: THREE.Vector3[] = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) out.push(new THREE.Vector3(x, y, z).project(camera));
    return out;
  };
  const rigOf = (camera: THREE.Camera) => camera.children[camera.children.length - 1];

  it("o bilhete e o caderno cabem no quadro, em tela larga e em tela de celular", async () => {
    const { ex, note, book, camera } = await setup();
    for (const aspect of [1.6, 0.5]) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      for (const o of [note, book]) {
        ex.open(o.roots[0], OPEN);
        run(ex, 0.5);
        const pts = corners(camera, rigOf(camera));
        for (const p of pts) {
          expect(Math.abs(p.x), `${o.id} x @${aspect}`).toBeLessThanOrEqual(1.02);
          expect(Math.abs(p.y), `${o.id} y @${aspect}`).toBeLessThanOrEqual(1.02);
        }
        // e ocupa uma parte útil do quadro (não é um ponto)
        const span = Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y));
        expect(span, `${o.id} @${aspect}`).toBeGreaterThan(0.25);
        ex.close();
      }
    }
  });

  it("objeto deitado (bilhete, caderno) vem com a face de cima virada para a câmera", async () => {
    const { ex, note, book, camera } = await setup();
    for (const o of [note, book]) {
      ex.open(o.roots[0], OPEN);
      run(ex, 0.5);
      // normal "para cima" do modelo, vista do referencial da câmera: z > 0 é de frente para quem olha
      const m = rigOf(camera);
      m.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(camera.matrixWorld).invert();
      const world = new THREE.Vector3(0, 1, 0);
      // o modelo foi reorientado dentro do rig: percorre até a malha mais grossa e usa a normal local do eixo Y
      let mesh: THREE.Mesh | null = null;
      m.traverse((n) => {
        if ((n as THREE.Mesh).isMesh && !mesh) mesh = n as THREE.Mesh;
      });
      expect(mesh).not.toBeNull();
      const e = (mesh as unknown as THREE.Mesh).matrixWorld.elements;
      world.set(e[4], e[5], e[6]).normalize();
      world.transformDirection(inv);
      expect(world.z, `${o.id}: o topo olha para a câmera`).toBeGreaterThan(0.6);
      ex.close();
    }
  });
});

describe("exame · girar e ampliar", () => {
  it("arrastar gira (suave) e inclina com limite; a inclinação nunca vira de cabeça para baixo", async () => {
    const { ex, note } = await setup();
    ex.open(note.roots[0], OPEN);
    const a = ex.state();
    ex.rotate(100, 0);
    run(ex, 1);
    const b = ex.state();
    expect(b.turn - a.turn).toBeCloseTo(100 * EXAMINE.turnPerPx, 2);
    ex.rotate(0, 100000);
    run(ex, 1);
    expect(ex.state().tilt).toBeLessThanOrEqual(EXAMINE.tiltMax + 1e-6);
    ex.rotate(0, -100000);
    run(ex, 1);
    expect(ex.state().tilt).toBeGreaterThanOrEqual(-EXAMINE.tiltMax - 1e-6);
    ex.close();
  });

  it("zoom aproxima e afasta dentro dos limites", async () => {
    const { ex, note } = await setup();
    ex.open(note.roots[0], OPEN);
    const d0 = ex.state().distance;
    expect(d0).toBeCloseTo(OPEN.distance, 6);
    ex.zoom(-1);
    run(ex, 1);
    expect(ex.state().distance).toBeLessThan(d0);
    for (let i = 0; i < 100; i++) ex.zoom(-1);
    run(ex, 2);
    expect(ex.state().distance).toBeCloseTo(OPEN.distance * EXAMINE.zoomMin, 3);
    for (let i = 0; i < 200; i++) ex.zoom(1);
    run(ex, 2);
    expect(ex.state().distance).toBeCloseTo(OPEN.distance * EXAMINE.zoomMax, 3);
    ex.close();
  });

  it("girar e ampliar com o exame fechado não faz nada", async () => {
    const { ex } = await setup();
    expect(() => {
      ex.rotate(10, 10);
      ex.zoom(1);
      ex.update(0.05);
    }).not.toThrow();
  });

  it("movimento reduzido: o giro vai direto, sem suavizar", async () => {
    const w = await cinzaWorld();
    const note = w.layer.objects.find((o) => o.id === "bilhete") as InteractiveObject;
    const ex = createExamine(w.engine, { reduced: () => true });
    ex.open(note.roots[0], OPEN);
    const a = ex.state().turn;
    ex.rotate(50, 0);
    ex.update(0.016);
    expect(ex.state().turn - a).toBeCloseTo(50 * EXAMINE.turnPerPx, 6);
    ex.close();
  });

  it("o título e o texto ficam disponíveis enquanto aberto", async () => {
    const { ex, note } = await setup();
    ex.open(note.roots[0], OPEN);
    expect(ex.state().title).toBe("bilhete");
    ex.close();
  });
});
