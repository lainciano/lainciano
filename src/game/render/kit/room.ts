import type * as THREE from "three";
import type { Draw } from "../paint";
import { mulberry } from "../paint";
import { breakpoints, latticeSurface } from "../shapes";
import type { Maker } from "./maker";
import { drawCeiling, drawGranilite, drawSkirting } from "./roomTextures";

/**
 * Peças de sala (piso, paredes, teto, rodapé) parametrizadas por um `RoomSpec`, movidas de `layers/cinza/scene.ts`.
 * Todas as superfícies grandes saem da MESMA grade de linhas (x, z a cada `step`, mais as bordas dos vãos; y a
 * cada `step` mais a barra e o alto dos vãos): onde o piso encontra a parede, ou duas paredes se encontram, os
 * vértices coincidem e o tremor do PSX não abre fresta. A sala é centrada na origem (x para leste, z para o sul;
 * o norte é −z). Paredes: `n` (z −), `s` (z +), `o` oeste (x −), `l` leste (x +).
 */

export type WallId = "n" | "s" | "o" | "l";

/** Vão numa parede. `center` é a coordenada de MUNDO ao longo da parede (x em n/s, z em o/l); `sill` = altura do peitoril. */
export type Opening = { wall: WallId; center: number; width: number; height: number; sill?: number };

/** Desenhos e chaves de textura de uma parede (a pintura e as marcas de cada sala são dela). */
export type WallSkin = { key: string; draw: Draw };

export type RoomSpec = {
  width: number;
  depth: number;
  height: number;
  /** Passo da grade comum, em metros. */
  step: number;
  /** Altura da barra de tinta da parede: vira linha da grade. */
  band: number;
  openings: readonly Opening[];
  /** Semente do sorteio de variante e giro dos ladrilhos do piso. */
  seed: number;
  skin: {
    walls: Record<WallId, WallSkin>;
    /** Decalque de desgaste (UV = sala inteira, vista de cima); sem ele não há decalque. */
    wear?: Draw;
    /** Padrão do piso por variante (0 a 3); granilite do kit por padrão. */
    floor?: (variant: number) => Draw;
    ceiling?: Draw;
    skirting?: Draw;
  };
};

export type Lattice = { xs: number[]; zs: number[]; ys: number[] };

const WALLS: readonly WallId[] = ["n", "s", "o", "l"];
const NAMES: Record<WallId, string> = { n: "parede-norte", s: "parede-sul", o: "parede-oeste", l: "parede-leste" };
const alongX = (w: WallId) => w === "n" || w === "s";

/** Limites da sala em coordenadas de mundo. */
export function roomBounds(spec: Pick<RoomSpec, "width" | "depth">) {
  return { minX: -spec.width / 2, maxX: spec.width / 2, minZ: -spec.depth / 2, maxZ: spec.depth / 2 };
}

/** Vão como intervalo [u0, u1] ao longo da parede e [v0, v1] em altura. */
const span = (o: Opening) => ({ u0: o.center - o.width / 2, u1: o.center + o.width / 2, v0: o.sill ?? 0, v1: (o.sill ?? 0) + o.height });

/** Grade comum da sala: linhas do passo mais as bordas dos vãos (e a barra da parede em y). */
export function roomLattice(spec: RoomSpec): Lattice {
  const b = roomBounds(spec);
  const edges = (horizontal: boolean) => spec.openings.filter((o) => alongX(o.wall) === horizontal).flatMap((o) => [span(o).u0, span(o).u1]);
  const tops = spec.openings.flatMap((o) => (o.sill ? [span(o).v0, span(o).v1] : [span(o).v1]));
  return {
    xs: breakpoints(b.minX, b.maxX, spec.step, edges(true)),
    zs: breakpoints(b.minZ, b.maxZ, spec.step, edges(false)),
    ys: breakpoints(0, spec.height, spec.step, [spec.band, ...tops]),
  };
}

/** Trechos de [lo, hi] ao longo de uma parede que sobram depois dos vãos de porta (sem peitoril), com folga `trim`. */
function runs(spec: RoomSpec, wall: WallId, lo: number, hi: number, trim: number): [number, number][] {
  const doors = spec.openings.filter((o) => o.wall === wall && !o.sill).map(span).sort((a, c) => a.u0 - c.u0);
  const out: [number, number][] = [];
  let cursor = lo;
  for (const d of doors) {
    if (d.u0 - trim > cursor) out.push([cursor, d.u0 - trim]);
    cursor = Math.max(cursor, d.u1 + trim);
  }
  if (cursor < hi) out.push([cursor, hi]);
  return out;
}

/** Trechos do pé de cada parede (de canto a canto) menos os vãos de porta; pura. */
export function wallSegments(spec: RoomSpec): { wall: WallId; u0: number; u1: number }[] {
  const b = roomBounds(spec);
  return WALLS.flatMap((wall) => {
    const [min, max] = alongX(wall) ? [b.minX, b.maxX] : [b.minZ, b.maxZ];
    return runs(spec, wall, min, max, 0).map(([u0, u1]) => ({ wall, u0, u1 }));
  });
}

/** Piso: ladrilhos de 1 m, variante e giro de 90° sorteados por semente fixa; decalque nos mesmos vértices. */
export function buildFloor(m: Maker, root: THREE.Object3D, spec: RoomSpec): { mesh: THREE.Mesh; wear?: THREE.Mesh } {
  const { T, kit } = m;
  const b = roomBounds(spec);
  const lat = roomLattice(spec);
  const tile = (u: number, v: number) => ({ ix: Math.floor(u), iz: Math.floor(v) });
  const pick = (ix: number, iz: number) => {
    const rng = mulberry(spec.seed + ix * 31 + iz * 17);
    return { variant: Math.floor(rng() * 4) % 4, turn: Math.floor(rng() * 4) };
  };
  const geo = latticeSurface(T, {
    us: lat.xs,
    vs: lat.zs,
    at: (u, v) => [u, 0, v],
    normal: [0, 1, 0],
    group: (u0, v0, u1, v1) => {
      const { ix, iz } = tile((u0 + u1) / 2, (v0 + v1) / 2);
      return pick(ix, iz).variant;
    },
    cellUv: (u0, v0, u1, v1, u, v) => {
      const { ix, iz } = tile((u0 + u1) / 2, (v0 + v1) / 2);
      let a = u - ix;
      let c = 1 - (v - iz);
      for (let k = 0; k < pick(ix, iz).turn; k++) [a, c] = [1 - c, a];
      return [a, c];
    },
  });
  const floorDraw = spec.skin.floor ?? drawGranilite;
  const tiles = [0, 1, 2, 3].map((v) => kit.phong({ map: m.tex(`granilite-${v}`, floorDraw(v), 256), shininess: 18, specular: 0x0a0a0a }));
  const mesh = m.mesh(geo, tiles, root, 0, 0, 0, { cast: false, name: "piso" });
  if (!spec.skin.wear) return { mesh };

  // Decalque: as MESMAS posições e o mesmo índice do piso; só a UV (sala inteira) é dele.
  const wearTex = m.tex("piso-desgaste", spec.skin.wear, 256);
  wearTex.wrapS = T.ClampToEdgeWrapping;
  wearTex.wrapT = T.ClampToEdgeWrapping;
  const wear = kit.phong({ map: wearTex, transparent: true, depthWrite: false, specular: 0x000000, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const pos = geo.getAttribute("position");
  const wearGeo = new T.BufferGeometry();
  wearGeo.setAttribute("position", pos);
  wearGeo.setAttribute("normal", geo.getAttribute("normal"));
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) - b.minX) / (b.maxX - b.minX);
    uv[i * 2 + 1] = 1 - (pos.getZ(i) - b.minZ) / (b.maxZ - b.minZ);
  }
  wearGeo.setAttribute("uv", new T.BufferAttribute(uv, 2));
  wearGeo.setIndex(geo.getIndex());
  const decal = m.mesh(wearGeo, wear, root, 0, 0, 0, { cast: false, name: "piso-desgaste" });
  decal.renderOrder = 1;
  return { mesh, wear: decal };
}

/** As quatro paredes (norte, sul, oeste, leste), com os vãos recortados na grade (sem fresta). */
export function buildWalls(m: Maker, root: THREE.Object3D, spec: RoomSpec): THREE.Mesh[] {
  const { T, kit } = m;
  const b = roomBounds(spec);
  const lat = roomLattice(spec);
  const H = spec.height;
  const W = spec.width;
  const D = spec.depth;
  // Cada parede olha para dentro; `u` corre pelo eixo dela, `uv` casa com o desenho da textura.
  const faces: Record<WallId, { us: number[]; at: (u: number, v: number) => [number, number, number]; normal: [number, number, number]; uv: (u: number, v: number) => [number, number] }> = {
    n: { us: lat.xs, at: (u, v) => [u, v, b.minZ], normal: [0, 0, 1], uv: (u, v) => [(u - b.minX) / W, v / H] },
    s: { us: lat.xs, at: (u, v) => [u, v, b.maxZ], normal: [0, 0, -1], uv: (u, v) => [(b.maxX - u) / W, v / H] },
    o: { us: lat.zs, at: (u, v) => [b.minX, v, u], normal: [1, 0, 0], uv: (u, v) => [(b.maxZ - u) / D, v / H] },
    l: { us: lat.zs, at: (u, v) => [b.maxX, v, u], normal: [-1, 0, 0], uv: (u, v) => [(u - b.minZ) / D, v / H] },
  };
  return WALLS.map((wall) => {
    const f = faces[wall];
    const holes = spec.openings.filter((o) => o.wall === wall).map(span);
    const skin = spec.skin.walls[wall];
    const mat = kit.phong({ map: m.tex(skin.key, skin.draw, 256), shininess: 6, specular: 0x060606 });
    const geo = latticeSurface(T, { us: f.us, vs: lat.ys, holes: holes.length ? holes : undefined, at: f.at, normal: f.normal, uv: f.uv });
    return m.mesh(geo, mat, root, 0, 0, 0, { cast: false, name: NAMES[wall] });
  });
}

/** Teto (olha para baixo), na mesma grade das paredes. */
export function buildCeiling(m: Maker, root: THREE.Object3D, spec: RoomSpec): THREE.Mesh {
  const { T, kit } = m;
  const b = roomBounds(spec);
  const lat = roomLattice(spec);
  const ceil = kit.phong({ map: m.tex("teto", spec.skin.ceiling ?? drawCeiling, 256), shininess: 4, specular: 0x000000 });
  const geo = latticeSurface(T, {
    us: lat.xs,
    vs: lat.zs,
    at: (u, v) => [u, spec.height, v],
    normal: [0, -1, 0],
    uv: (u, v) => [(u - b.minX) / spec.width, (v - b.minZ) / spec.depth],
  });
  return m.mesh(geo, ceil, root, 0, 0, 0, { cast: false, name: "teto" });
}

/** Folga do rodapé junto ao vão: para no alisar da porta (batente de 10 cm menos a espessura do alisar). */
const SKIRT_TRIM = 0.1 - 0.03;

/**
 * Rodapé de granilite escuro: 9 cm, 1,4 cm de espessura, chanfrado; interrompido nos vãos (no alisar da porta)
 * e as pontas se encostam nos cantos (o leste e o oeste começam onde o norte e o sul terminam).
 */
export function buildSkirting(m: Maker, root: THREE.Object3D, spec: RoomSpec): THREE.Mesh[] {
  const { kit } = m;
  const b = roomBounds(spec);
  const skirt = kit.phong({ map: m.tex("rodape", spec.skin.skirting ?? drawSkirting, 128), shininess: 20 });
  const SK = { h: 0.09, t: 0.014 };
  const uv = { mode: "world" as const, tile: [0.6, 0.6] as const };
  const meshes: THREE.Mesh[] = [];
  for (const wall of WALLS) {
    // Norte e sul correm de canto a canto; leste e oeste encaixam entre os rodapés deles.
    const [lo, hi] = alongX(wall) ? [b.minX, b.maxX] : [b.minZ + SK.t, b.maxZ - SK.t];
    const fixed = wall === "n" ? b.minZ + SK.t / 2 : wall === "s" ? b.maxZ - SK.t / 2 : wall === "o" ? b.minX + SK.t / 2 : b.maxX - SK.t / 2;
    for (const [a, c] of runs(spec, wall, lo, hi, SKIRT_TRIM)) {
      const len = c - a;
      const mid = (a + c) / 2;
      meshes.push(
        alongX(wall)
          ? m.box(len, SK.h, SK.t, skirt, root, mid, SK.h / 2, fixed, { chamfer: 0.003, uv, cast: false })
          : m.box(SK.t, SK.h, len, skirt, root, fixed, SK.h / 2, mid, { chamfer: 0.003, uv, cast: false }),
      );
    }
  }
  return meshes;
}
