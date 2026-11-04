import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ambientOcclusion, bakeIrradiance, bakeVertexLight, boxFormFactor, linearRgb, type BakeOptions, type V3 } from "./bake";

const UP: V3 = [0, 1, 0];
const box = (min: V3, max: V3) => ({ min: { x: min[0], y: min[1], z: min[2] }, max: { x: max[0], y: max[1], z: max[2] } });
/** Sala 4 × 4 × 2,6 centrada na origem. */
const ROOM = { floorY: 0, ceilingY: 2.6, walls: { minX: -2, maxX: 2, minZ: -2, maxZ: 2 } };

describe("linearRgb", () => {
  it("lê hex e texto como linear (convenção do protótipo) e deixa RGB passar", () => {
    expect(linearRgb(0xff8000)).toEqual([1, 128 / 255, 0]);
    expect(linearRgb("#ff8000")).toEqual([1, 128 / 255, 0]);
    expect(linearRgb("#f80")).toEqual([1, 136 / 255, 0]);
    expect(linearRgb([0.1, 0.2, 0.3])).toEqual([0.1, 0.2, 0.3]);
    expect(() => linearRgb("vermelho")).toThrow();
  });
});

describe("boxFormFactor (fator de forma exato)", () => {
  it("uma tampa enorme logo acima tapa o hemisfério inteiro", () => {
    expect(boxFormFactor(box([-500, 0.01, -500], [500, 1, 500]), [0, 0, 0], UP)).toBeCloseTo(1, 2);
  });

  it("uma parede enorme de pé, colada ao ponto, tapa metade (cosseno)", () => {
    expect(boxFormFactor(box([0.0001, -500, -500], [1, 500, 500]), [0, 0, 0], UP)).toBeCloseTo(0.5, 2);
  });

  it("disco/retângulo pequeno bate com a aproximação de ângulo sólido (área·cos / πd²)", () => {
    const s = 0.02;
    const d = 1;
    const f = boxFormFactor(box([-s / 2, d, -s / 2], [s / 2, d + 0.001, s / 2]), [0, 0, 0], UP);
    expect(f).toBeCloseTo((s * s) / (Math.PI * d * d), 6);
  });

  it("o que fica abaixo do horizonte não conta; ponto sobre o tampo não é tapado pela própria caixa", () => {
    expect(boxFormFactor(box([-1, -2, -1], [1, -1, 1]), [0, 0, 0], UP)).toBe(0);
    expect(boxFormFactor(box([-1, 0, -1], [1, 0.76, 1]), [0, 0.76, 0], UP)).toBe(0);
  });
});

describe("ambientOcclusion", () => {
  it("canto (piso + 2 paredes) mais escuro que o meio do piso, que fica aberto", () => {
    const ao = { ...ROOM, strength: 1 };
    const center = ambientOcclusion([0, 0, 0], UP, ao);
    const corner = ambientOcclusion([-1.98, 0, -1.98], UP, ao);
    const edge = ambientOcclusion([-1.98, 0, 0], UP, ao);
    expect(center).toBe(1);
    expect(edge).toBeLessThan(center);
    expect(corner).toBeLessThan(edge);
  });

  it("o pé da parede escurece por causa do piso; a parede não se tapa", () => {
    const ao = { ...ROOM, strength: 1 };
    expect(ambientOcclusion([-2, 0.01, 0], [1, 0, 0], ao)).toBeLessThan(ambientOcclusion([-2, 1.3, 0], [1, 0, 0], ao));
    expect(ambientOcclusion([-2, 1.3, 0], [1, 0, 0], ao)).toBe(1);
  });

  it("o piso debaixo de um tampo escurece; longe dele, não", () => {
    const ao = { boxes: [box([-0.6, 0.73, -0.34], [0.6, 0.76, 0.34])], strength: 1 };
    expect(ambientOcclusion([0, 0, 0], UP, ao)).toBeLessThan(0.9);
    expect(ambientOcclusion([3, 0, 3], UP, ao)).toBe(1);
  });

  it("respeita o piso de visibilidade e a força 0", () => {
    expect(ambientOcclusion([-2, 0, -2], UP, { ...ROOM, strength: 1, min: 0.5 })).toBeGreaterThanOrEqual(0.5);
    expect(ambientOcclusion([-2, 0, -2], UP, { ...ROOM, strength: 0 })).toBe(1);
  });
});

describe("bakeIrradiance", () => {
  const opts: BakeOptions = {
    ao: { ...ROOM, strength: 0.6 },
    ambient: { color: 0x1e1c1a, intensity: 0.47 },
    hemi: { sky: 0x3a4048, ground: 0x241a10, intensity: 0.31 },
    fills: [{ pos: [1, 1.2, 1], color: 0xffa860, range: 4, intensity: 0.7, decay: 1 }],
  };

  it("sem oclusão e sem preenchimento, é a conta do three (ambiente + hemisfério)", () => {
    const o: BakeOptions = { ambient: opts.ambient, hemi: opts.hemi };
    const [r] = bakeIrradiance([0, 0, 0], [0, 1, 0], o);
    const amb = linearRgb(0x1e1c1a)[0] * 0.47;
    expect(r).toBeCloseTo(amb + linearRgb(0x3a4048)[0] * 0.31, 6);
    const [rDown] = bakeIrradiance([0, 0, 0], [0, -1, 0], o);
    expect(rDown).toBeCloseTo(amb + linearRgb(0x241a10)[0] * 0.31, 6);
  });

  it("canto mais escuro que o centro do piso; mesma entrada, mesmas cores", () => {
    const pos = [0, 0, 0, -1.98, 0, -1.98];
    const nor = [0, 1, 0, 0, 1, 0];
    const a = bakeIrradiance(pos, nor, { ...opts, fills: [] });
    expect(a[3] + a[4] + a[5]).toBeLessThan(a[0] + a[1] + a[2]);
    expect(Array.from(bakeIrradiance(pos, nor, opts))).toEqual(Array.from(bakeIrradiance(pos, nor, opts)));
  });

  it("preenchimento: soma só do lado da luz, até o alcance", () => {
    const base: BakeOptions = { fills: opts.fills };
    const toward = bakeIrradiance([1, 0, 1], [0, 1, 0], base);
    const away = bakeIrradiance([1, 0, 1], [0, -1, 0], base);
    const far = bakeIrradiance([10, 0, 10], [0, 1, 0], base);
    expect(toward[0]).toBeGreaterThan(0);
    expect(away[0]).toBe(0);
    expect(far[0]).toBe(0);
  });
});

describe("bakeVertexLight", () => {
  it("grava `color` (3 por vértice) a partir de posição e normal", () => {
    const geo = new THREE.PlaneGeometry(1, 1, 2, 2).rotateX(-Math.PI / 2);
    bakeVertexLight(THREE, geo, { ambient: { color: 0xffffff, intensity: 0.5 } });
    const color = geo.getAttribute("color");
    expect(color.itemSize).toBe(3);
    expect(color.count).toBe(geo.getAttribute("position").count);
    expect(color.getX(0)).toBeCloseTo(0.5, 6);
  });
});

describe("luz de área (janela)", () => {
  // janela de 1 × 1 m na parede x = −2, olhando para +x
  const win = { corners: [[-2, 1, -0.5], [-2, 1, 0.5], [-2, 2, 0.5], [-2, 2, -0.5]] as [V3, V3, V3, V3], normal: [1, 0, 0] as V3, color: 0xffffff, intensity: 1 };
  const at = (p: V3, n: V3) => bakeIrradiance(p, n, { areas: [win] })[0];

  it("ilumina quem a olha de frente e cai com a distância", () => {
    const near = at([-1.5, 1.5, 0], [-1, 0, 0]);
    const far = at([1.5, 1.5, 0], [-1, 0, 0]);
    expect(near).toBeGreaterThan(0.3);
    expect(far).toBeGreaterThan(0);
    expect(far).toBeLessThan(near / 5);
  });

  it("não ilumina atrás dela nem quem lhe dá as costas", () => {
    expect(at([-2.5, 1.5, 0], [1, 0, 0])).toBe(0);
    expect(at([-1.5, 1.5, 0], [1, 0, 0])).toBe(0);
  });

  it("o piso diante da janela recebe luz, e mais perto da parede", () => {
    const close = at([-1.6, 0, 0], UP);
    const away = at([0.5, 0, 0], UP);
    expect(close).toBeGreaterThan(away);
    expect(away).toBeGreaterThan(0);
  });
});
