import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { createGlow } from "../../interaction/glow";
import { holdFor } from "../../interaction/hold";
import { cinzaWorld } from "../../interaction/testWorld";
import type { ActApi, Doc } from "../types";
import { moveWithCollision, segmentClear } from "../../world/collision";
import { pathBetween } from "../../world/places";
import { DOOR_HINGE } from "./models";
import { DOOR_FLAG, PLAYER_RADIUS } from "./places";
import { CINZA_LINES, KEY_ITEM, readCinza } from "./puzzle";

// Interação dos objetos da sala cinza (T9): o que cada um faz ao ser acionado e se o brilho da mira pode acender
// cada um sem acender o vizinho.

function api(save: ActApi["save"]): ActApi & { said: string[]; sfx: ReturnType<typeof vi.fn>; examine: ReturnType<typeof vi.fn>; read: ReturnType<typeof vi.fn> } {
  const said: string[] = [];
  return { save, said, say: (l: { text: string }) => said.push(l.text), sfx: vi.fn(), examine: vi.fn(), read: vi.fn() } as never;
}

describe("sala cinza · objetos interativos", () => {
  it("o caderno abre o exame do próprio modelo, com título e texto", async () => {
    const { layer, save } = await cinzaWorld();
    const o = layer.objects.find((x) => x.id === "caderno");
    expect(o).toBeDefined();
    const a = api(save);
    o?.act(a);
    expect(a.examine).toHaveBeenCalledTimes(1);
    expect(a.read).not.toHaveBeenCalled();
    const arg = a.examine.mock.calls[0][0] as Parameters<ActApi["examine"]>[0];
    expect(o?.roots).toContain(arg.root);
    expect(arg.distance).toBeGreaterThan(0.2);
    expect(arg.distance).toBeLessThan(0.6);
    expect(arg.title.length).toBeGreaterThan(2);
    expect(arg.text.length).toBeGreaterThan(5);
  });

  it("o bilhete é LIDO (leitor em dois níveis), não examinado: título, texto limpo e papel de caderno", async () => {
    const { layer, save } = await cinzaWorld();
    const o = layer.objects.find((x) => x.id === "bilhete");
    expect(o?.verb(save.get())).toBe("ler o bilhete");
    const a = api(save);
    o?.act(a);
    expect(a.read).toHaveBeenCalledTimes(1);
    expect(a.examine).not.toHaveBeenCalled();
    const doc = a.read.mock.calls[0][0] as Doc;
    expect(doc.id).toBe("bilhete");
    expect(doc.title).toBe("bilhete");
    // a escada de pistas da T12 cita o armário: o bilhete precisa falar dele
    expect(doc.text).toMatch(/armário/);
    expect(doc.text.split("\n").length).toBeGreaterThan(3);
    expect(doc.look?.signature).toBeTruthy();
  });

  it("mesa e armário falam; a porta sem a chave não é de segurar: E bate e diz que está trancada", async () => {
    const { layer, save } = await cinzaWorld();
    for (const id of ["mesa", "armario"]) {
      const a = api(save);
      layer.objects.find((x) => x.id === id)?.act(a);
      expect(a.said, id).toHaveLength(1);
      expect(a.examine).not.toHaveBeenCalled();
    }
    // sem saber da chave, o armário não a entrega (e diz que a chavinha da fechadura é só dele)
    expect(save.get().items).toEqual([]);
    const door = layer.objects.find((x) => x.id === "porta");
    expect(door && holdFor(door, save.get())).toBeUndefined();
    expect(door?.verb(save.get())).toBe("abrir a porta");
    const a = api(save);
    door?.act(a);
    expect(a.sfx).toHaveBeenCalledWith("knock");
    expect(a.said).toEqual(["trancada."]);
    expect(save.get().flags[DOOR_FLAG]).not.toBe(true);
  });

  it("caminho completo pelos objetos: bilhete → chave no armário (inventário) → porta abre (flag, folha gira, colisão)", async () => {
    const { layer, save, scene } = await cinzaWorld();
    const obj = (id: string) => layer.objects.find((x) => x.id === id)!;
    const hinge = scene.getObjectByName(DOOR_HINGE)!;
    const colliders = layer.colliders.length;
    obj("bilhete").act(api(save));
    expect(readCinza(save.get()).noteRead).toBe(true);
    expect(obj("armario").verb(save.get())).toBe("pegar a chave na prateleira");
    const k = api(save);
    obj("armario").act(k);
    expect(k.said).toEqual([CINZA_LINES.keyFound]);
    expect(save.get().items).toEqual([KEY_ITEM]);
    expect(obj("porta").verb(save.get())).toBe("usar a chave na porta");
    expect(holdFor(obj("porta"), save.get())).toBeUndefined();
    const d = api(save);
    obj("porta").act(d);
    expect(d.said).toEqual([CINZA_LINES.doorUnlocked]);
    expect(save.get().flags[DOOR_FLAG]).toBe(true);
    expect(save.get().items).toEqual([]);
    expect(layer.puzzle?.solved(save.get())).toBe(true);
    // abre para fora: nenhuma colisão nova (a folha não entra na sala)
    expect(layer.colliders.length).toBe(colliders);
    for (let i = 0; i < 50; i++) layer.update(0.05, i * 0.05);
    expect(hinge.rotation.y).toBeCloseTo(1.45, 3);
    expect(scene.getObjectByName("porta-alem")?.visible).toBe(true);
  });

  it("depois da 3ª pista (sem a chave) a porta é de segurar; completar força (forced) e abre torta", async () => {
    const { layer, save } = await cinzaWorld({ puzzles: { cinza: { hints: 3 } } });
    const door = layer.objects.find((x) => x.id === "porta")!;
    expect(holdFor(door, save.get())).toEqual({ seconds: 1.4, verb: "forçar a porta" });
    const a = api(save);
    door.act(a);
    expect(readCinza(save.get())).toMatchObject({ doorOpen: true, forced: true });
    expect(a.said).toEqual([CINZA_LINES.doorForced]);
  });

  it("entrar com a porta aberta no save: já aberta (sem animar), com a colisão da folha", async () => {
    const { layer, scene } = await cinzaWorld({ puzzles: { cinza: { doorOpen: true, keyTaken: true, noteRead: true } } });
    expect(scene.getObjectByName(DOOR_HINGE)?.rotation.y).toBeCloseTo(1.45, 5);
    expect(layer.colliders.length).toBeGreaterThan(0);
    // um save antigo só com a flag da porta também abre (e o puzzle lê aberta)
    const flagOnly = await cinzaWorld({ flags: { [DOOR_FLAG]: true } });
    expect(flagOnly.scene.getObjectByName(DOOR_HINGE)?.rotation.y).toBeCloseTo(1.45, 5);
    expect(readCinza(flagOnly.save.get()).doorOpen).toBe(true);
  });

  for (const [name, cinza] of [
    ["normal", { doorOpen: true, keyTaken: true, noteRead: true }],
    ["forçada", { doorOpen: true, forced: true, hints: 3 }],
  ] as const) {
    it(`porta aberta (${name}): a folha fica toda do outro lado da parede (nunca na sala, nunca na mão); lugares e arestas livres com as colisões vivas`, async () => {
      const { layer, scene } = await cinzaWorld({ puzzles: { cinza } });
      scene.updateMatrixWorld(true);
      const leaf = new THREE.Box3().setFromObject(scene.getObjectByName("porta-folha")!);
      expect(leaf.max.z, "a folha não passa da parede norte").toBeLessThan(-2);
      // fechada, a folha fica no vão (as fotos de referência não mudam): mesma caixa de antes
      const closed = await cinzaWorld();
      closed.scene.updateMatrixWorld(true);
      const shut = new THREE.Box3().setFromObject(closed.scene.getObjectByName("porta-folha")!);
      expect(shut.min.x).toBeCloseTo(0.405, 2);
      expect(shut.max.z).toBeLessThan(-1.99);
      const NO_BOUNDS = { minX: -Infinity, maxX: Infinity, minZ: -Infinity, maxZ: Infinity };
      const { places, edges } = layer.places;
      for (const p of Object.values(places)) expect(segmentClear(p, p, PLAYER_RADIUS, layer.colliders, NO_BOUNDS), `${p.id} livre`).toBe(true);
      for (const [a, list] of Object.entries(edges)) for (const b of list) expect(segmentClear(places[a], places[b], PLAYER_RADIUS, layer.colliders, NO_BOUNDS), `${a}–${b}`).toBe(true);
      const ids = Object.keys(places);
      for (const a of ids) for (const b of ids) expect(pathBetween(layer.places, a, b, () => true), `${a} → ${b}`).not.toBeNull();
      // e ninguém atravessa o vão: a parede norte segue fechando a passagem (a 1B abre o corredor)
      const from = { x: 0.79, z: -1.1 };
      expect(moveWithCollision(from, { x: 0, z: -1.5 }, PLAYER_RADIUS, layer.colliders, NO_BOUNDS).z).toBeGreaterThan(-2 + PLAYER_RADIUS - 0.01);
    });
  }

  it("a escada grava cada pista no save (puzzles.cinza.hints) pela própria camada", async () => {
    const { layer, save } = await cinzaWorld();
    expect(layer.puzzle?.hints).toHaveLength(3);
    layer.puzzle?.hint();
    layer.puzzle?.hint();
    expect(layer.puzzle?.given(save.get())).toBe(2);
    expect(readCinza(save.get()).hints).toBe(2);
  });

  it("todo objeto tem verbo, lugar de parada e ao menos um material que pode brilhar", async () => {
    const { layer, save } = await cinzaWorld();
    const glow = createGlow(layer.objects, () => false);
    for (const o of layer.objects) {
      expect(o.verb(save.get()).length, o.id).toBeGreaterThan(3);
      expect(layer.places.places[o.place], o.id).toBeDefined();
      expect(glow.materialCount(o.id), `${o.id} acende algum material`).toBeGreaterThan(0);
    }
  });

  it("nenhum material é dividido entre dois objetos: o brilho de um nunca acende o outro", async () => {
    const { layer } = await cinzaWorld();
    const owner = new Map<THREE.Material, string>();
    for (const o of layer.objects) {
      for (const root of o.roots) {
        root.traverse((n) => {
          const mesh = n as THREE.Mesh;
          if (!mesh.isMesh) return;
          for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
            const prev = owner.get(m);
            expect(prev === undefined || prev === o.id, `material de ${o.id} também em ${prev}`).toBe(true);
            owner.set(m, o.id);
          }
        });
      }
    }
  });

  it("acender um objeto não mexe no emissivo de nenhum outro (inclusive os que não são interativos)", async () => {
    const { layer, scene } = await cinzaWorld();
    const glow = createGlow(layer.objects, () => false);
    const snapshot = () => {
      const out = new Map<THREE.Material, string>();
      scene.traverse((n) => {
        const mesh = n as THREE.Mesh;
        if (!mesh.isMesh) return;
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          const e = (m as THREE.MeshPhongMaterial).emissive;
          if (e) out.set(m, e.getHexString());
        }
      });
      return out;
    };
    const before = snapshot();
    for (const o of layer.objects) {
      glow.set(o.id);
      glow.update(0.4);
      const during = snapshot();
      const mine = new Set<THREE.Material>();
      for (const root of o.roots) root.traverse((n) => {
        const mesh = n as THREE.Mesh;
        if (mesh.isMesh) for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) mine.add(m);
      });
      for (const [m, hex] of during) if (!mine.has(m)) expect(hex, `${o.id} acendeu material alheio`).toBe(before.get(m));
    }
    glow.set(null);
    expect(snapshot()).toEqual(before);
  });
});
