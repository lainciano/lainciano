import type * as THREE from "three";
import type { Maker } from "../../../render/kit";
import { chamferBox } from "../../../render/shapes";
import { mergeGeometries, type MergePart } from "../../../render/slab";
import * as tx from "../textures";

/**
 * Cadeado de 4 rodas do balcão (B9; a lógica do puzzle é da B18). Segredo de combinação grande o bastante para ler os
 * dígitos de perto: corpo de aço 9 × 7,5 × 4,6 cm, janela na frente com quatro rodas de 10 faces (5,2 cm de diâmetro,
 * 1,7 cm de largura) que saem 1 cm do corpo, argola em U de cantos arredondados.
 *
 * Duas chamadas de desenho: o corpo com a argola numa malha só (aço, com ferrugem e riscos) e as quatro rodas num
 * `InstancedMesh` (uma geometria de 40 triângulos, quatro matrizes). As rodas giram uma a uma pela matriz da instância
 * (`setAngles`); o corpo e a argola são fixos (a argola fechada: abrir o cadeado é tirá-lo do gancho, B18).
 *
 * Convenção da roda (a prova está em `padlock.test.ts`): o ângulo é o quanto a SUPERFÍCIE DA FRENTE subiu, em radianos.
 * Subir a frente por um passo (36°) traz para a frente o dígito que estava logo abaixo, então o dígito visto de frente
 * AUMENTA (…8, 9, 0, 1…): na roda, d + 1 fica abaixo de d. Em three isso é a rotação de −ângulo em torno de +x.
 * Frente = +z local; +x local é a direita de quem olha de frente; o pivô fica no centro do corpo.
 */

export const WHEELS = 4;
export const FACES = 10;
/** Ângulo de um passo: 36°. */
export const STEP = (Math.PI * 2) / FACES;

/** Medidas em metros (cadeado na origem, de pé, frente para +z). */
export const PADLOCK = {
  body: { w: 0.09, h: 0.075, d: 0.046 },
  wheel: { r: 0.026, w: 0.017, pitch: 0.0175, y: -0.003, z: 0.007 },
  shackle: { legX: 0.027, tube: 0.004, topY: 0.0835, corner: 0.01 },
  /** Do centro do corpo ao centro da argola de quem o segura (o gancho): a barra de cima descansa dentro dela. */
  ringDy: 0.0915,
} as const;

const mod = (n: number, m: number) => ((n % m) + m) % m;

/** Dígito 0 a 9 que uma roda mostra de frente quando girou `angle` rad (frente para cima; o passo mais próximo vence). */
export function digitAtRotation(angle: number): number {
  return mod(Math.round(angle / STEP), FACES);
}

/** Ângulo (rad) que põe o dígito `d` de frente: o contrário de `digitAtRotation`. */
export function rotationForDigit(d: number): number {
  return mod(Math.round(d), FACES) * STEP;
}

/** Rotação de three em torno de +x (rad) para o ângulo "frente para cima" de `angle`. */
export const wheelRotationX = (angle: number): number => -angle;

/** Normal da face do dígito `d` na roda em repouso: d + 1 fica logo abaixo de d (y menor), d = 0 olha para a frente. */
export function wheelFaceNormal(d: number): [number, number, number] {
  const u = -mod(Math.round(d), FACES) * STEP;
  return [0, Math.sin(u), Math.cos(u)];
}

/**
 * Geometria de UMA roda (eixo em x, centrada na origem): prisma de 10 lados com UV de cada face na célula do dígito
 * dela no atlas, normais planas, tampas nas pontas na célula em branco. 40 triângulos.
 */
export function wheelGeometry(T: typeof THREE): THREE.BufferGeometry {
  const { r, w } = PADLOCK.wheel;
  const hw = w / 2;
  const pos: number[] = [];
  const nor: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  const pt = (x: number, theta: number): [number, number, number] => [x, r * Math.sin(theta), r * Math.cos(theta)];
  const push = (p: readonly number[], n: readonly number[], uv: readonly number[]) => {
    pos.push(p[0], p[1], p[2]);
    nor.push(n[0], n[1], n[2]);
    uvs.push(uv[0], uv[1]);
    return pos.length / 3 - 1;
  };
  const inset = 0.004;
  for (let d = 0; d < FACES; d++) {
    const u = -d * STEP;
    const n = wheelFaceNormal(d);
    const { col, row } = tx.digitCell(d);
    const u0 = col / tx.DIGIT_ATLAS.cols + inset;
    const u1 = (col + 1) / tx.DIGIT_ATLAS.cols - inset;
    const vTop = 1 - row / tx.DIGIT_ATLAS.rows - inset;
    const vBot = 1 - (row + 1) / tx.DIGIT_ATLAS.rows + inset;
    const a = push(pt(-hw, u - STEP / 2), n, [u0, vBot]);
    const b = push(pt(hw, u - STEP / 2), n, [u1, vBot]);
    const c = push(pt(hw, u + STEP / 2), n, [u1, vTop]);
    const e = push(pt(-hw, u + STEP / 2), n, [u0, vTop]);
    idx.push(a, b, c, a, c, e);
  }
  // tampas: um leque por ponta, na célula em branco (a última do atlas)
  const blank = tx.DIGIT_ATLAS.cols * tx.DIGIT_ATLAS.rows - 1;
  const bc = tx.digitCell(blank);
  const cap: [number, number] = [(bc.col + 0.5) / tx.DIGIT_ATLAS.cols, 1 - (bc.row + 0.5) / tx.DIGIT_ATLAS.rows];
  for (const side of [1, -1] as const) {
    const n = [side, 0, 0];
    const center = push([side * hw, 0, 0], n, cap);
    const ring = Array.from({ length: FACES }, (_, k) => push(pt(side * hw, -STEP / 2 - k * STEP), n, cap));
    for (let k = 0; k < FACES; k++) {
      const p = ring[k];
      const q = ring[(k + 1) % FACES];
      // os ângulos decrescem com k: a ordem (centro, q, p) vira para +x, (centro, p, q) para −x
      if (side > 0) idx.push(center, p, q);
      else idx.push(center, q, p);
    }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new T.Float32BufferAttribute(nor, 3));
  geo.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/** Centro da roda `i` (0 a 3, da esquerda para a direita de quem olha de frente) no cadeado. */
export function wheelCenter(i: number): [number, number, number] {
  const { pitch, y, z } = PADLOCK.wheel;
  return [(i - (WHEELS - 1) / 2) * pitch, y, z];
}

export type PadlockParts = {
  /** Grupo `dynamic` (as rodas giram, o conjunto sai do gancho): a cena o solta do lote. */
  root: THREE.Group;
  /** Corpo e argola numa malha só. */
  body: THREE.Mesh;
  /** As quatro rodas (uma instância por roda). */
  wheels: THREE.InstancedMesh;
  /** Ângulos atuais (rad, frente para cima), um por roda. */
  angles: number[];
  /** Põe cada roda no ângulo dado (rad) e atualiza as matrizes. */
  setAngles(angles: readonly number[]): void;
  /** Atalho: cada roda no dígito dado. */
  setDigits(digits: readonly number[]): void;
};

/** Dígitos de repouso do cadeado fechado (embaralhado; a senha é da B18). */
export const PADLOCK_REST = [5, 1, 8, 2] as const;

export function buildPadlock(m: Maker, digits: readonly number[] = PADLOCK_REST): PadlockParts {
  const { T, kit } = m;
  const root = new T.Group();
  root.name = "cadeado";
  root.userData.dynamic = true;
  const { w: BW, h: BH, d: BD } = PADLOCK.body;
  const { r: WR, pitch, y: WY } = PADLOCK.wheel;

  const steel = kit.phong({ map: m.tex("cadeado-aco", tx.drawSteel, 64), shininess: 60, specular: 0x505050 });
  const wheelMat = kit.phong({ map: m.tex("cadeado-roda", tx.drawPadlockWheel, 256), shininess: 26, specular: 0x1c1c1c });

  // Corpo: bloco de trás e moldura da janela (barra de cima, de baixo e duas bochechas) saindo 1,9 cm à frente.
  const parts: MergePart[] = [];
  const place = (geo: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, rz = 0): MergePart => {
    const matrix = new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, 0, rz)), new T.Vector3(1, 1, 1));
    return { geo, matrix };
  };
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, chamfer = 0.002) =>
    parts.push(place(chamferBox(T, w, h, d, { chamfer, seg: 1, uv: { mode: "face" } }), x, y, z));
  const backD = BD / 2 + 0.004; // o bloco vai de −BD/2 até z = +0,004
  box(BW, BH, backD, 0, 0, -BD / 2 + backD / 2, 0.003);
  const frontD = BD / 2 - 0.004;
  const frontZ = 0.004 + frontD / 2;
  const slotTop = WY + WR + 0.001;
  const slotBot = WY - WR - 0.001;
  const slotHalf = (WHEELS * pitch) / 2 + 0.001;
  box(BW, BH / 2 - slotTop, frontD, 0, (BH / 2 + slotTop) / 2, frontZ);
  box(BW, slotBot + BH / 2, frontD, 0, (-BH / 2 + slotBot) / 2, frontZ);
  const cheek = BW / 2 - slotHalf;
  for (const s of [-1, 1] as const) box(cheek, slotTop - slotBot, frontD, s * (slotHalf + cheek / 2), (slotTop + slotBot) / 2, frontZ);

  // Argola em U de cantos arredondados: duas pernas que entram no corpo, dois quartos de toro e a barra de cima reta.
  const { legX, tube, topY, corner } = PADLOCK.shackle;
  const legTop = topY - corner;
  const legBottom = BH / 2 - 0.018;
  const legLen = legTop - legBottom;
  for (const s of [-1, 1] as const) parts.push(place(new T.CylinderGeometry(tube, tube, legLen, 5, 1, true), s * legX, legBottom + legLen / 2, 0));
  const arc = new T.TorusGeometry(corner, tube, 5, 3, Math.PI / 2);
  parts.push(place(arc.clone(), legX - corner, legTop, 0));
  parts.push(place(arc.clone(), -(legX - corner), legTop, 0, 0, Math.PI / 2));
  arc.dispose();
  const barLen = 2 * (legX - corner);
  parts.push(place(new T.CylinderGeometry(tube, tube, barLen, 5, 1, true), 0, topY, 0, 0, Math.PI / 2));
  const merged = m.own(mergeGeometries(T, parts));
  for (const p of parts) p.geo.dispose();
  const body = new T.Mesh(merged, steel);
  body.name = "cadeado-corpo";
  body.castShadow = true;
  body.receiveShadow = true;
  root.add(body);

  // Rodas: uma geometria, quatro instâncias.
  const wheels = m.own(new T.InstancedMesh(m.own(wheelGeometry(T)), wheelMat, WHEELS));
  wheels.name = "cadeado-rodas";
  wheels.castShadow = true;
  wheels.receiveShadow = true;
  wheels.frustumCulled = false;
  wheels.userData.dynamic = true;
  root.add(wheels);

  const angles = [0, 0, 0, 0];
  const mat = new T.Matrix4();
  const q = new T.Quaternion();
  const axis = new T.Vector3(1, 0, 0);
  const one = new T.Vector3(1, 1, 1);
  const at = new T.Vector3();
  const setAngles = (next: readonly number[]) => {
    for (let i = 0; i < WHEELS; i++) {
      angles[i] = next[i] ?? 0;
      const [x, y, z] = wheelCenter(i);
      q.setFromAxisAngle(axis, wheelRotationX(angles[i]));
      mat.compose(at.set(x, y, z), q, one);
      wheels.setMatrixAt(i, mat);
    }
    wheels.instanceMatrix.needsUpdate = true;
  };
  const setDigits = (ds: readonly number[]) => setAngles(Array.from({ length: WHEELS }, (_, i) => rotationForDigit(ds[i] ?? 0)));
  setDigits(digits);
  return { root, body, wheels, angles, setAngles, setDigits };
}
