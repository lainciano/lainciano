import type * as THREE from "three";
import { grain, jagged, mulberry, blotches, type Draw } from "../paint";
import type { Maker } from "./maker";

/**
 * Luminária pendente de cúpula esmaltada (movida de `layers/cinza/models.ts` na B8, sem mudar um traço): a sala cinza
 * e a Antessala (a lâmpada âmbar que ele pendurou sobre o balcão) usam a mesma peça. As chaves de textura seguem
 * prefixadas pela camada (o `Maker`), então a cinza continua com as mesmas texturas.
 */

export type LampParts = { pivot: THREE.Group; bulbY: number };

/**
 * Luminária de cúpula esmaltada (verde por fora, branca por dentro, borda enrolada e lascada), soquete de
 * baquelite, fio de tecido e canopla no teto. O pivô no teto balança (quem anima é a camada); a lâmpada e a luz
 * ficam a `bulbY` abaixo dele.
 */
export function buildLamp(m: Maker, x: number, ceilingY: number, z: number, bulbWorldY: number, o: { cord?: number } = {}): LampParts {
  const { T, kit } = m;
  const pivot = new T.Group();
  pivot.name = "luminaria";
  pivot.position.set(x, ceilingY, z);
  const drop = ceilingY - bulbWorldY;
  const metal = kit.phong({ color: 0x1a1a18, shininess: 30 });
  const cordMat = kit.phong({ color: 0x141210, shininess: 4 });
  const bakelite = kit.phong({ color: 0x2a1a10, shininess: 50 });
  const outer = kit.phong({ map: m.tex("cupula-fora", drawEnamelOut, 128), shininess: 60, specular: 0x202a24 });
  const innerMat = kit.phong({ map: m.tex("cupula-dentro", drawEnamelIn, 64), side: T.BackSide, shininess: 30 });
  const bulb = kit.basic({ color: 0xffd8a0 });
  const opts = { cast: false };
  // canopla
  const rose = [
    [0.0001, 0],
    [0.055, 0],
    [0.056, -0.006],
    [0.05, -0.02],
    [0.012, -0.03],
    [0.0001, -0.03],
  ].map(([r, y]) => new T.Vector2(r, y)).reverse();
  m.mesh(new T.LatheGeometry(rose, 14), metal, pivot, 0, -0.001, 0, opts);
  // fio até a cúpula
  const shadeTop = -(drop - 0.07);
  m.mesh(new T.CylinderGeometry(o.cord ?? 0.0035, o.cord ?? 0.0035, -shadeTop - 0.03, 5), cordMat, pivot, 0, (shadeTop - 0.03) / 2, 0, opts);
  // cúpula: cone com a borda enrolada (perfil), de fora e de dentro (2 mm para dentro, sem coplanar). O perfil é
  // escrito de cima para baixo; a lathe quer de baixo para cima para as faces olharem para fora: `reverse`.
  const shade = (k: number) =>
    [
      [0.03, 0],
      [0.045, -0.02],
      [0.1, -0.075],
      [0.155, -0.13],
      [0.168, -0.142],
      [0.172, -0.15],
      [0.166, -0.155],
    ].map(([r, y]) => new T.Vector2(r * k, y));
  m.mesh(new T.LatheGeometry(shade(1).reverse(), 18), outer, pivot, 0, shadeTop, 0, opts);
  m.mesh(new T.LatheGeometry(shade(0.985).slice(0, 5).reverse(), 18), innerMat, pivot, 0, shadeTop - 0.002, 0, opts);
  // soquete e lâmpada
  m.mesh(new T.CylinderGeometry(0.02, 0.022, 0.045, 10), bakelite, pivot, 0, shadeTop - 0.03, 0, opts);
  const bulbMesh = m.mesh(new T.SphereGeometry(0.032, 10, 8), bulb, pivot, 0, -drop, 0, { cast: false, recv: false });
  bulbMesh.scale.set(1, 1.15, 1);
  return { pivot, bulbY: -drop };
}


/** Esmalte da cúpula: verde-garrafa por fora, lascado na borda até o ferro preto; ferrugem escorrida. */
export const drawEnamelOut: Draw = (g, w, h) => {
  const r = mulberry(870);
  g.fillStyle = "#24392e";
  g.fillRect(0, 0, w, h);
  blotches(g, w, h, r, 6, [10, 18, 14], 1.5, 0.35);
  // brilho vertical do esmalte
  for (let x = 0; x < w; x += 16) {
    g.fillStyle = "rgba(170,200,180,.05)";
    g.fillRect(x, 0, 4, h);
  }
  // lascas na borda (o v alto da lathe é a borda de baixo)
  for (let i = 0; i < 16; i++) {
    const x = r() * w;
    const y = h - r() * 14;
    g.fillStyle = "#0d0d0c";
    jagged(g, x, y, 1.5 + r() * 3, r, 8);
    g.fill();
    g.fillStyle = "rgba(110,60,24,.6)";
    g.fillRect(x - 0.5, y - 10 - r() * 10, 1, 10 + r() * 6);
  }
  grain(g, w, h, r, 8);
};

/** Esmalte de dentro: branco amarelado, encardido em cima pelo calor da lâmpada. */
export const drawEnamelIn: Draw = (g, w, h) => {
  const r = mulberry(880);
  g.fillStyle = "#d8d0bc";
  g.fillRect(0, 0, w, h);
  const heat = g.createLinearGradient(0, 0, 0, h * 0.6);
  heat.addColorStop(0, "rgba(110,80,40,.6)");
  heat.addColorStop(1, "rgba(110,80,40,0)");
  g.fillStyle = heat;
  g.fillRect(0, 0, w, h);
  grain(g, w, h, r, 8);
};
