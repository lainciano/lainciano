import type * as THREE from "three";

/**
 * Geometria low-poly cuidadosa para as camadas (contratos 4b), sem asset externo:
 * - `chamferBox`: caixa com as 12 arestas chanfradas (faixa plana a 45°) e os 8 cantos fechados por um triângulo.
 *   Cada face é subdividida (~`seg` por metro) para a textura afim não "nadar"; as faixas usam a MESMA grade da
 *   face vizinha ao longo da aresta, então os vértices coincidem (sem fresta com o tremor). Normais planas por
 *   parte: o chanfro pega luz própria e lê como bisel. Grupos: 0..5 = faces (+x, −x, +y, −y, +z, −z, a ordem
 *   do `BoxGeometry`), 6 = chanfros e cantos (o lugar do desgaste de borda).
 * - `breakpoints` + `latticeSurface`: superfície plana sobre uma grade de linhas explícitas (com furos): piso,
 *   paredes e teto usam as mesmas linhas onde se encontram, então nenhuma aresta fica em "T".
 */

export type UvMode = { mode: "world"; tile: readonly [number, number]; offset?: readonly [number, number, number] } | { mode: "face" };

type V3 = [number, number, number];

/** Linhas de `min` a `max` a cada ~`step` (divisão uniforme), mais as `extra` que caírem dentro, sem repetidas. */
export function breakpoints(min: number, max: number, step: number, extra: readonly number[] = []): number[] {
  const n = Math.max(1, Math.round((max - min) / step));
  const out = Array.from({ length: n + 1 }, (_, i) => min + ((max - min) * i) / n);
  for (const e of extra) if (e > min && e < max) out.push(e);
  out.sort((a, b) => a - b);
  // Funde linhas quase iguais (uma extra a menos de 2 cm de uma da grade substitui a da grade).
  const merged: number[] = [];
  for (const v of out) {
    const last = merged[merged.length - 1];
    if (last !== undefined && v - last < 0.02) {
      if (extra.includes(v) && last !== min) merged[merged.length - 1] = v;
      continue;
    }
    merged.push(v);
  }
  merged[merged.length - 1] = max;
  return merged;
}

/** Divide [a, b] em ~`seg` partes por metro (no mínimo 1). */
function span(a: number, b: number, seg: number): number[] {
  const n = Math.max(1, Math.round((b - a) * seg));
  return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
}

class Builder {
  positions: number[] = [];
  normals: number[] = [];
  uvs: number[] = [];
  groups: number[][] = [];
  constructor(private uv: (p: V3, n: V3) => [number, number]) {}

  /** Polígono convexo plano (3 ou 4 vértices) virado para `n`: a ordem é corrigida pela normal. */
  poly(pts: V3[], n: V3, group: number) {
    const [a, b, c] = pts;
    const cross: V3 = [
      (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
      (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
      (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
    ];
    const ordered = cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2] < 0 ? [...pts].reverse() : pts;
    const first = this.positions.length / 3;
    for (const p of ordered) {
      this.positions.push(p[0], p[1], p[2]);
      this.normals.push(n[0], n[1], n[2]);
      const [u, v] = this.uv(p, n);
      this.uvs.push(u, v);
    }
    (this.groups[group] ??= []).push(first, first + 1, first + 2);
    if (ordered.length === 4) this.groups[group].push(first, first + 2, first + 3);
  }

  build(three: typeof THREE): THREE.BufferGeometry {
    const geo = new three.BufferGeometry();
    geo.setAttribute("position", new three.Float32BufferAttribute(this.positions, 3));
    geo.setAttribute("normal", new three.Float32BufferAttribute(this.normals, 3));
    geo.setAttribute("uv", new three.Float32BufferAttribute(this.uvs, 2));
    const index: number[] = [];
    this.groups.forEach((list, g) => {
      if (!list?.length) return;
      geo.addGroup(index.length, list.length, g);
      index.push(...list);
    });
    geo.setIndex(index);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    return geo;
  }
}

/** UV planar por face (a regra do `worldUv` da referência): topo/fundo em x/−z, laterais em ±z/y ou ±x/y. */
function planarUv(p: V3, n: V3): [number, number] {
  const [x, y, z] = p;
  if (Math.abs(n[1]) > 0.5) return [x, -z];
  if (Math.abs(n[0]) > 0.5) return [n[0] > 0 ? -z : z, y];
  return [n[2] > 0 ? x : -x, y];
}

export type ChamferBoxOptions = {
  /** Largura do chanfro (m); 0 = caixa reta (ainda subdividida). Limitado a 45% do menor lado. */
  chamfer?: number;
  /** Segmentos por metro nas faces (padrão 5, como a referência). */
  seg?: number;
  uv?: UvMode;
};

/** Caixa centrada na origem, com chanfro nas arestas (ver o topo do arquivo). */
export function chamferBox(three: typeof THREE, w: number, h: number, d: number, o: ChamferBoxOptions = {}): THREE.BufferGeometry {
  const half: V3 = [w / 2, h / 2, d / 2];
  const c = Math.max(0, Math.min(o.chamfer ?? 0, Math.min(w, h, d) * 0.45));
  const seg = o.seg ?? 5;
  const uvMode: UvMode = o.uv ?? { mode: "world", tile: [1, 1] };
  const uv = (p: V3, n: V3): [number, number] => {
    if (uvMode.mode === "world") {
      const off = uvMode.offset ?? [0, 0, 0];
      const [u, v] = planarUv([p[0] + off[0], p[1] + off[1], p[2] + off[2]], n);
      return [u / uvMode.tile[0], v / uvMode.tile[1]];
    }
    // Face inteira (com o chanfro) de 0 a 1, no mesmo sentido da regra planar.
    const [u, v] = planarUv(p, n);
    if (Math.abs(n[1]) > 0.5) return [(u + half[0]) / w, (v + half[2]) / d];
    if (Math.abs(n[0]) > 0.5) return [(u + half[2]) / d, (v + half[1]) / h];
    return [(u + half[0]) / w, (v + half[1]) / h];
  };
  const b = new Builder(uv);
  const inner = [0, 1, 2].map((k) => span(-half[k] + c, half[k] - c, seg));

  // Faces: grade sobre o interior dos outros dois eixos.
  for (let a = 0; a < 3; a++) {
    const [p, q] = [(a + 1) % 3, (a + 2) % 3];
    for (const s of [1, -1]) {
      const n: V3 = [0, 0, 0];
      n[a] = s;
      const group = a * 2 + (s > 0 ? 0 : 1);
      const ps = inner[p];
      const qs = inner[q];
      for (let i = 0; i < ps.length - 1; i++) {
        for (let j = 0; j < qs.length - 1; j++) {
          const at = (pp: number, qq: number): V3 => {
            const v: V3 = [0, 0, 0];
            v[a] = s * half[a];
            v[p] = pp;
            v[q] = qq;
            return v;
          };
          b.poly([at(ps[i], qs[j]), at(ps[i + 1], qs[j]), at(ps[i + 1], qs[j + 1]), at(ps[i], qs[j + 1])], n, group);
        }
      }
    }
  }
  if (c > 0) {
    // Faixas: para cada par de eixos (a, b) e sinais, ao longo do terceiro eixo, na grade interior dele.
    for (let a = 0; a < 3; a++) {
      for (let bb = a + 1; bb < 3; bb++) {
        const e = 3 - a - bb;
        for (const sa of [1, -1]) {
          for (const sb of [1, -1]) {
            const n: V3 = [0, 0, 0];
            n[a] = sa * Math.SQRT1_2;
            n[bb] = sb * Math.SQRT1_2;
            const es = inner[e];
            const at = (onA: boolean, t: number): V3 => {
              const v: V3 = [0, 0, 0];
              v[a] = sa * (onA ? half[a] : half[a] - c);
              v[bb] = sb * (onA ? half[bb] - c : half[bb]);
              v[e] = t;
              return v;
            };
            for (let i = 0; i < es.length - 1; i++) b.poly([at(true, es[i]), at(true, es[i + 1]), at(false, es[i + 1]), at(false, es[i])], n, 6);
          }
        }
      }
    }
    // Cantos.
    const k = 1 / Math.sqrt(3);
    for (const sx of [1, -1]) {
      for (const sy of [1, -1]) {
        for (const sz of [1, -1]) {
          const [hx, hy, hz] = half;
          b.poly(
            [
              [sx * hx, sy * (hy - c), sz * (hz - c)],
              [sx * (hx - c), sy * hy, sz * (hz - c)],
              [sx * (hx - c), sy * (hy - c), sz * hz],
            ],
            [sx * k, sy * k, sz * k],
            6,
          );
        }
      }
    }
  }
  return b.build(three);
}

export type LatticeOptions = {
  /** Linhas nos dois eixos do plano (em metros, coordenadas locais u/v). */
  us: readonly number[];
  vs: readonly number[];
  /** Furos (retângulos em u/v) que ficam sem célula: porta, janela. As bordas devem cair em linhas da grade. */
  holes?: readonly { u0: number; u1: number; v0: number; v1: number }[];
  /** (u, v) da grade → posição no espaço do objeto. */
  at(u: number, v: number): V3;
  normal: V3;
  /** UV de textura por vértice (padrão: o próprio u/v). */
  uv?(u: number, v: number): [number, number];
  /** Grupo de material por célula (padrão 0): variantes de ladrilho, por exemplo. */
  group?(u0: number, v0: number, u1: number, v1: number): number;
  /** UV própria por célula (ladrilho girado): recebe a célula e o canto. */
  cellUv?(u0: number, v0: number, u1: number, v1: number, u: number, v: number): [number, number];
};

/**
 * Superfície plana sobre uma grade de linhas explícitas. Os vértices de células vizinhas coincidem (mesmos
 * números), então o tremor do PSX move os dois lados iguais. Uma célula por quad, vértices não compartilhados
 * só quando a UV muda de célula para célula (`cellUv`); a posição é sempre a mesma.
 */
export function latticeSurface(three: typeof THREE, o: LatticeOptions): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const groups: number[][] = [];
  const inHole = (u0: number, u1: number, v0: number, v1: number) =>
    (o.holes ?? []).some((h) => u0 >= h.u0 - 1e-6 && u1 <= h.u1 + 1e-6 && v0 >= h.v0 - 1e-6 && v1 <= h.v1 + 1e-6);
  for (let i = 0; i < o.us.length - 1; i++) {
    for (let j = 0; j < o.vs.length - 1; j++) {
      const [u0, u1, v0, v1] = [o.us[i], o.us[i + 1], o.vs[j], o.vs[j + 1]];
      if (inHole(u0, u1, v0, v1)) continue;
      const corners: [number, number][] = [
        [u0, v0],
        [u1, v0],
        [u1, v1],
        [u0, v1],
      ];
      const pts = corners.map(([u, v]) => o.at(u, v));
      const [a, b, c] = pts;
      const cross = [
        (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
        (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
        (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
      ];
      const flip = cross[0] * o.normal[0] + cross[1] * o.normal[1] + cross[2] * o.normal[2] < 0;
      const order = flip ? [0, 3, 2, 1] : [0, 1, 2, 3];
      const first = positions.length / 3;
      for (const k of order) {
        const [u, v] = corners[k];
        const p = pts[k];
        positions.push(p[0], p[1], p[2]);
        normals.push(o.normal[0], o.normal[1], o.normal[2]);
        const t = o.cellUv ? o.cellUv(u0, v0, u1, v1, u, v) : o.uv ? o.uv(u, v) : [u, v];
        uvs.push(t[0], t[1]);
      }
      const g = o.group ? o.group(u0, v0, u1, v1) : 0;
      (groups[g] ??= []).push(first, first + 1, first + 2, first, first + 2, first + 3);
    }
  }
  const geo = new three.BufferGeometry();
  geo.setAttribute("position", new three.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new three.Float32BufferAttribute(normals, 3));
  geo.setAttribute("uv", new three.Float32BufferAttribute(uvs, 2));
  const index: number[] = [];
  groups.forEach((list, g) => {
    if (!list?.length) return;
    geo.addGroup(index.length, list.length, g);
    index.push(...list);
  });
  geo.setIndex(index);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}
