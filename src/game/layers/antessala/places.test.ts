import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { silentAudio } from "../../audio/types";
import type { MaterialKit } from "../../render/materials";
import { initialSave } from "../../save/schema";
import type { SaveApi } from "../../save/store";
import { segmentClear, type Box2 } from "../../world/collision";
import { pathBetween } from "../../world/places";
import { placesWithinReach, REACH_FLOOR } from "../../world/reach";
import { surfaceAt } from "../../world/surfaces";
import type { GameCtx, Own } from "../types";
import { antessalaLayer } from "./index";
import {
  ANTESSALA_GRAPH,
  ANTESSALA_PLACES,
  COUNTER,
  COUNTER_RETURN,
  FURNITURE_COLLIDERS,
  LOOSE_BOARD,
  OBJECT_ANCHORS,
  PLACE_CLEARANCE,
  PLAYER_RADIUS,
  RUG,
  SIDE_TABLE,
  SOFA,
  SURFACES,
  WALL_COLLIDERS,
  windowLightAt,
} from "./places";

const NO_BOUNDS: Box2 = { minX: -Infinity, maxX: Infinity, minZ: -Infinity, maxZ: Infinity };
const COLLIDERS = [...WALL_COLLIDERS, ...FURNITURE_COLLIDERS];

/** Distância entre duas caixas no chão (0 se encostam ou se cruzam). */
const gap = (a: { x0: number; x1: number; z0: number; z1: number }, b: { x0: number; x1: number; z0: number; z1: number }) =>
  Math.hypot(Math.max(0, a.x0 - b.x1, b.x0 - a.x1), Math.max(0, a.z0 - b.z1, b.z0 - a.z1));

/** Distância de um ponto a uma caixa (0 dentro). */
const toBox = (p: { x: number; z: number }, b: Box2) => Math.hypot(Math.max(b.minX - p.x, 0, p.x - b.maxX), Math.max(b.minZ - p.z, 0, p.z - b.maxZ));

const PLAN_PLACES = ["entrada", "balcao", "atras-balcao", "relogio", "quadro", "janela", "sofa", "cabideiro", "vitrine", "porta-norte", "porta-porao"];

describe("antessala · planta e lugares", () => {
  it("tem os lugares do plano (mais o meio da sala e o fundo escondido, que a planta pede)", () => {
    const ids = Object.keys(ANTESSALA_PLACES);
    for (const id of PLAN_PLACES) expect(ids, id).toContain(id);
    expect(ANTESSALA_PLACES.fundo.hidden).toBe(true);
    for (const [id, p] of Object.entries(ANTESSALA_PLACES)) expect(p.id).toBe(id);
  });

  it("arestas simétricas e só entre lugares que existem", () => {
    const { places, edges } = ANTESSALA_GRAPH;
    for (const [a, list] of Object.entries(edges)) {
      expect(places[a], a).toBeDefined();
      for (const b of list) {
        expect(places[b], `${a} → ${b}`).toBeDefined();
        expect(edges[b] ?? [], `${b} → ${a}`).toContain(a);
      }
    }
  });

  it("grafo conexo com a porta norte fechada: nenhum lugar depende dela", () => {
    const closed = initialSave(0);
    const open = (id: string) => !ANTESSALA_PLACES[id]?.locked?.(closed);
    const ids = Object.keys(ANTESSALA_PLACES);
    for (const a of ids) for (const b of ids) expect(pathBetween(ANTESSALA_GRAPH, a, b, open), `${a} → ${b}`).not.toBeNull();
  });

  it("todo lugar fica a ≥ 0,25 m das caixas de colisão (raio 0,22 + folga)", () => {
    for (const p of Object.values(ANTESSALA_PLACES)) {
      const nearest = Math.min(...COLLIDERS.map((b) => toBox(p, b)));
      expect(nearest, `${p.id} a ${nearest.toFixed(3)} m`).toBeGreaterThanOrEqual(PLACE_CLEARANCE);
      expect(PLACE_CLEARANCE).toBeGreaterThan(PLAYER_RADIUS);
    }
  });

  it("toda aresta é andável com o raio do jogador (sem atravessar móvel nem parede)", () => {
    const { places, edges } = ANTESSALA_GRAPH;
    for (const [a, list] of Object.entries(edges)) {
      for (const b of list) expect(segmentClear(places[a], places[b], PLAYER_RADIUS, COLLIDERS, NO_BOUNDS), `${a}–${b}`).toBe(true);
    }
  });

  it("o canto atrás do balcão só se alcança contornando-o pelo norte", () => {
    expect(ANTESSALA_GRAPH.edges["atras-balcao"]).toEqual(["fundo"]);
    const path = pathBetween(ANTESSALA_GRAPH, "entrada", "atras-balcao", () => true);
    expect(path).toContain("fundo");
  });

  it("aperto: o sofá fica a ≥ 1,3 m livres do balcão, e a passagem mais estreita do estar também", () => {
    for (const c of [COUNTER, COUNTER_RETURN]) {
      expect(gap(SOFA, c)).toBeGreaterThanOrEqual(1.3);
      expect(gap(SIDE_TABLE, c), "mesinha ↔ balcão").toBeGreaterThanOrEqual(1.3);
    }
    // e não é um salão: a passagem entre o estar e o balcão fica perto do 1,3 m da bíblia
    expect(Math.min(gap(SIDE_TABLE, COUNTER), gap(SIDE_TABLE, COUNTER_RETURN))).toBeLessThan(1.45);
  });

  it("superfícies: tapete, tábua solta debaixo do tapete e granilite no resto", () => {
    const under = { x: (LOOSE_BOARD.x0 + LOOSE_BOARD.x1) / 2, z: (LOOSE_BOARD.z0 + LOOSE_BOARD.z1) / 2 };
    expect(surfaceAt(under, SURFACES, "granilite")).toBe("tabua-solta");
    // a tábua fica inteira debaixo do tapete (o som não escapa para o granilite)
    expect(LOOSE_BOARD.x0).toBeGreaterThan(RUG.x0);
    expect(LOOSE_BOARD.x1).toBeLessThan(RUG.x1);
    expect(LOOSE_BOARD.z0).toBeGreaterThan(RUG.z0);
    expect(LOOSE_BOARD.z1).toBeLessThan(RUG.z1);
    expect(surfaceAt({ x: RUG.x0 + 0.1, z: RUG.z0 + 0.1 }, SURFACES, "granilite")).toBe("tapete");
    expect(surfaceAt(ANTESSALA_PLACES.entrada, SURFACES, "granilite")).toBe("granilite");
    expect(surfaceAt(ANTESSALA_PLACES.balcao, SURFACES, "granilite")).toBe("granilite");
    // o caminho entrada → sofá pisa na tábua (o rangido sempre no mesmo lugar)
    const a = ANTESSALA_PLACES.entrada;
    const b = ANTESSALA_PLACES.sofa;
    let creaks = 0;
    for (let i = 0; i <= 40; i++) if (surfaceAt({ x: a.x + ((b.x - a.x) * i) / 40, z: a.z + ((b.z - a.z) * i) / 40 }, SURFACES, "granilite") === "tabua-solta") creaks++;
    expect(creaks).toBeGreaterThan(0);
  });

  it("a âncora de cada objeto fica a ≤ 1,45 m do seu lugar", () => {
    expect(OBJECT_ANCHORS.length).toBeGreaterThanOrEqual(18);
    const reach = placesWithinReach(
      ANTESSALA_GRAPH,
      OBJECT_ANCHORS.map((o) => ({ id: o.id, place: o.place, point: o.anchor })),
    );
    for (const r of reach) expect(r.distance, `${r.id} a ${r.distance.toFixed(2)} m`).toBeLessThanOrEqual(REACH_FLOOR);
  });

  it("luz da janela pela hora local: dia, entardecer e noite", () => {
    expect(windowLightAt(6)).toBe("dia");
    expect(windowLightAt(12)).toBe("dia");
    expect(windowLightAt(16.99)).toBe("dia");
    expect(windowLightAt(17)).toBe("entardecer");
    expect(windowLightAt(18.5)).toBe("entardecer");
    expect(windowLightAt(19)).toBe("noite");
    expect(windowLightAt(0)).toBe("noite");
    expect(windowLightAt(4.73)).toBe("noite");
    expect(windowLightAt(-1)).toBe("noite");
    expect(windowLightAt(30)).toBe("dia");
  });
});

/* ------------------------------------------------------------------ a camada carregada (three em Node, kit falso) */

function fakeKit(): MaterialKit {
  return {
    phong: (o) => new THREE.MeshPhongMaterial(o),
    basic: (o) => new THREE.MeshBasicMaterial(o),
    baked: (m: THREE.Material) => m,
    texture: () => new THREE.CanvasTexture(undefined as unknown as HTMLCanvasElement),
    dispose: () => {},
  };
}

function fakeCtx(): GameCtx {
  let state = initialSave(0);
  const save: SaveApi = { get: () => state, patch: (p) => (state = { ...state, ...p }), reset: () => {}, wipeGame: () => {} };
  return { three: THREE, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), kit: fakeKit(), audio: silentAudio, say() {}, save };
}

function collector() {
  const owned = new Set<unknown>();
  const own = (<T extends { dispose(): void }>(r: T): T => {
    owned.add(r);
    return r;
  }) as Own;
  own.add = () => {};
  return { own, owned };
}

async function load() {
  const ctx = fakeCtx();
  const { own, owned } = collector();
  const instance = await antessalaLayer.load(ctx, new AbortController().signal, own);
  return { ctx, instance, owned };
}

describe("antessala · a camada", () => {
  it("expõe a planta: lugares, colisão e superfícies", async () => {
    const { instance } = await load();
    expect(instance.places).toBe(ANTESSALA_GRAPH);
    expect(instance.colliders).toEqual(COLLIDERS);
    expect(instance.surfaces).toEqual(SURFACES);
  });

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
    let meshes = 0;
    ctx.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        meshes += 1;
        expect(owned.has(o.geometry), `geometria de ${o.name || o.parent?.name || "?"}`).toBe(true);
      }
      if (o instanceof THREE.Light && !(o instanceof THREE.AmbientLight)) expect(owned.has(o), `luz ${o.name}`).toBe(true);
    });
    expect(meshes).toBeGreaterThan(10);
  });

  it("a lâmpada âmbar é a única luz com sombra e segue a receita (mapa 1024, near 0,5, bias −0,0005)", async () => {
    const { ctx, instance } = await load();
    instance.enter(ctx.save.get());
    const lights: THREE.SpotLight[] = [];
    ctx.scene.traverse((o) => {
      if (o instanceof THREE.Light && o.castShadow) lights.push(o as THREE.SpotLight);
    });
    expect(lights).toHaveLength(1);
    const [lamp] = lights;
    expect(lamp.userData.mainLight).toBe(true);
    expect(lamp.shadow.mapSize.x).toBe(1024);
    expect(lamp.shadow.camera.near).toBe(0.5);
    expect(lamp.shadow.bias).toBe(-0.0005);
    expect(lamp.shadow.normalBias).toBeGreaterThan(0.003);
    expect(lamp.shadow.normalBias).toBeLessThan(0.008);
  });

  it("no jogo normal não há caixa de placeholder na cena", async () => {
    const { ctx, instance } = await load();
    instance.enter(ctx.save.get());
    let placeholders = 0;
    ctx.scene.traverse((o) => {
      if (o.userData.placeholder) placeholders += 1;
    });
    expect(placeholders).toBe(0);
  });

  it("abortar no meio da carga rejeita sem deixar nada na cena", async () => {
    const ctx = fakeCtx();
    const { own } = collector();
    const controller = new AbortController();
    const pending = antessalaLayer.load(ctx, controller.signal, own);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(ctx.scene.children).toHaveLength(0);
  });
});
