import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { InteractiveObject } from "../layers/types";
import { applyPsx } from "../render/psx";
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

describe("exame · realce da cópia", () => {
  it("só a cópia ganha cor e emissivo; o material do original fica exatamente como estava", async () => {
    const { ex, note, camera } = await setup();
    const orig = (note.roots[0] as THREE.Mesh).material as THREE.MeshPhongMaterial;
    const color = orig.color.clone();
    const emissive = orig.emissive.clone();
    ex.open(note.roots[0], OPEN);
    let copy: THREE.MeshPhongMaterial | null = null;
    camera.traverse((n) => {
      if ((n as THREE.Mesh).isMesh) copy = (n as THREE.Mesh).material as THREE.MeshPhongMaterial;
    });
    expect(copy).not.toBe(orig);
    expect((copy as unknown as THREE.MeshPhongMaterial).color.r).toBeCloseTo(color.r * EXAMINE.lift, 6);
    expect((copy as unknown as THREE.MeshPhongMaterial).emissive.r).toBeGreaterThan(0);
    expect(orig.color.equals(color)).toBe(true);
    expect(orig.emissive.equals(emissive)).toBe(true);
    ex.close();
  });
});

describe("exame · luz e PSX próprios da cópia", () => {
  /** Roda o `onBeforeCompile` da cópia com shaders mínimos e devolve os uniforms que ela ligou. */
  function uniformsOf(m: THREE.Material) {
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: "void main(){\n#include <project_vertex>\n}",
      fragmentShader: "void main(){\n#include <map_fragment>\n}",
    };
    m.onBeforeCompile(shader as never, undefined as never);
    return shader.uniforms;
  }
  const copyMaterial = (camera: THREE.Camera) => {
    let found: THREE.MeshPhongMaterial | null = null;
    camera.traverse((n) => {
      if ((n as THREE.Mesh).isMesh && !found) found = (n as THREE.Mesh).material as THREE.MeshPhongMaterial;
    });
    return found as unknown as THREE.MeshPhongMaterial;
  };

  it("a cópia usa uniforms PSX próprios, com tremor e afim desligados; a sala continua com os dela", async () => {
    const { ex, note, camera, engine } = await setup();
    ex.open(note.roots[0], OPEN);
    const ours = uniformsOf(copyMaterial(camera));
    expect(ours.uSnap.value).toBe(0);
    expect(ours.uAff.value).toBe(0);
    expect(ours.uSnap).not.toBe(engine.psx.uSnap);
    expect(engine.psx.uSnap.value).toBe(1);
    // um material da sala (com o PSX do engine) liga os uniforms da sala
    const roomLike = applyPsx(((note.roots[0] as THREE.Mesh).material as THREE.Material).clone(), engine.psx);
    expect(uniformsOf(roomLike).uSnap).toBe(engine.psx.uSnap);
    ex.close();
  });

  it("o programa é o mesmo: a chave de cache da cópia é a de um material da sala com o mesmo mapa", async () => {
    const { ex, note, camera, engine } = await setup();
    ex.open(note.roots[0], OPEN);
    const copy = copyMaterial(camera);
    const roomLike = applyPsx(((note.roots[0] as THREE.Mesh).material as THREE.Material).clone(), engine.psx);
    expect(copy.customProgramCacheKey()).toBe(roomLike.customProgramCacheKey());
    expect(copy.customProgramCacheKey()).toBe("psx-m");
    ex.close();
  });

  it("o emissivo da cópia é a base do original + cor·selfLit·quente, qualquer que seja a fase do brilho (determinístico)", async () => {
    const { ex, note, camera } = await setup();
    const orig = (note.roots[0] as THREE.Mesh).material as THREE.MeshPhongMaterial;
    const expected = orig.emissive.r + orig.color.r * EXAMINE.selfLit * EXAMINE.warm[0];
    ex.open(note.roots[0], OPEN);
    expect(copyMaterial(camera).emissive.r).toBeCloseTo(expected, 8);
    expect(ex.state().emissive).toBeCloseTo(expected, 8);
    ex.close();
  });

  it("a cópia é quente, não fria: vermelho > verde > azul na cor de realce", async () => {
    const { ex, note, camera } = await setup();
    ex.open(note.roots[0], OPEN);
    const c = copyMaterial(camera);
    expect(c.color.r).toBeGreaterThan(c.color.g);
    expect(c.color.g).toBeGreaterThan(c.color.b);
    ex.close();
  });

  it("estado de depuração: original visível/escondido e filhos da câmera", async () => {
    const { ex, note } = await setup();
    expect(ex.state().originalVisible).toBeNull();
    ex.open(note.roots[0], OPEN);
    expect(ex.state().originalVisible).toBe(false);
    ex.close();
    expect(ex.state().originalVisible).toBeNull();
  });
});

describe("exame · aberto sob o brilho (ordem da sessão)", () => {
  it("com o brilho do alvo aceso, fechar o brilho ANTES de abrir deixa a cópia igual em qualquer fase", async () => {
    const { createInteraction } = await import("./interaction");
    const { createPlayer } = await import("../player/controller");
    const { DEFAULT_SETTINGS } = await import("../save/schema");
    const copies: number[] = [];
    for (const phase of [0, 0.29, 0.57, 0.91]) {
      const w = await cinzaWorld();
      const player = createPlayer(w.engine, w.layer, DEFAULT_SETTINGS, { save: w.save.get, still: true });
      const it = createInteraction({ three: THREE, camera: w.camera, player, objects: w.layer.objects, save: w.save.get, act: () => {}, ui: { prompt() {}, reticle() {}, notice() {} } });
      const ex = createExamine(w.engine);
      player.placeAt("mesa");
      const note = w.layer.objects.find((o) => o.id === "bilhete") as InteractiveObject;
      const c = new THREE.Box3().setFromObject(note.roots[0]).getCenter(new THREE.Vector3());
      player.lookAt(c.x, c.y, c.z, 0);
      let t = 0;
      for (let i = 0; i < 14; i++) {
        t += 0.05;
        player.update(0.05);
        it.update(0.05, t);
      }
      it.update(0.05, phase * 2);
      expect(it.state().glow).toBe("bilhete");
      // a ordem da sessão: painel (apaga o brilho) e só então o exame lê os materiais
      it.setPanel(true);
      player.setPanel(true);
      ex.open(note.roots[0], OPEN);
      copies.push(ex.state().emissive);
      ex.close();
      it.dispose();
      player.dispose();
    }
    expect(new Set(copies.map((v) => v.toFixed(8))).size).toBe(1);
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
