import type * as THREE from "three";

/**
 * Peças de objeto pequeno e de perto (T11, celular): placa de cantos arredondados com bisel, setor de anel (o
 * direcional) e a fusão de geometrias num só buffer (uma chamada de desenho por material).
 *
 * - `roundedSlab`: contorno de retângulo arredondado, extrudado em z, com bisel de 45° na frente e atrás. As tampas
 *   são anéis concêntricos (o contorno recuado passo a passo até virar uma linha): nenhum triângulo comprido de
 *   leque, então a textura afim do PSX não "nada" quando o objeto passa perto da câmera. Normais lisas nas laterais
 *   e nos biséis (o canto arredondado lê redondo), planas nas tampas.
 * - `ringSector`: um arco do direcional (setor de anel) com tampo, bisel externo e paredes.
 * - `mergeGeometries`: junta geometrias com posição, normal e uv num buffer indexado (sem grupos).
 * Sem three em tempo de execução: recebe o módulo (`three`) como parâmetro, como `shapes.ts`.
 */

export type V3 = [number, number, number];
export type SlabPart = "front" | "back" | "side";
/** UV de um vértice: a posição, a parte e, nas laterais e biséis, a fração do perímetro (0..1). */
export type SlabUv = (p: V3, part: SlabPart, perimeter: number) => [number, number];

export type RoundedSlabOptions = {
  /** Raio dos cantos no plano (limitado ao menor meio-lado). */
  radius: number;
  /** Bisel de 45° nas bordas da frente e de trás (0 = aresta viva). */
  bevel?: number;
  /** Bisel só de trás (padrão: o mesmo da frente). */
  backBevel?: number;
  /** Pontos por canto (padrão 4). */
  cornerSeg?: number;
  /** Pontos intermediários nas retas: [ao longo de x, ao longo de y] (padrão [2, 4]). */
  edgeSeg?: readonly [number, number];
  /** Anéis da tampa da frente até o centro (padrão 4). */
  rings?: number;
  /** Fecha a tampa de trás (padrão true). Teclas não precisam dela. */
  back?: boolean;
  uv: SlabUv;
};

type Buf = { pos: number[]; nor: number[]; uv: number[]; idx: number[] };

const newBuf = (): Buf => ({ pos: [], nor: [], uv: [], idx: [] });

function vert(b: Buf, p: V3, n: V3, uv: [number, number]): number {
  const i = b.pos.length / 3;
  b.pos.push(p[0], p[1], p[2]);
  b.nor.push(n[0], n[1], n[2]);
  b.uv.push(uv[0], uv[1]);
  return i;
}

/** Quad (a, b, c, d) virado para `n`: a ordem é corrigida pela normal média. Triângulos degenerados ficam fora. */
function quad(b: Buf, ia: number, ib: number, ic: number, id: number, n: V3) {
  const P = b.pos;
  const at = (i: number): V3 => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
  const tri = (i: number, j: number, k: number) => {
    const [a, bb, c] = [at(i), at(j), at(k)];
    const cross: V3 = [
      (bb[1] - a[1]) * (c[2] - a[2]) - (bb[2] - a[2]) * (c[1] - a[1]),
      (bb[2] - a[2]) * (c[0] - a[0]) - (bb[0] - a[0]) * (c[2] - a[2]),
      (bb[0] - a[0]) * (c[1] - a[1]) - (bb[1] - a[1]) * (c[0] - a[0]),
    ];
    const len = Math.hypot(cross[0], cross[1], cross[2]);
    if (len < 1e-12) return;
    if (cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2] < 0) b.idx.push(i, k, j);
    else b.idx.push(i, j, k);
  };
  tri(ia, ib, ic);
  tri(ia, ic, id);
}

function toGeometry(three: typeof THREE, b: Buf): THREE.BufferGeometry {
  const geo = new three.BufferGeometry();
  geo.setAttribute("position", new three.Float32BufferAttribute(b.pos, 3));
  geo.setAttribute("normal", new three.Float32BufferAttribute(b.nor, 3));
  geo.setAttribute("uv", new three.Float32BufferAttribute(b.uv, 2));
  geo.setIndex(b.idx);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Contorno fechado, anti-horário, de um retângulo arredondado de meio-lados (hx, hy) e raio r. A contagem de pontos
 * não depende de r (r 0 junta os pontos do canto): todos os anéis da tampa têm o mesmo número de pontos.
 */
export function roundedOutline(hx: number, hy: number, r: number, cornerSeg: number, ex: number, ey: number): [number, number][] {
  const rr = Math.max(0, Math.min(r, hx, hy));
  const cx = hx - rr;
  const cy = hy - rr;
  const corners: [number, number, number][] = [
    [cx, cy, 0],
    [-cx, cy, Math.PI / 2],
    [-cx, -cy, Math.PI],
    [cx, -cy, (3 * Math.PI) / 2],
  ];
  const pts: [number, number][] = [];
  const start = (k: number): [number, number] => {
    const [x, y, a] = corners[k % 4];
    return [x + rr * Math.cos(a), y + rr * Math.sin(a)];
  };
  for (let k = 0; k < 4; k++) {
    const [x, y, a0] = corners[k];
    for (let j = 0; j <= cornerSeg; j++) {
      const a = a0 + (j * Math.PI) / 2 / cornerSeg;
      pts.push([x + rr * Math.cos(a), y + rr * Math.sin(a)]);
    }
    // depois do canto 0 (superior direito) vem a reta de cima (ao longo de x); depois do 1, a da esquerda (y)…
    const n = k % 2 === 0 ? ex : ey;
    const from = pts[pts.length - 1];
    const to = start(k + 1);
    for (let i = 1; i <= n; i++) pts.push([from[0] + ((to[0] - from[0]) * i) / (n + 1), from[1] + ((to[1] - from[1]) * i) / (n + 1)]);
  }
  return pts;
}

/** Normal para fora de cada ponto de um contorno anti-horário (média das duas arestas vizinhas). */
function outlineNormals(pts: [number, number][]): [number, number][] {
  const n = pts.length;
  return pts.map((_, i) => {
    let tx = 0;
    let ty = 0;
    for (let s = 1; s < n && Math.hypot(tx, ty) < 1e-9; s++) {
      const a = pts[(i - s + n) % n];
      const c = pts[(i + s) % n];
      tx = c[0] - a[0];
      ty = c[1] - a[1];
    }
    const len = Math.hypot(tx, ty) || 1;
    return [ty / len, -tx / len];
  });
}

/** Fração acumulada do perímetro em cada ponto (0 no primeiro). */
function perimeterFractions(pts: [number, number][]): number[] {
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = acc[acc.length - 1] + Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]);
  return acc.map((v) => v / (total || 1));
}

/** Placa centrada na origem: largura w (x), altura h (y), espessura t (z), frente em +z. Ver o topo do arquivo. */
export function roundedSlab(three: typeof THREE, w: number, h: number, t: number, o: RoundedSlabOptions): THREE.BufferGeometry {
  const b = newBuf();
  const cs = o.cornerSeg ?? 4;
  const [ex, ey] = o.edgeSeg ?? [2, 4];
  const rings = Math.max(1, o.rings ?? 4);
  const hx = w / 2;
  const hy = h / 2;
  const fb = Math.max(0, Math.min(o.bevel ?? 0, t * 0.45, hx * 0.45));
  const bb = Math.max(0, Math.min(o.backBevel ?? fb, t * 0.45, hx * 0.45));
  const hasBack = o.back !== false;
  const ring = (inset: number) => roundedOutline(hx - inset, hy - inset, o.radius - inset, cs, ex, ey);
  const outer = ring(0);
  const N = outer.length;
  const normals2 = outlineNormals(outer);
  const perim = perimeterFractions(outer);
  const zf = t / 2;
  const zb = -t / 2;

  /** Tampa (frente ou trás): anéis do recuo do bisel até a linha do meio. */
  const cap = (z: number, inset0: number, part: SlabPart) => {
    const n: V3 = [0, 0, part === "front" ? 1 : -1];
    const insets = Array.from({ length: rings + 1 }, (_, k) => inset0 + ((hx - inset0) * k) / rings);
    let prev: number[] | null = null;
    for (const d of insets) {
      const pts = ring(d);
      const ids = pts.map(([x, y]) => vert(b, [x, y, z], n, o.uv([x, y, z], part, 0)));
      if (prev) for (let i = 0; i < N; i++) quad(b, prev[i], prev[(i + 1) % N], ids[(i + 1) % N], ids[i], n);
      prev = ids;
    }
  };

  /** Faixa entre dois contornos (bisel ou lateral), com normais lisas por ponto. */
  const band = (a: [number, number][], za: number, c: [number, number][], zc: number, nz: number) => {
    const s = Math.sqrt(1 - nz * nz);
    const na = (i: number): V3 => [normals2[i][0] * s, normals2[i][1] * s, nz];
    const ia = a.map(([x, y], i) => vert(b, [x, y, za], na(i), o.uv([x, y, za], "side", perim[i])));
    const ic = c.map(([x, y], i) => vert(b, [x, y, zc], na(i), o.uv([x, y, zc], "side", perim[i])));
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      const avg: V3 = [(normals2[i][0] + normals2[j][0]) * 0.5 * s, (normals2[i][1] + normals2[j][1]) * 0.5 * s, nz];
      quad(b, ia[i], ia[j], ic[j], ic[i], avg);
    }
  };

  cap(zf, fb, "front");
  if (fb > 0) band(ring(fb), zf, outer, zf - fb, Math.SQRT1_2);
  band(outer, zf - fb, outer, zb + (hasBack ? bb : 0), 0);
  if (hasBack) {
    if (bb > 0) band(outer, zb + bb, ring(bb), zb, -Math.SQRT1_2);
    cap(zb, bb, "back");
  }
  return toGeometry(three, b);
}

export type RingSectorOptions = {
  /** Segmentos ao longo do arco (padrão 6). */
  seg?: number;
  /** Bisel no tampo, na borda de fora (padrão 0). */
  bevel?: number;
  uv: (p: V3, top: boolean) => [number, number];
};

/** Setor de anel no plano xy (raios r0 < r1, ângulos a0 < a1, anti-horário), da base z = 0 ao tampo z = t. */
export function ringSector(three: typeof THREE, r0: number, r1: number, a0: number, a1: number, t: number, o: RingSectorOptions): THREE.BufferGeometry {
  const b = newBuf();
  const seg = Math.max(2, o.seg ?? 6);
  const bev = Math.max(0, Math.min(o.bevel ?? 0, (r1 - r0) * 0.4, t * 0.6));
  const angles = Array.from({ length: seg + 1 }, (_, i) => a0 + ((a1 - a0) * i) / seg);
  const at = (r: number, a: number, z: number): V3 => [r * Math.cos(a), r * Math.sin(a), z];
  const up: V3 = [0, 0, 1];
  // tampo: duas fileiras (de dentro até o começo do bisel)
  const radii = [r0, (r0 + r1 - bev) / 2, r1 - bev];
  const rows = radii.map((r) => angles.map((a) => vert(b, at(r, a, t), up, o.uv(at(r, a, t), true))));
  for (let k = 0; k < rows.length - 1; k++) for (let i = 0; i < seg; i++) quad(b, rows[k][i], rows[k][i + 1], rows[k + 1][i + 1], rows[k + 1][i], up);
  // bisel de fora
  if (bev > 0) {
    const s = Math.SQRT1_2;
    const top = angles.map((a) => vert(b, at(r1 - bev, a, t), [Math.cos(a) * s, Math.sin(a) * s, s], o.uv(at(r1 - bev, a, t), false)));
    const low = angles.map((a) => vert(b, at(r1, a, t - bev), [Math.cos(a) * s, Math.sin(a) * s, s], o.uv(at(r1, a, t - bev), false)));
    for (let i = 0; i < seg; i++) quad(b, top[i], top[i + 1], low[i + 1], low[i], [Math.cos(angles[i]) * s, Math.sin(angles[i]) * s, s]);
  }
  // paredes de fora e de dentro
  const wall = (r: number, zTop: number, sign: number) => {
    const hi = angles.map((a) => vert(b, at(r, a, zTop), [Math.cos(a) * sign, Math.sin(a) * sign, 0], o.uv(at(r, a, zTop), false)));
    const lo = angles.map((a) => vert(b, at(r, a, 0), [Math.cos(a) * sign, Math.sin(a) * sign, 0], o.uv(at(r, a, 0), false)));
    for (let i = 0; i < seg; i++) quad(b, hi[i], hi[i + 1], lo[i + 1], lo[i], [Math.cos(angles[i]) * sign, Math.sin(angles[i]) * sign, 0]);
  };
  wall(r1, t - bev, 1);
  wall(r0, t, -1);
  // pontas do arco
  for (const [a, sign] of [
    [a0, -1],
    [a1, 1],
  ] as const) {
    const n: V3 = [-Math.sin(a) * sign, Math.cos(a) * sign, 0];
    const ids = [at(r0, a, 0), at(r1, a, 0), at(r1, a, t - bev), at(r0, a, t)].map((p) => vert(b, p, n, o.uv(p, false)));
    quad(b, ids[0], ids[1], ids[2], ids[3], n);
  }
  return toGeometry(three, b);
}

/**
 * Junta geometrias (posição, normal e uv; indexadas ou não) num só buffer indexado, já com a matriz de cada uma.
 * As de entrada não são descartadas aqui: quem as criou descarta (ou as cria só para juntar).
 */
export function mergeGeometries(three: typeof THREE, parts: readonly { geo: THREE.BufferGeometry; matrix?: THREE.Matrix4 }[]): THREE.BufferGeometry {
  const b = newBuf();
  const v = new three.Vector3();
  const nrm = new three.Vector3();
  const normalMatrix = new three.Matrix3();
  for (const { geo, matrix } of parts) {
    const pos = geo.getAttribute("position");
    const nor = geo.getAttribute("normal");
    const uv = geo.getAttribute("uv");
    if (matrix) normalMatrix.getNormalMatrix(matrix);
    const base = b.pos.length / 3;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      nrm.fromBufferAttribute(nor, i);
      if (matrix) {
        v.applyMatrix4(matrix);
        nrm.applyMatrix3(normalMatrix).normalize();
      }
      b.pos.push(v.x, v.y, v.z);
      b.nor.push(nrm.x, nrm.y, nrm.z);
      b.uv.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
    }
    const index = geo.getIndex();
    if (index) for (let i = 0; i < index.count; i++) b.idx.push(base + index.getX(i));
    else for (let i = 0; i < pos.count; i++) b.idx.push(base + i);
  }
  return toGeometry(three, b);
}

/** Triângulos de uma geometria (indexada ou não). */
export const triangleCount = (g: THREE.BufferGeometry): number => (g.index ? g.index.count : g.getAttribute("position").count) / 3;
