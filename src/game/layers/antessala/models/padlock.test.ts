import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { DIGIT_ATLAS, digitCell } from "../textures";
import { FACES, STEP, WHEELS, digitAtRotation, rotationForDigit, wheelFaceNormal, wheelGeometry, wheelRotationX } from "./padlock";

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

describe("cadeado · rotação e dígito", () => {
  it("a volta é de 10 faces de 36°", () => {
    expect(FACES).toBe(10);
    expect(WHEELS).toBe(4);
    expect(STEP).toBeCloseTo((36 * Math.PI) / 180, 12);
  });

  it("digitAtRotation(rotationForDigit(d)) === d para 0 a 9", () => {
    for (const d of DIGITS) expect(digitAtRotation(rotationForDigit(d))).toBe(d);
  });

  it("girar para cima um passo aumenta o dígito visto de frente (e 9 + 1 volta a 0)", () => {
    for (const d of DIGITS) expect(digitAtRotation(rotationForDigit(d) + STEP)).toBe((d + 1) % 10);
    expect(digitAtRotation(rotationForDigit(0) - STEP)).toBe(9);
  });

  it("aceita ângulos de várias voltas, negativos e entre dois passos (o mais próximo vence)", () => {
    expect(digitAtRotation(rotationForDigit(3) + 7 * Math.PI * 2)).toBe(3);
    expect(digitAtRotation(rotationForDigit(3) - 5 * Math.PI * 2)).toBe(3);
    expect(digitAtRotation(rotationForDigit(4) + STEP * 0.4)).toBe(4);
    expect(digitAtRotation(rotationForDigit(4) + STEP * 0.6)).toBe(5);
    expect(digitAtRotation(-STEP * 0.4)).toBe(0);
    expect(digitAtRotation(-STEP * 0.6)).toBe(9);
  });

  it("rotationForDigit normaliza o dígito (módulo 10)", () => {
    expect(rotationForDigit(10)).toBeCloseTo(rotationForDigit(0), 12);
    expect(rotationForDigit(-1)).toBeCloseTo(rotationForDigit(9), 12);
  });
});

describe("cadeado · a roda do modelo obedece o sinal", () => {
  // A roda de verdade: a geometria com a textura de dígitos. Para cada triângulo lateral lê-se o dígito que a UV
  // mostra e a normal dele; girando a roda por rotationForDigit(d) em torno de +x (como o modelo faz, wheelRotationX),
  // a face desse dígito tem de ficar virada para quem olha (+z local). É a prova do sinal contra a orientação real.
  const geo = wheelGeometry(THREE);
  const pos = geo.getAttribute("position");
  const nor = geo.getAttribute("normal");
  const uv = geo.getAttribute("uv");
  const index = geo.getIndex()!;

  /** Dígito mostrado por um vértice (a célula do atlas onde a UV cai). */
  const digitOf = (u: number, v: number): number | null => {
    const col = Math.min(DIGIT_ATLAS.cols - 1, Math.floor(u * DIGIT_ATLAS.cols));
    const row = Math.min(DIGIT_ATLAS.rows - 1, Math.floor((1 - v) * DIGIT_ATLAS.rows));
    const d = row * DIGIT_ATLAS.cols + col;
    return d <= 9 ? d : null;
  };

  const faces: { digit: number; normal: THREE.Vector3 }[] = [];
  for (let t = 0; t < index.count; t += 3) {
    const a = index.getX(t);
    const b = index.getX(t + 1);
    const c = index.getX(t + 2);
    const cu = (uv.getX(a) + uv.getX(b) + uv.getX(c)) / 3;
    const cv = (uv.getY(a) + uv.getY(b) + uv.getY(c)) / 3;
    const digit = digitOf(cu, cv);
    if (digit === null) continue;
    const n = new THREE.Vector3().fromBufferAttribute(nor, a);
    // a normal do vértice tem de ser a da face do triângulo (geometria facetada)
    const pa = new THREE.Vector3().fromBufferAttribute(pos, a);
    const pb = new THREE.Vector3().fromBufferAttribute(pos, b);
    const pc = new THREE.Vector3().fromBufferAttribute(pos, c);
    const fn = pb.clone().sub(pa).cross(pc.clone().sub(pa)).normalize();
    expect(fn.dot(n)).toBeGreaterThan(0.999);
    faces.push({ digit, normal: n });
  }

  it("tem as 10 faces numeradas, 2 triângulos cada, e cada normal bate com wheelFaceNormal", () => {
    expect(faces.length).toBe(FACES * 2);
    for (const d of DIGITS) {
      const mine = faces.filter((f) => f.digit === d);
      expect(mine.length, `dígito ${d}`).toBe(2);
      const [x, y, z] = wheelFaceNormal(d);
      for (const f of mine) expect(f.normal.distanceTo(new THREE.Vector3(x, y, z))).toBeLessThan(1e-6);
    }
  });

  it("com a roda girada para o dígito d, a face de d olha para a frente (+z) e as outras não", () => {
    for (const d of DIGITS) {
      const m = new THREE.Matrix4().makeRotationX(wheelRotationX(rotationForDigit(d)));
      for (const f of faces) {
        const front = f.normal.clone().applyMatrix4(m).z;
        if (f.digit === d) expect(front, `dígito ${d} de frente`).toBeGreaterThan(0.9999);
        else expect(front, `dígito ${f.digit} com ${d} na frente`).toBeLessThan(0.9);
      }
    }
  });

  it("girar a superfície da frente para CIMA traz para a frente o dígito que estava embaixo (+1)", () => {
    // na roda em repouso o 0 olha para a frente e o 1 fica logo abaixo (y menor)
    expect(wheelFaceNormal(0)[1]).toBeCloseTo(0, 12);
    expect(wheelFaceNormal(1)[1]).toBeLessThan(0);
    // a superfície da frente sobe quando o ângulo cresce (y positivo)...
    const up = new THREE.Vector3(0, 0, 1).applyMatrix4(new THREE.Matrix4().makeRotationX(wheelRotationX(STEP)));
    expect(up.y).toBeGreaterThan(0);
    // ...e, de qualquer dígito d, um passo a mais põe a face de d + 1 (que estava embaixo) de frente
    for (const d of DIGITS) {
      const m = new THREE.Matrix4().makeRotationX(wheelRotationX(rotationForDigit(d) + STEP));
      const next = new THREE.Vector3(...wheelFaceNormal((d + 1) % 10)).applyMatrix4(m);
      expect(next.z).toBeGreaterThan(0.9999);
    }
  });

  it("o atlas tem 10 células de dígito e 2 em branco para as tampas", () => {
    const cells = new Set(DIGITS.map((d) => `${digitCell(d).col},${digitCell(d).row}`));
    expect(cells.size).toBe(10);
    expect(DIGIT_ATLAS.cols * DIGIT_ATLAS.rows).toBe(12);
  });

  it("40 triângulos por roda", () => {
    expect(index.count / 3).toBe(40);
  });
});
