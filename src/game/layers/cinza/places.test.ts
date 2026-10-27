import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { MaterialKit } from "../../render/materials";
import { initialSave } from "../../save/schema";
import type { SaveApi } from "../../save/store";
import { segmentClear, type Box2 } from "../../world/collision";
import { pathBetween } from "../../world/places";
import { placesWithinReach, REACH_FLOOR } from "../../world/reach";
import { surfaceAt } from "../../world/surfaces";
import type { GameCtx, LayerInstance, Own } from "../types";
import { cinzaLayer } from "./index";
import { CINZA_PLACES, DOOR_FLAG, PLAYER_RADIUS } from "./places";

// O teste carrega a camada de verdade (geometria three em Node) com um kit falso: sem canvas, as texturas são
// `Texture` vazias. Assim o ponto de cada objeto sai dos `roots` reais (Ruling 4), não de uma tabela à parte.

function fakeKit(): MaterialKit {
  return {
    phong: (o) => new THREE.MeshPhongMaterial(o),
    basic: (o) => new THREE.MeshBasicMaterial(o),
    texture: () => new THREE.CanvasTexture(undefined as unknown as HTMLCanvasElement),
    dispose: () => {},
  };
}

function fakeSave(): SaveApi {
  let state = initialSave(0);
  return { get: () => state, patch: (p) => (state = { ...state, ...p }), reset: () => {}, wipeGame: () => {} };
}

function fakeCtx(): GameCtx {
  return {
    three: THREE,
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
    kit: fakeKit(),
    audio: { step() {}, object() {}, room() {}, suspend() {}, resume() {} },
    say() {},
    save: fakeSave(),
  };
}

function collector() {
  const owned = new Set<unknown>();
  let cleanups = 0;
  const own = (<T extends { dispose(): void }>(r: T): T => {
    owned.add(r);
    return r;
  }) as Own;
  own.add = () => {
    cleanups += 1;
  };
  return { own, owned, cleanups: () => cleanups };
}

async function load() {
  const ctx = fakeCtx();
  const { own, owned } = collector();
  const instance = await cinzaLayer.load(ctx, new AbortController().signal, own);
  return { ctx, instance, owned };
}

/** Ruling 4: centro XZ da caixa que envolve todos os `roots` do objeto. */
function pointOf(roots: THREE.Object3D[]) {
  const box = new THREE.Box3();
  for (const root of roots) {
    root.updateWorldMatrix(true, true);
    box.expandByObject(root);
  }
  const c = box.getCenter(new THREE.Vector3());
  return { x: c.x, z: c.z, empty: box.isEmpty() };
}

const openWithDoor = (instance: LayerInstance, doorOpen: boolean) => {
  const save = { ...initialSave(0), flags: { [DOOR_FLAG]: doorOpen } };
  return (id: string) => !instance.places.places[id]?.locked?.(save);
};

const NO_BOUNDS: Box2 = { minX: -Infinity, maxX: Infinity, minZ: -Infinity, maxZ: Infinity };

describe("sala cinza · lugares e alcance", () => {
  it("tem os quatro lugares do brief", async () => {
    const { instance } = await load();
    expect(Object.keys(instance.places.places).sort()).toEqual(["armario", "entrada", "mesa", "porta"]);
    expect(Object.keys(CINZA_PLACES).sort()).toEqual(["armario", "entrada", "mesa", "porta"]);
  });

  it("todo objeto tem o ponto (centro XZ dos roots) a ≤ REACH_FLOOR do seu lugar", async () => {
    const { instance } = await load();
    expect(instance.objects.length).toBeGreaterThanOrEqual(5);
    const objects = instance.objects.map((o) => {
      const p = pointOf(o.roots);
      expect(p.empty, `${o.id}: roots vazios`).toBe(false);
      return { id: o.id, place: o.place, point: { x: p.x, z: p.z } };
    });
    const reach = placesWithinReach(instance.places, objects);
    for (const r of reach) expect(r.distance, `${r.id} a ${r.distance.toFixed(2)} m`).toBeLessThanOrEqual(REACH_FLOOR);
    expect(reach.every((r) => r.ok)).toBe(true);
  });

  it("mesa, bilhete, caderno, armário e porta são objetos, cada um num lugar que existe", async () => {
    const { instance } = await load();
    const ids = instance.objects.map((o) => o.id);
    for (const id of ["mesa", "bilhete", "caderno", "armario", "porta"]) expect(ids).toContain(id);
    for (const o of instance.objects) expect(instance.places.places[o.place], o.id).toBeDefined();
  });

  it("arestas simétricas e todo lugar alcança todos os outros com a porta aberta", async () => {
    const { instance } = await load();
    const { places, edges } = instance.places;
    for (const [a, list] of Object.entries(edges)) {
      for (const b of list) expect(edges[b] ?? [], `${b} → ${a}`).toContain(a);
    }
    const open = openWithDoor(instance, true);
    const ids = Object.keys(places);
    for (const a of ids) for (const b of ids) expect(pathBetween(instance.places, a, b, open), `${a} → ${b}`).not.toBeNull();
  });

  it("com a porta trancada nenhum lugar da sala fica de fora (a porta é objeto, não passagem)", async () => {
    const { instance } = await load();
    const open = openWithDoor(instance, false);
    const ids = Object.keys(instance.places.places);
    for (const a of ids) for (const b of ids) expect(pathBetween(instance.places, a, b, open), `${a} → ${b}`).not.toBeNull();
  });

  it("cada lugar é livre e cada aresta é andável (raio do jogador) sem atravessar móvel nem parede", async () => {
    const { instance } = await load();
    const { places, edges } = instance.places;
    for (const p of Object.values(places)) {
      expect(segmentClear(p, p, PLAYER_RADIUS, instance.colliders, NO_BOUNDS), `${p.id} livre`).toBe(true);
    }
    for (const [a, list] of Object.entries(edges)) {
      for (const b of list) expect(segmentClear(places[a], places[b], PLAYER_RADIUS, instance.colliders, NO_BOUNDS), `${a}–${b}`).toBe(true);
    }
  });

  it("o tapete é uma zona de superfície real e o lugar da mesa pisa nele; a entrada pisa no granilite", async () => {
    const { instance } = await load();
    const { mesa, entrada } = instance.places.places;
    expect(surfaceAt(mesa, instance.surfaces, "granilite")).toBe("tapete");
    expect(surfaceAt(entrada, instance.surfaces, "granilite")).toBe("granilite");
  });
});

describe("sala cinza · posse (Ruling 7)", () => {
  it("load não toca ctx.scene; enter anexa o grupo raiz e dispose solta", async () => {
    const { ctx, instance } = await load();
    expect(ctx.scene.children).toHaveLength(0);
    instance.enter(ctx.save.get());
    expect(ctx.scene.children).toHaveLength(1);
    instance.dispose();
    expect(ctx.scene.children).toHaveLength(0);
  });

  it("toda geometria e toda luz criadas passam pelo coletor own", async () => {
    const { ctx, instance, owned } = await load();
    instance.enter(ctx.save.get());
    const root = ctx.scene.children[0];
    let meshes = 0;
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        meshes += 1;
        expect(owned.has(o.geometry), `geometria de ${o.name || o.parent?.name || "?"}`).toBe(true);
      }
      if (o instanceof THREE.Light && !(o instanceof THREE.AmbientLight)) expect(owned.has(o), `luz ${o.name}`).toBe(true);
    });
    expect(meshes).toBeGreaterThan(40);
  });

  it("a luz principal segue a receita de sombra (Ruling 9) com o normalBias recalculado", async () => {
    const { ctx, instance } = await load();
    instance.enter(ctx.save.get());
    const lights: THREE.SpotLight[] = [];
    ctx.scene.traverse((o) => {
      if (o instanceof THREE.SpotLight && o.castShadow) lights.push(o);
    });
    expect(lights).toHaveLength(1);
    const [lamp] = lights;
    expect(lamp.shadow.mapSize.x).toBe(1024);
    expect(lamp.shadow.camera.near).toBe(0.5);
    expect(lamp.shadow.bias).toBe(-0.0005);
    expect(lamp.shadow.normalBias).toBeGreaterThan(0.003);
    expect(lamp.shadow.normalBias).toBeLessThan(0.008);
  });

  it("abortar no meio da carga rejeita sem deixar nada na cena", async () => {
    const ctx = fakeCtx();
    const { own } = collector();
    const controller = new AbortController();
    const pending = cinzaLayer.load(ctx, controller.signal, own);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(ctx.scene.children).toHaveLength(0);
  });
});
