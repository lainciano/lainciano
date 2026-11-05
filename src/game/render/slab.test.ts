import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { mergeGeometries, ringSector, roundedOutline, roundedSlab, triangleCount } from "./slab";

/** Para cada triângulo: normal pela ordem dos vértices e o centroide. */
function faces(geo: THREE.BufferGeometry) {
  const pos = geo.getAttribute("position");
  const idx = geo.getIndex()!;
  const out: { n: THREE.Vector3; c: THREE.Vector3; area: number }[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < idx.count; i += 3) {
    a.fromBufferAttribute(pos, idx.getX(i));
    b.fromBufferAttribute(pos, idx.getX(i + 1));
    c.fromBufferAttribute(pos, idx.getX(i + 2));
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const area = n.length() / 2;
    out.push({ n: n.normalize(), c: new THREE.Vector3().add(a).add(b).add(c).multiplyScalar(1 / 3), area });
  }
  return out;
}

/** Arestas por posição (arredondada): numa malha fechada cada aresta aparece duas vezes. */
function openEdges(geo: THREE.BufferGeometry) {
  const pos = geo.getAttribute("position");
  const idx = geo.getIndex()!;
  const key = (i: number) => [pos.getX(i), pos.getY(i), pos.getZ(i)].map((v) => Math.round(v * 1e6)).join(",");
  const count = new Map<string, number>();
  for (let i = 0; i < idx.count; i += 3) {
    const t = [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)].map(key);
    for (let k = 0; k < 3; k++) {
      const e = [t[k], t[(k + 1) % 3]].sort().join("|");
      count.set(e, (count.get(e) ?? 0) + 1);
    }
  }
  return [...count.values()].filter((n) => n !== 2).length;
}

const uv = () => [0, 0] as [number, number];

describe("roundedOutline", () => {
  it("mesma contagem de pontos com qualquer raio (os anéis da tampa casam ponto a ponto), anti-horário", () => {
    const a = roundedOutline(0.02, 0.04, 0.008, 4, 2, 4);
    const b = roundedOutline(0.012, 0.032, 0, 4, 2, 4);
    expect(a.length).toBe(b.length);
    expect(a.length).toBe(4 * 5 + 2 * 2 + 2 * 4);
    let area = 0;
    for (let i = 0; i < a.length; i++) {
      const [x0, y0] = a[i];
      const [x1, y1] = a[(i + 1) % a.length];
      area += x0 * y1 - x1 * y0;
    }
    expect(area).toBeGreaterThan(0);
    // área de um retângulo arredondado: 4·hx·hy − (4 − π)·r²
    expect(area / 2).toBeCloseTo(4 * 0.02 * 0.04 - (4 - Math.PI) * 0.008 ** 2, 4);
  });
});

describe("roundedSlab", () => {
  const geo = roundedSlab(THREE, 0.047, 0.086, 0.0095, { radius: 0.008, bevel: 0.0016, edgeSeg: [3, 6], uv });

  it("fechada (cada aresta em dois triângulos) e com todas as faces viradas para fora (placa convexa)", () => {
    expect(openEdges(geo)).toBe(0);
    for (const f of faces(geo)) if (f.area > 1e-10) expect(f.n.dot(f.c)).toBeGreaterThan(0);
  });

  it("tampas em anéis: nenhum triângulo da frente com lado maior que 1/5 da altura (sem leque comprido)", () => {
    const pos = geo.getAttribute("position");
    const idx = geo.getIndex()!;
    let longest = 0;
    for (let i = 0; i < idx.count; i += 3) {
      const ids = [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)];
      if (!ids.every((k) => Math.abs(pos.getZ(k) - 0.0095 / 2) < 1e-9)) continue;
      for (let k = 0; k < 3; k++) {
        const p = new THREE.Vector3().fromBufferAttribute(pos, ids[k]);
        const q = new THREE.Vector3().fromBufferAttribute(pos, ids[(k + 1) % 3]);
        longest = Math.max(longest, p.distanceTo(q));
      }
    }
    expect(longest).toBeLessThan(0.086 / 5);
  });

  it("medidas: caixa igual a w × h × t; orçamento de triângulos de peça pequena", () => {
    geo.computeBoundingBox();
    const size = geo.boundingBox!.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(0.047, 6);
    expect(size.y).toBeCloseTo(0.086, 6);
    expect(size.z).toBeCloseTo(0.0095, 6);
    expect(triangleCount(geo)).toBeLessThan(1000);
  });

  it("sem tampa de trás (tecla): aberta só embaixo", () => {
    const key = roundedSlab(THREE, 0.011, 0.008, 0.0016, { radius: 0.003, bevel: 0.0005, back: false, cornerSeg: 2, edgeSeg: [1, 1], rings: 2, uv });
    expect(openEdges(key)).toBeGreaterThan(0);
    for (const f of faces(key)) if (f.area > 1e-12) expect(f.n.z).toBeGreaterThan(-1e-6);
  });

  it("a uv recebe a parte certa (frente, trás, lateral) e a fração do perímetro nas laterais", () => {
    const seen = new Set<string>();
    let maxPerim = 0;
    roundedSlab(THREE, 0.02, 0.03, 0.005, {
      radius: 0.004,
      bevel: 0.001,
      uv: (p, part, perimeter) => {
        seen.add(part);
        if (part === "front") expect(p[2]).toBeCloseTo(0.0025, 9);
        if (part === "back") expect(p[2]).toBeCloseTo(-0.0025, 9);
        maxPerim = Math.max(maxPerim, perimeter);
        return [0, 0];
      },
    });
    expect([...seen].sort()).toEqual(["back", "front", "side"]);
    expect(maxPerim).toBeGreaterThan(0.9);
    expect(maxPerim).toBeLessThan(1);
  });
});

describe("ringSector e mergeGeometries", () => {
  it("o setor fica entre os raios e os ângulos pedidos, tampo para cima", () => {
    const g = ringSector(THREE, 0.005, 0.01, -0.6, 0.6, 0.0014, { bevel: 0.0005, uv: () => [0, 0] });
    const pos = g.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getY(i));
      expect(r).toBeGreaterThan(0.005 - 1e-9);
      expect(r).toBeLessThan(0.01 + 1e-9);
      expect(Math.abs(Math.atan2(pos.getY(i), pos.getX(i)))).toBeLessThanOrEqual(0.6 + 1e-7);
    }
    const up = faces(g).filter((f) => f.area > 1e-12 && Math.abs(f.c.z - 0.0014) < 1e-9);
    expect(up.length).toBeGreaterThan(0);
    for (const f of up) expect(f.n.z).toBeCloseTo(1, 6);
  });

  it("junta com a matriz de cada parte (posição e normal) num buffer indexado", () => {
    const a = new THREE.BoxGeometry(1, 1, 1);
    const b = new THREE.BoxGeometry(1, 1, 1);
    const m = new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(5, 0, 0);
    const merged = mergeGeometries(THREE, [{ geo: a }, { geo: b, matrix: m }]);
    expect(merged.getAttribute("position").count).toBe(a.getAttribute("position").count * 2);
    expect(triangleCount(merged)).toBe(triangleCount(a) * 2);
    merged.computeBoundingBox();
    expect(merged.boundingBox!.max.x).toBeCloseTo(5.5, 6);
    const nor = merged.getAttribute("normal");
    for (let i = 0; i < nor.count; i++) expect(Math.hypot(nor.getX(i), nor.getY(i), nor.getZ(i))).toBeCloseTo(1, 6);
    a.dispose();
    b.dispose();
  });
});
