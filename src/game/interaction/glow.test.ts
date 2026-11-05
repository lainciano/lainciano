import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { InteractiveObject } from "../layers/types";
import { createGlow, GLOW } from "./glow";

function obj(id: string, mats: THREE.Material[]): InteractiveObject {
  const root = new THREE.Group();
  for (const m of mats) root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), m));
  return { id, place: "x", roots: [root], material: "madeira", verb: () => id, enabled: () => true, act: () => {} };
}
const phong = (emissive = 0x000000) => new THREE.MeshPhongMaterial({ emissive });

describe("brilho do objeto mirado", () => {
  it("acende só os materiais do alvo e devolve o emissivo de base ao soltar", () => {
    const a = phong();
    const b = phong();
    const glow = createGlow([obj("a", [a]), obj("b", [b])], () => false);
    glow.set("a");
    glow.update(0);
    expect(a.emissive.r).toBeGreaterThan(0);
    expect(b.emissive.r).toBe(0);
    glow.set(null);
    expect(a.emissive.getHex()).toBe(0);
  });

  it("pulsa entre o mínimo e o máximo (ritmo do protótipo 7)", () => {
    const a = phong();
    const glow = createGlow([obj("a", [a])], () => false);
    glow.set("a");
    const seen: number[] = [];
    for (let t = 0; t < 2; t += 0.01) {
      glow.update(t);
      seen.push(a.emissive.r);
    }
    expect(Math.min(...seen)).toBeCloseTo(GLOW.base[0], 3);
    expect(Math.max(...seen)).toBeCloseTo(GLOW.base[0] + GLOW.pulse[0], 2);
    expect(Math.max(...seen) - Math.min(...seen)).toBeGreaterThan(GLOW.pulse[0] * 0.9);
  });

  it("movimento reduzido: realce fixo, sem pulso", () => {
    const a = phong();
    const glow = createGlow([obj("a", [a])], () => true);
    glow.set("a");
    glow.update(0);
    const first = a.emissive.r;
    for (let t = 0; t < 3; t += 0.1) {
      glow.update(t);
      expect(a.emissive.r).toBeCloseTo(first, 10);
    }
    expect(first).toBeGreaterThan(0);
  });

  it("level informa a intensidade: pulsa, fica em 0,5 com movimento reduzido e zera ao apagar", () => {
    const calm = createGlow([obj("a", [phong()])], () => true);
    calm.set("a");
    calm.update(0.3);
    expect(calm.level).toBe(0.5);
    const live = createGlow([obj("a", [phong()])], () => false);
    live.set("a");
    const seen = new Set<number>();
    for (let t = 0; t < 1.5; t += 0.07) {
      live.update(t);
      seen.add(Math.round(live.level * 1000));
    }
    expect(seen.size).toBeGreaterThan(5);
    live.set(null);
    expect(live.level).toBe(0);
  });

  it("soma ao emissivo que o material já tinha e restaura exatamente esse valor", () => {
    const a = phong(0x201008);
    const base = a.emissive.clone();
    const glow = createGlow([obj("a", [a])], () => false);
    glow.set("a");
    glow.update(0.3);
    expect(a.emissive.r).toBeGreaterThan(base.r);
    glow.set(null);
    expect(a.emissive.equals(base)).toBe(true);
  });

  it("trocar de alvo apaga o anterior", () => {
    const a = phong();
    const b = phong();
    const glow = createGlow([obj("a", [a]), obj("b", [b])], () => false);
    glow.set("a");
    glow.update(0);
    glow.set("b");
    glow.update(0);
    expect(a.emissive.getHex()).toBe(0);
    expect(b.emissive.r).toBeGreaterThan(0);
  });

  it("material compartilhado entre dois objetos não brilha (acenderia o vizinho)", () => {
    const shared = phong();
    const own = phong();
    const glow = createGlow([obj("a", [shared, own]), obj("b", [shared])], () => false);
    glow.set("a");
    glow.update(0);
    expect(shared.emissive.getHex()).toBe(0);
    expect(own.emissive.r).toBeGreaterThan(0);
  });

  it("material sem emissivo (basic) passa sem erro; id desconhecido não acende nada", () => {
    const basic = new THREE.MeshBasicMaterial();
    const glow = createGlow([obj("a", [basic])], () => false);
    expect(() => {
      glow.set("a");
      glow.update(0);
      glow.set("nenhum");
      glow.update(0);
    }).not.toThrow();
  });

  it("material em lista (caixa chanfrada com 7 grupos) e o mesmo material repetido na lista", () => {
    const a = phong();
    const b = phong();
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [a, b, a, b, a, b, a]));
    const o: InteractiveObject = { id: "a", place: "x", roots: [root], material: "madeira", verb: () => "a", enabled: () => true, act: () => {} };
    const glow = createGlow([o], () => false);
    glow.set("a");
    glow.update(0);
    const once = a.emissive.r;
    glow.update(0);
    expect(a.emissive.r).toBeCloseTo(once, 10);
    glow.set(null);
    expect(a.emissive.getHex()).toBe(0);
    expect(b.emissive.getHex()).toBe(0);
  });

  it("dispose devolve o emissivo e não cria nem descarta material", () => {
    const a = phong();
    let disposed = 0;
    a.addEventListener("dispose", () => disposed++);
    const glow = createGlow([obj("a", [a])], () => false);
    glow.set("a");
    glow.update(0);
    glow.dispose();
    expect(a.emissive.getHex()).toBe(0);
    expect(disposed).toBe(0);
  });
});
