import type * as THREE from "three";
import type { Engine } from "../../runtime/engine";
import { protoColor } from "../materials";

/**
 * Cena de referência de debug (`?debug=1&shot=psx-ref`, Ruling 2 da Fase 1A): um pedaço da Antessala do
 * protótipo 7 (piso de granilite, paredes em dois tons, teto, o balcão de fórmica e a luz pendente com sombra)
 * para comparar o PSX portado com o protótipo na mesma moldura. Só existe em chunk lazy de debug; não é
 * conteúdo do jogo (a sala da 1A é a `cinza`, T8).
 *
 * Paleta e posições vêm do protótipo 7 (hex na convenção dele, ver render/materials.ts). As luzes foram
 * recalibradas por comparação de imagem: o r128 usava luz "legada" (× π e queda linear até o alcance), o 0.186
 * usa luz física (queda 1/dⁿ), então intensidade e queda não são os números de lá.
 */

const ROOM = { w: 4.5, d: 5, h: 2.6 } as const;
/** Altura onde o verde de baixo encontra o bege (m). */
const WALL_SPLIT = 1.25;
/** Câmera do lugar "centro" do protótipo, olhando o balcão (P = 0,15 / 1,0, olho 1,6). */
export const PSX_REF_CAMERA = { x: 0.15, y: 1.6, z: 1.0, yaw: -0.4636, pitch: -0.08 } as const;
/** Tempo preso para as fotos (grão e glitch estáveis entre capturas). */
const FROZEN_T = 1;

/** Fator para portar a intensidade "legada" do r128 para a luz física do 0.186 (antes da calibração). */
const LEGACY = Math.PI;
const LIGHTS = {
  ambient: { color: 0x1e1b18, intensity: 0.2 * LEGACY },
  hemi: { sky: 0x3a4452, ground: 0x22170e, intensity: 0.14 * LEGACY },
  // Queda ajustada para seguir a curva legada (1 − d/alcance)ⁿ de 0,8 a 3,5 m: lá 1,75 com n = 1,5 e 0,38 com n = 2.
  lamp: { color: 0xffb062, intensity: 1.64 * LEGACY, distance: 6.5, angle: 0.88, penumbra: 0.65, decay: 0.75 },
  fill: { color: 0xffa860, intensity: 0.23 * LEGACY, distance: 4.6, decay: 1 },
} as const;

type Rng = () => number;

/** PRNG do protótipo (mulberry32): mesmas texturas a cada abertura. */
function mulberry(seed: number): Rng {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Manchas: uma grade pequena de alfas aleatórios esticada com suavização (o `layer` do protótipo). */
function blotches(g: CanvasRenderingContext2D, w: number, h: number, r: Rng, cells: number, rgb: [number, number, number], pow: number, amax: number) {
  const ch = Math.max(2, Math.round((cells * h) / w));
  const c = document.createElement("canvas");
  c.width = cells;
  c.height = ch;
  const cg = c.getContext("2d");
  if (!cg) return;
  const img = cg.createImageData(cells, ch);
  for (let i = 0; i < cells * ch; i++) {
    const p = i * 4;
    img.data[p] = rgb[0];
    img.data[p + 1] = rgb[1];
    img.data[p + 2] = rgb[2];
    img.data[p + 3] = Math.pow(r(), pow) * amax * 255;
  }
  cg.putImageData(img, 0, 0);
  g.save();
  g.imageSmoothingEnabled = true;
  g.drawImage(c, 0, 0, w, h);
  g.restore();
}

function grain(g: CanvasRenderingContext2D, w: number, h: number, r: Rng, amp: number) {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amp;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

/** Granilite: base, manchas, pedrinhas e a junta de latão na borda do ladrilho (1 m). */
function drawFloor(g: CanvasRenderingContext2D, w: number, h: number) {
  const r = mulberry(11);
  g.fillStyle = "#8a867d";
  g.fillRect(0, 0, w, h);
  blotches(g, w, h, r, 4, [55, 50, 44], 1.5, 0.35);
  blotches(g, w, h, r, 12, [190, 184, 172], 2, 0.16);
  blotches(g, w, h, r, 36, [48, 44, 38], 2.4, 0.18);
  const stones = ["#1e1c1a", "#e2dbcc", "#a37b40", "#6c4130"];
  for (let i = 0; i < 700; i++) {
    const t = r();
    g.fillStyle = stones[t < 0.42 ? 0 : t < 0.7 ? 1 : t < 0.88 ? 2 : 3];
    g.fillRect(r() * w, r() * h, 1 + r() * 1.5, 1 + r());
  }
  // desgaste: passos que escurecem o meio do ladrilho
  const wear = g.createRadialGradient(w * 0.5, h * 0.5, 4, w * 0.5, h * 0.5, w * 0.7);
  wear.addColorStop(0, "rgba(52,45,36,.18)");
  wear.addColorStop(1, "rgba(52,45,36,0)");
  g.fillStyle = wear;
  g.fillRect(0, 0, w, h);
  g.fillStyle = "rgba(38,33,26,.9)";
  g.fillRect(0, 0, 2, h);
  g.fillRect(0, 0, w, 2);
  g.fillStyle = "rgba(176,142,82,.35)";
  g.fillRect(2, 0, 1, h);
  g.fillRect(0, 2, w, 1);
  grain(g, w, h, r, 10);
}

/** Parede: bege em cima, verde até 1,25 m, faixa escura entre os dois, sujeira no rodapé e no teto. */
function drawWall(seed: number) {
  return (g: CanvasRenderingContext2D, w: number, h: number) => {
    const r = mulberry(seed);
    const y = (m: number) => h - (m / ROOM.h) * h;
    const split = y(WALL_SPLIT);
    g.fillStyle = "#b5a788";
    g.fillRect(0, 0, w, split);
    g.fillStyle = "#56705e";
    g.fillRect(0, split, w, h - split);
    g.save();
    g.beginPath();
    g.rect(0, 0, w, split);
    g.clip();
    blotches(g, w, h, r, 6, [96, 78, 50], 1.6, 0.32);
    blotches(g, w, h, r, 20, [232, 222, 200], 2.6, 0.15);
    g.restore();
    g.save();
    g.beginPath();
    g.rect(0, split, w, h - split);
    g.clip();
    blotches(g, w, h, r, 6, [18, 36, 26], 1.5, 0.38);
    blotches(g, w, h, r, 24, [150, 182, 160], 3, 0.13);
    g.restore();
    g.fillStyle = "#2a3a30";
    g.fillRect(0, split - 1, w, 2);
    let gr = g.createLinearGradient(0, h, 0, y(0.4));
    gr.addColorStop(0, "rgba(24,20,14,.8)");
    gr.addColorStop(0.25, "rgba(24,20,14,.35)");
    gr.addColorStop(1, "rgba(24,20,14,0)");
    g.fillStyle = gr;
    g.fillRect(0, y(0.4), w, h);
    gr = g.createLinearGradient(0, 0, 0, y(ROOM.h - 0.45));
    gr.addColorStop(0, "rgba(42,36,24,.5)");
    gr.addColorStop(1, "rgba(42,36,24,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, w, y(ROOM.h - 0.45));
    // reboco descascado
    for (let i = 0; i < 8; i++) {
      const up = r() < 0.6;
      g.fillStyle = up ? "#cbc2aa" : "#a2a89c";
      const cx = r() * w;
      const cy = up ? r() * split : split + r() * (h - split) * 0.8;
      g.beginPath();
      g.ellipse(cx, cy, 2 + r() * 5, 1.5 + r() * 3, 0, 0, Math.PI * 2);
      g.fill();
    }
    grain(g, w, h, r, 12);
  };
}

function drawCeiling(g: CanvasRenderingContext2D, w: number, h: number) {
  const r = mulberry(23);
  g.fillStyle = "#a59e8c";
  g.fillRect(0, 0, w, h);
  blotches(g, w, h, r, 6, [110, 96, 70], 1.4, 0.35);
  blotches(g, w, h, r, 20, [60, 52, 40], 2.5, 0.16);
  grain(g, w, h, r, 9);
}

function drawFormica(g: CanvasRenderingContext2D, w: number, h: number) {
  const r = mulberry(31);
  g.fillStyle = "#cbb995";
  g.fillRect(0, 0, w, h);
  blotches(g, w, h, r, 8, [150, 128, 90], 1.8, 0.25);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = r() < 0.6 ? `rgba(120,100,70,${0.3 + r() * 0.4})` : `rgba(240,232,214,${0.4 + r() * 0.4})`;
    g.fillRect(r() * w, r() * h, 1, 1);
  }
  // marcas de copo e a queimadura de cigarro
  for (let i = 0; i < 3; i++) {
    g.strokeStyle = `rgba(105,72,40,${0.22 + r() * 0.2})`;
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(w * (0.2 + r() * 0.6), h * (0.2 + r() * 0.6), 9 + r() * 4, r() * 6, r() * 6 + 3 + r() * 3);
    g.stroke();
  }
  g.fillStyle = "rgba(40,22,10,.85)";
  g.beginPath();
  g.ellipse(w * 0.22, h * 0.62, 6, 3.5, 0.3, 0, Math.PI * 2);
  g.fill();
  grain(g, w, h, r, 8);
}

function drawWood(seed: number, base: string) {
  return (g: CanvasRenderingContext2D, w: number, h: number) => {
    const r = mulberry(seed);
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 50; i++) {
      g.strokeStyle = r() < 0.5 ? `rgba(18,8,3,${0.15 + r() * 0.3})` : `rgba(120,76,42,${0.08 + r() * 0.14})`;
      g.lineWidth = 0.5 + r() * 1.4;
      let x = r() * w;
      g.beginPath();
      g.moveTo(x, 0);
      for (let yy = 0; yy <= h; yy += 8) {
        x += (r() - 0.5) * 2;
        g.lineTo(x + Math.sin(yy * 0.05 + i) * 2, yy);
      }
      g.stroke();
    }
    // frisos verticais do painel
    for (let x = 0; x < w; x += w / 7) {
      g.fillStyle = "rgba(10,5,2,.6)";
      g.fillRect(x, 0, 2, h);
    }
    blotches(g, w, h, r, 6, [20, 10, 4], 1.6, 0.3);
    grain(g, w, h, r, 10);
  };
}

/** Monta a cena no `engine.scene`, posiciona a câmera e prende o tempo. Devolve a remoção. */
export function buildPsxRef(engine: Engine): () => void {
  const { three: T, scene, camera, kit } = engine;
  const root = new T.Group();
  root.name = "psx-ref";
  const geometries: THREE.BufferGeometry[] = [];
  const lights: THREE.Light[] = [];

  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x: number, y: number, z: number, parent: THREE.Object3D = root, cast = false) => {
    geometries.push(geo);
    const m = new T.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  /** Plano subdividido (5 por metro, como o protótipo): o tremor e a textura afim agem nos vértices. */
  const plane = (w: number, h: number, mat: THREE.Material, x: number, y: number, z: number, rx: number, ry: number) => {
    const m = mesh(new T.PlaneGeometry(w, h, Math.max(1, Math.round(w * 5)), Math.max(1, Math.round(h * 5))), mat, x, y, z);
    m.rotation.set(rx, ry, 0, "YXZ");
    return m;
  };
  const box = (w: number, h: number, d: number, mat: THREE.Material | THREE.Material[], x: number, y: number, z: number, cast = true) =>
    mesh(new T.BoxGeometry(w, h, d), mat, x, y, z, root, cast);

  // Piso: ladrilho de 1 m repetido, juntas nas mesmas linhas do protótipo (x, z = ±0,5, ±1,5).
  const floorTex = kit.texture("psx-ref:granilite", drawFloor, 256);
  floorTex.repeat.set(ROOM.w, ROOM.d);
  floorTex.offset.set(0.75, 0.5);
  plane(ROOM.w, ROOM.d, kit.phong({ map: floorTex }), 0, 0, 0, -Math.PI / 2, 0);
  plane(ROOM.w, ROOM.d, kit.phong({ map: kit.texture("psx-ref:teto", drawCeiling, 256) }), 0, ROOM.h, 0, Math.PI / 2, 0);

  // Paredes: norte, sul, oeste, leste (viradas para dentro).
  const walls: [number, number, number, number, number][] = [
    [201, ROOM.w, 0, -ROOM.d / 2, 0],
    [202, ROOM.w, 0, ROOM.d / 2, Math.PI],
    [203, ROOM.d, -ROOM.w / 2, 0, Math.PI / 2],
    [204, ROOM.d, ROOM.w / 2, 0, -Math.PI / 2],
  ];
  for (const [seed, width, x, z, ry] of walls) {
    plane(width, ROOM.h, kit.phong({ map: kit.texture(`psx-ref:parede-${seed}`, drawWall(seed), 256) }), x, ROOM.h / 2, z, 0, ry);
  }
  const skirt = kit.phong({ color: 0x4a4740 });
  box(ROOM.w, 0.08, 0.012, skirt, 0, 0.04, -ROOM.d / 2 + 0.006, false);
  box(0.012, 0.08, ROOM.d, skirt, ROOM.w / 2 - 0.006, 0.04, 0, false);

  // Balcão em L (fórmica, cantoneira de alumínio, frente de madeira), nas medidas do protótipo.
  const formica = kit.texture("psx-ref:formica", drawFormica, 256);
  const panel = kit.phong({ map: kit.texture("psx-ref:painel", drawWood(45, "#36200f"), 256) });
  const wood = kit.phong({ map: kit.texture("psx-ref:madeira", drawWood(41, "#3c2416"), 128) });
  const top = kit.phong({ map: formica });
  const edge = kit.phong({ color: 0xa89a7c });
  const alu = kit.phong({ color: 0x9c9e9c });
  const topMats = [edge, edge, top, edge, edge, edge];
  const sideMats = [wood, panel, wood, wood, panel, panel];
  box(0.56, 0.96, 1.8, sideMats, 1.0, 0.48, -0.7);
  box(0.66, 0.035, 1.9, topMats, 1.0, 0.978, -0.7);
  box(0.012, 0.04, 1.9, alu, 0.668, 0.978, -0.7, false);
  box(0.66, 0.04, 0.012, alu, 1.0, 0.978, 0.252, false);
  box(0.02, 0.1, 1.8, kit.phong({ color: 0x1b1612 }), 0.715, 0.05, -0.7, false);
  box(0.35, 0.96, 0.55, sideMats, 1.475, 0.48, -0.075);
  box(0.4, 0.035, 0.62, topMats, 1.48, 0.978, -0.075);
  box(0.012, 0.04, 0.62, alu, 1.68, 0.978, -0.075, false);

  // Luzes de fundo do protótipo.
  const ambient = new T.AmbientLight(protoColor(T, LIGHTS.ambient.color), LIGHTS.ambient.intensity);
  const hemi = new T.HemisphereLight(protoColor(T, LIGHTS.hemi.sky), protoColor(T, LIGHTS.hemi.ground), LIGHTS.hemi.intensity);
  root.add(ambient, hemi);
  lights.push(ambient, hemi);

  // Luz pendente sobre o balcão: fio, cúpula verde, lâmpada, spot com sombra e um preenchimento.
  const pivot = new T.Group();
  pivot.position.set(0.98, ROOM.h, -0.55);
  root.add(pivot);
  const cylinder = (rt: number, rb: number, h: number, seg: number, open = false) => new T.CylinderGeometry(rt, rb, h, seg, 1, open);
  mesh(cylinder(0.004, 0.004, 0.66, 4), kit.phong({ color: 0x111111 }), 0, -0.33, 0, pivot);
  mesh(cylinder(0.03, 0.16, 0.13, 12, true), kit.phong({ color: 0x2f4a3a, side: T.DoubleSide }), 0, -0.71, 0, pivot);
  mesh(cylinder(0.034, 0.034, 0.04, 8), kit.phong({ color: 0x6a5a40 }), 0, -0.65, 0, pivot);
  const bulb = mesh(new T.SphereGeometry(0.035, 8, 6), kit.basic({ color: 0xffd8a0 }), 0, -0.76, 0, pivot);
  bulb.receiveShadow = false;

  const { lamp: L, fill: F } = LIGHTS;
  const lamp = new T.SpotLight(protoColor(T, L.color), L.intensity, L.distance, L.angle, L.penumbra, L.decay);
  lamp.position.set(0, -0.74, 0);
  const lampTarget = new T.Object3D();
  lampTarget.position.set(0, -3, 0);
  pivot.add(lamp, lampTarget);
  lamp.target = lampTarget;
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(1024, 1024);
  lamp.shadow.bias = -0.0045;
  lamp.shadow.normalBias = 0.045;
  lamp.shadow.camera.near = 0.05;
  lamp.shadow.camera.far = 6;
  const fill = new T.PointLight(protoColor(T, F.color), F.intensity, F.distance, F.decay);
  fill.position.set(0, -0.62, 0);
  pivot.add(fill);
  lights.push(lamp, fill);

  scene.add(root);
  const { x, y, z, yaw, pitch } = PSX_REF_CAMERA;
  camera.position.set(x, y, z);
  camera.rotation.set(pitch, yaw, 0, "YXZ");
  camera.updateMatrixWorld();
  engine.freezeTime(FROZEN_T);

  return () => {
    engine.freezeTime(null);
    scene.remove(root);
    for (const light of lights) light.dispose();
    for (const geo of geometries) geo.dispose();
    geometries.length = 0;
  };
}
