import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { createGlow } from "../../interaction/glow";
import { holdFor } from "../../interaction/hold";
import { cinzaWorld } from "../../interaction/testWorld";
import type { ActApi } from "../types";

// Interação dos objetos da sala cinza (T9): o que cada um faz ao ser acionado e se o brilho da mira pode acender
// cada um sem acender o vizinho.

function api(save: ActApi["save"]): ActApi & { said: string[]; sfx: ReturnType<typeof vi.fn>; examine: ReturnType<typeof vi.fn> } {
  const said: string[] = [];
  return { save, said, say: (l: { text: string }) => said.push(l.text), sfx: vi.fn(), examine: vi.fn() } as never;
}

describe("sala cinza · objetos interativos", () => {
  it("bilhete e caderno abrem o exame do próprio modelo, com título e texto", async () => {
    const { layer, save } = await cinzaWorld();
    for (const id of ["bilhete", "caderno"]) {
      const o = layer.objects.find((x) => x.id === id);
      expect(o, id).toBeDefined();
      const a = api(save);
      o?.act(a);
      expect(a.examine, id).toHaveBeenCalledTimes(1);
      const arg = a.examine.mock.calls[0][0] as Parameters<ActApi["examine"]>[0];
      expect(o?.roots).toContain(arg.root);
      expect(arg.distance).toBeGreaterThan(0.2);
      expect(arg.distance).toBeLessThan(0.6);
      expect(arg.title.length).toBeGreaterThan(2);
      expect(arg.text.length).toBeGreaterThan(5);
    }
  });

  it("mesa e armário falam; a porta é de segurar (forçar) e, concluído, bate e diz que está trancada", async () => {
    const { layer, save } = await cinzaWorld();
    for (const id of ["mesa", "armario"]) {
      const a = api(save);
      layer.objects.find((x) => x.id === id)?.act(a);
      expect(a.said, id).toHaveLength(1);
      expect(a.examine).not.toHaveBeenCalled();
    }
    const door = layer.objects.find((x) => x.id === "porta");
    expect(door && holdFor(door, save.get())).toEqual({ seconds: 1.4, verb: "forçar a porta" });
    const a = api(save);
    door?.act(a);
    expect(a.sfx).toHaveBeenCalledWith("knock");
    expect(a.said).toEqual(["trancada."]);
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
