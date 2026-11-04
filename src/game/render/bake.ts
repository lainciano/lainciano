import type * as THREE from "three";

/**
 * Luz assada no vértice (B3): oclusão ambiente ANALÍTICA e as luzes fixas de preenchimento viram a irradiância de
 * cada vértice (atributo `color`), e o material assado (`kit.baked`, patch em `psx.ts`) a usa NO LUGAR da luz
 * ambiente e do hemisfério; as luzes dinâmicas (a lâmpada que balança, com sombra, e a lanterna) continuam somando
 * por cima, como antes. Sem raycast por vértice e determinístico: a mesma entrada dá as mesmas cores.
 *
 * - Hemisfério e ambiente: a mesma conta do three (`getHemisphereLightIrradiance`: mistura chão→céu por
 *   `0,5·n.y + 0,5`), multiplicada pela oclusão. Sem oclusão (AO 1) o resultado é igual ao da luz de verdade.
 * - Preenchimentos: luz pontual sem sombra, com a queda física do three (`1/d^decay` e o corte suave em `range`),
 *   sem oclusão (como a luz de verdade, que não tinha sombra).
 * - Oclusão: piso, teto e paredes como planos (a fração do hemisfério do vértice que o plano tapa, `(1 + n·u)/2`,
 *   apagando até `radius`) e caixas pelo fator de forma exato das faces visíveis (fórmula de Lambert para polígono,
 *   cortado no horizonte do vértice), apagando até `boxRadius`. Cada oclusor multiplica a visibilidade.
 *
 * Cores na convenção do protótipo 7 (hex lido como linear, igual a `protoColor`). Tudo no espaço do `root` do lote.
 * Sem three em tempo de execução (o módulo chega por parâmetro, como `slab.ts`).
 */

export type V3 = readonly [number, number, number];
export type Rgb = readonly [number, number, number];
/** Hex (`0x3a4048`), texto `#rrggbb`/`#rgb` ou RGB linear 0..1. */
export type ColorInput = number | string | Rgb;
/** `THREE.Box3` serve; os testes usam objetos simples. */
export type BoxLike = { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } };

export type AoOptions = {
  /** Caixas que tapam (tampo de mesa, corpo de armário, balcão…): as de verdade, não as de colisão. */
  boxes?: readonly BoxLike[];
  floorY?: number;
  ceilingY?: number;
  walls?: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** 0..1: quanto a oclusão escurece (1 = a fração tapada inteira). Padrão 1. */
  strength?: number;
  /** Alcance da oclusão dos planos (piso, teto, paredes), em metros. Padrão 0,6. */
  radius?: number;
  /** Alcance da oclusão das caixas, em metros. Padrão 1,2. */
  boxRadius?: number;
  /** Piso da visibilidade (nada fica mais escuro que isso). Padrão 0,2. */
  min?: number;
};

export type FillLight = { pos: V3; color: ColorInput; range: number; intensity: number; decay?: number };

export type BakeOptions = {
  ao?: AoOptions;
  fills?: readonly FillLight[];
  hemi?: { sky: ColorInput; ground: ColorInput; intensity: number };
  ambient?: { color: ColorInput; intensity: number };
};

/** Cor da paleta como RGB linear (a convenção do protótipo: o número do hex já é o valor linear). */
export function linearRgb(c: ColorInput): Rgb {
  if (typeof c !== "number" && typeof c !== "string") return c;
  let hex = c;
  if (typeof c === "string") {
    const s = c.trim().replace(/^#/, "");
    const full = s.length === 3 ? [...s].map((ch) => ch + ch).join("") : s;
    if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`bake: cor inválida "${c}"`);
    hex = Number.parseInt(full, 16);
  }
  const h = hex as number;
  return [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
}

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);

/**
 * Fator de forma (ângulo sólido projetado / π) de um polígono convexo visto do ponto, com normal `n`. `rel` são os
 * vértices relativos ao ponto, todos acima do horizonte. Fórmula de Lambert: Σ βᵢ·(n·γᵢ) / 2π.
 */
function polygonFormFactor(rel: readonly V3[], n: V3): number {
  let sum = 0;
  for (let i = 0; i < rel.length; i++) {
    const a = rel[i];
    const b = rel[(i + 1) % rel.length];
    const la = len(a);
    const lb = len(b);
    if (la < 1e-9 || lb < 1e-9) continue;
    const c = cross(a, b);
    const lc = len(c);
    if (lc < 1e-12) continue;
    const beta = Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (la * lb))));
    sum += beta * (dot(c, n) / lc);
  }
  return Math.abs(sum) / (2 * Math.PI);
}

/** Corta o polígono no semiespaço `n·v ≥ 0` (Sutherland–Hodgman com um plano). */
function clipToHorizon(poly: readonly V3[], n: V3): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const da = dot(a, n);
    const db = dot(b, n);
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    }
  }
  return out;
}

/**
 * Fator de forma de uma caixa vista do ponto `p` (normal `n`): soma das faces voltadas para o ponto (numa caixa
 * convexa as projeções delas não se sobrepõem), cada uma cortada no horizonte. Ponto dentro ou sobre a face: 0.
 */
export function boxFormFactor(box: BoxLike, p: V3, n: V3): number {
  const lo: V3 = [box.min.x, box.min.y, box.min.z];
  const hi: V3 = [box.max.x, box.max.y, box.max.z];
  let total = 0;
  for (let axis = 0; axis < 3; axis++) {
    for (const side of [-1, 1] as const) {
      const c = side > 0 ? hi[axis] : lo[axis];
      if (side * (p[axis] - c) <= 1e-9) continue;
      const u = (axis + 1) % 3;
      const v = (axis + 2) % 3;
      const corner = (cu: number, cv: number): V3 => {
        const q = [0, 0, 0] as [number, number, number];
        q[axis] = c;
        q[u] = cu;
        q[v] = cv;
        return sub(q, p);
      };
      const face = [corner(lo[u], lo[v]), corner(hi[u], lo[v]), corner(hi[u], hi[v]), corner(lo[u], hi[v])];
      const clipped = clipToHorizon(face, n);
      if (clipped.length >= 3) total += polygonFormFactor(clipped, n);
    }
  }
  return Math.min(1, total);
}

/** Distância do ponto à caixa (0 dentro). */
function boxDistance(box: BoxLike, p: V3): number {
  const dx = Math.max(box.min.x - p[0], 0, p[0] - box.max.x);
  const dy = Math.max(box.min.y - p[1], 0, p[1] - box.max.y);
  const dz = Math.max(box.min.z - p[2], 0, p[2] - box.max.z);
  return Math.hypot(dx, dy, dz);
}

/** Visibilidade do ambiente no vértice (1 = aberto; menor = tapado). Ver o topo do arquivo. */
export function ambientOcclusion(p: V3, n: V3, ao: AoOptions): number {
  const s = ao.strength ?? 1;
  const R = ao.radius ?? 0.6;
  const RB = ao.boxRadius ?? 1.2;
  let vis = 1;
  /** Plano a `d` metros na direção `u` (unitária, do vértice para o plano). */
  const plane = (d: number, u: V3) => {
    if (d < 0 || d >= R) return;
    const w = (1 + dot(n, u)) / 2;
    const k = 1 - d / R;
    vis *= 1 - s * w * k * k;
  };
  if (ao.floorY !== undefined) plane(p[1] - ao.floorY, [0, -1, 0]);
  if (ao.ceilingY !== undefined) plane(ao.ceilingY - p[1], [0, 1, 0]);
  if (ao.walls) {
    plane(p[0] - ao.walls.minX, [-1, 0, 0]);
    plane(ao.walls.maxX - p[0], [1, 0, 0]);
    plane(p[2] - ao.walls.minZ, [0, 0, -1]);
    plane(ao.walls.maxZ - p[2], [0, 0, 1]);
  }
  for (const box of ao.boxes ?? []) {
    const d = boxDistance(box, p);
    if (d >= RB) continue;
    const f = boxFormFactor(box, p, n);
    if (f <= 0) continue;
    const t = d / RB;
    vis *= 1 - s * f * (1 - t * t);
  }
  return Math.max(ao.min ?? 0.2, vis);
}

type Prepared = {
  ambient: Rgb;
  sky: Rgb;
  ground: Rgb;
  fills: { pos: V3; rgb: Rgb; range: number; decay: number }[];
};

function prepare(o: BakeOptions): Prepared {
  const scale = (c: ColorInput, k: number): Rgb => {
    const [r, g, b] = linearRgb(c);
    return [r * k, g * k, b * k];
  };
  return {
    ambient: o.ambient ? scale(o.ambient.color, o.ambient.intensity) : [0, 0, 0],
    sky: o.hemi ? scale(o.hemi.sky, o.hemi.intensity) : [0, 0, 0],
    ground: o.hemi ? scale(o.hemi.ground, o.hemi.intensity) : [0, 0, 0],
    fills: (o.fills ?? []).map((f) => ({ pos: f.pos, rgb: scale(f.color, f.intensity), range: f.range, decay: f.decay ?? 2 })),
  };
}

/** Irradiância de um vértice (RGB linear): AO × (ambiente + hemisfério) + preenchimentos. */
function irradianceAt(p: V3, n: V3, o: BakeOptions, pre: Prepared, out: number[]) {
  const vis = o.ao ? ambientOcclusion(p, n, o.ao) : 1;
  const w = 0.5 * n[1] + 0.5;
  for (let c = 0; c < 3; c++) out[c] = vis * (pre.ambient[c] + pre.ground[c] + (pre.sky[c] - pre.ground[c]) * w);
  for (const f of pre.fills) {
    const L = sub(f.pos, p);
    const d = len(L);
    if (d < 1e-6 || (f.range > 0 && d >= f.range)) continue;
    const ndl = Math.max(0, dot(n, L) / d);
    if (ndl === 0) continue;
    let att = 1 / Math.max(Math.pow(d, f.decay), 0.01);
    if (f.range > 0) {
      const q = 1 - Math.pow(d / f.range, 4);
      att *= q * q;
    }
    for (let c = 0; c < 3; c++) out[c] += f.rgb[c] * att * ndl;
  }
}

/** Irradiância assada de cada vértice (posições e normais em xyz corridos), pura. */
export function bakeIrradiance(positions: ArrayLike<number>, normals: ArrayLike<number>, o: BakeOptions): Float32Array {
  const count = Math.floor(positions.length / 3);
  const out = new Float32Array(count * 3);
  const pre = prepare(o);
  const rgb = [0, 0, 0];
  for (let i = 0; i < count; i++) {
    const p: V3 = [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
    let n: V3 = [normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]];
    const l = len(n);
    n = l > 1e-9 ? [n[0] / l, n[1] / l, n[2] / l] : [0, 1, 0];
    irradianceAt(p, n, o, pre, rgb);
    out[i * 3] = rgb[0];
    out[i * 3 + 1] = rgb[1];
    out[i * 3 + 2] = rgb[2];
  }
  return out;
}

/** Grava a irradiância assada no atributo `color` da geometria (posições e normais já no espaço do lote). */
export function bakeVertexLight(three: typeof THREE, geo: THREE.BufferGeometry, o: BakeOptions): void {
  if (!geo.getAttribute("normal")) geo.computeVertexNormals();
  const pos = geo.getAttribute("position");
  const nor = geo.getAttribute("normal");
  const flat = (a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) => {
    const out = new Float32Array(a.count * 3);
    for (let i = 0; i < a.count; i++) {
      out[i * 3] = a.getX(i);
      out[i * 3 + 1] = a.getY(i);
      out[i * 3 + 2] = a.getZ(i);
    }
    return out;
  };
  geo.setAttribute("color", new three.Float32BufferAttribute(bakeIrradiance(flat(pos), flat(nor), o), 3));
}
