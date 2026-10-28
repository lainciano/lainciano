import type * as THREE from "three";
import { protoColor, type MaterialKit } from "../render/materials";
import { blotches, edgeWear, grain, mulberry, type Draw } from "../render/paint";
import { chamferBox } from "../render/shapes";
import { createHandsAnim, MAX_PRESSES, type HandsInput, type HandsPose, type IdleKind, type PhoneState } from "./handsAnim";

/**
 * Mãos presas à câmera e o corpo que só projeta sombra (T8, rodadas 3 e 4: a lanterna fica NA mão).
 *
 * Empunhadura (mão direita, lanterna para a frente, eixo −z no grupo `grip`): dorso e nós do lado de fora do tubo;
 * os quatro dedos (falanges afiladas, levemente curvas, de seção oval, com nós, pontas redondas e unhas) dão a volta
 * por baixo e sobem pelo lado esquerdo; o polegar sai da base carnuda (tenar), passa por cima em duas falanges e
 * pousa no botão de borracha; a cabeça (sino, aro, refletor e lente) fica à frente do indicador e a tampa de trás,
 * com a argola do cordão, passa do mindinho; pulso afilando para o antebraço, na manga com dobras e costura.
 * Cada falange é tangente ao tubo (polígono circunscrito, com folga para o nó): abraça sem atravessar. Apertar a
 * pegada não fecha mais as juntas (só afrouxar abre); o aperto aparece no polegar.
 * - A `SpotLight` (sombra 512²) sai da cabeça; apagada, intensidade 0 e o mapa de sombra não é redesenhado.
 * - A animação é toda do `handsAnim.ts` (puro); aqui só se aplica a pose (sem alocar por quadro).
 * - Corpo: tronco, braços e pernas com `colorWrite`/`depthWrite` desligados (só a sombra aparece).
 */

export type HandsUpdate = { moving: boolean; run: boolean; bob: number; crouch: boolean; panel: boolean; aiming: boolean };
export type StudioView = { hand: "right" | "left"; angle: "front" | "left" | "right" | "top" };

export type HandsRig = {
  grip: THREE.Group;
  tubeR: number;
  /** Falanges, nós e pontas dos dedos que abraçam o tubo. */
  fingers: THREE.Mesh[];
  thumbTip: THREE.Object3D;
  button: THREE.Object3D;
  flash: THREE.SpotLight;
  /** z (no `grip`) da frente da cabeça. */
  headFront: number;
  /** Triângulos de cada mão (sem a manga e sem a lanterna). */
  triangles: { right: number; left: number };
};

export type Hands = {
  flash: THREE.SpotLight;
  /** Corpo de sombra: o controlador posiciona (pés do jogador, yaw). */
  body: THREE.Group;
  /** Polegar clica o botão; a luz troca logo depois. Barrado com painel/celular aberto (devolve false). */
  toggleFlash(): boolean;
  flashOn(): boolean;
  reach(seconds?: number): void;
  setVisible(visible: boolean): void;
  /** Movimento reduzido em execução (preferência do sistema ou ajuste de balanço). */
  setReduced(v: boolean): void;
  update(dt: number, s: HandsUpdate): void;
  state(): { mode: string; flashOn: boolean; idle: IdleKind; holster: number; light: number; phone: PhoneState; reduced: boolean };
  /**
   * Rig do celular (para a T11): `open` sobe a mão esquerda com o aparelho fechado e o polegar abre a tampa;
   * `close` fecha e desce; `press(tecla)` afunda a tecla e volta. Na 1A o aparelho é um proxy (caixa chanfrada
   * com tampa articulada e teclado), criado no primeiro uso e alcançável só pelo debug.
   */
  phone(action: "open" | "close"): void;
  press(key: string): void;
  debug: {
    setStill(v: boolean): void;
    forceIdle(kind: Exclude<IdleKind, "none">): void;
    step(seconds: number, input: Partial<HandsUpdate>): void;
    /** Fotos: mostra uma mão no meio da tela num ângulo fixo; `null` volta ao normal. */
    view(v: StudioView | null): void;
    rig(): HandsRig;
  };
  dispose(): void;
};

export type HandsOptions = {
  seed: number;
  reduced: boolean;
  still: boolean;
  flashOn: boolean;
  onClick?: () => void;
};

/**
 * Lanterna (valores do protótipo, luz física recalibrada) e a receita de sombra da T6 para um mapa de 512². A
 * intensidade 1,1π do protótipo estourava o círculo em branco a menos de 1 m: 0,7π mantém o círculo legível.
 */
export const FLASH = { color: 0xfff0d8, intensity: 0.7 * Math.PI, distance: 8, angle: 0.42, penumbra: 0.55, decay: 1.2 } as const;
/**
 * `normalBias` 0,005 ≈ 1–1,5 texel a 2–3 m (o 0,03 do protótipo descolava a sombra); paredes oeste e norte de
 * raspão com a lanterna acesa: diferença 0 contra 0,2 (sem acne). `near` 0,1, não o 0,5 da pendente: com 0,5 o que
 * fica a < 0,5 m da lente deixa de barrar a luz (olho a 0,6 m do caderno: a mesa deixa o facho passar e acende a
 * parede atrás; diferença média 0,74). Imagem: `t8-lanterna-near-e-acne.png`.
 */
export const FLASH_SHADOW = { mapSize: 512, near: 0.1, far: 8, bias: -0.0005, normalBias: 0.005 } as const;

/** Lanterna no grupo `grip` (eixo −z para a frente), em metros. */
export const TORCH = {
  r: 0.0165,
  knurl: [-0.02, 0.045],
  band: [-0.046, -0.02],
  head: [-0.092, -0.046],
  headR: 0.024,
  tail: [0.045, 0.058],
  button: { angle: 1.75, z: -0.033 },
} as const;

/** Dedos: posição ao longo do tubo, raio na base e na ponta, falanges (o anelar e o mindinho mais curtos). */
const FINGERS = [
  { z: -0.012, r0: 0.0088, r1: 0.0068, l: [0.04, 0.024, 0.02] },
  { z: 0.006, r0: 0.0091, r1: 0.007, l: [0.044, 0.027, 0.021] },
  { z: 0.023, r0: 0.0086, r1: 0.0066, l: [0.04, 0.024, 0.019] },
  { z: 0.038, r0: 0.0076, r1: 0.0058, l: [0.031, 0.019, 0.016] },
] as const;
const KNUCKLE_ANGLE = -0.7;
/** Escala das mãos no quadro (a silhueta precisa ler no canto sem tapar a cena). */
const HAND_SCALE = 1.12;

/* ------------------------------------------------ pintura (render/paint.ts) */

/** Pele: tom quente com variação, mais escura nas pontas da falange (dobras das juntas). */
const drawSkin: Draw = (g, w, h) => {
  const r = mulberry(900);
  g.fillStyle = "#9a725c";
  g.fillRect(0, 0, w, h);
  blotches(g, w, h, r, 5, [128, 78, 62], 1.4, 0.32);
  blotches(g, w, h, r, 12, [176, 132, 110], 2.2, 0.14);
  for (const [y, a] of [
    [0.04, 0.35],
    [0.96, 0.35],
    [0.12, 0.15],
    [0.88, 0.15],
  ] as const) {
    g.fillStyle = `rgba(78,44,32,${a})`;
    g.fillRect(0, h * y - 1, w, 2);
  }
  grain(g, w, h, r, 8);
};

/** Dorso da mão: pele com os tendões claros e as veias sutis indo dos nós ao pulso. */
const drawSkinBack: Draw = (g, w, h) => {
  drawSkin(g, w, h);
  const r = mulberry(905);
  for (let i = 0; i < 4; i++) {
    const x = w * (0.2 + i * 0.2);
    g.strokeStyle = "rgba(200,160,136,.28)";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x, 0);
    g.quadraticCurveTo(x + (r() - 0.5) * 8, h * 0.5, w * 0.5 + (x - w * 0.5) * 0.35, h);
    g.stroke();
  }
  g.strokeStyle = "rgba(80,70,96,.18)";
  g.lineWidth = 1.4;
  g.beginPath();
  g.moveTo(w * 0.3, h);
  g.bezierCurveTo(w * 0.4, h * 0.6, w * 0.65, h * 0.5, w * 0.7, h * 0.15);
  g.stroke();
};

/** Unha: rosada com a borda livre mais clara. */
const drawNail: Draw = (g, w, h) => {
  g.fillStyle = "#c99e8c";
  g.fillRect(0, 0, w, h);
  g.fillStyle = "rgba(240,224,210,.75)";
  g.fillRect(0, 0, w, h * 0.25);
  g.fillStyle = "rgba(120,70,60,.3)";
  g.fillRect(0, h * 0.92, w, h * 0.08);
};

/** Manga da jaqueta: sarja cinza-escura, sombras de dobra, costura e o punho puído. */
const drawSleeve: Draw = (g, w, h) => {
  const r = mulberry(890);
  g.fillStyle = "#33342f";
  g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      g.fillStyle = ((x >> 1) + (y >> 1)) % 4 < 2 ? "rgba(255,255,255,.04)" : "rgba(0,0,0,.09)";
      g.fillRect(x, y, 2, 2);
    }
  }
  // dobras: faixas escuras e claras oblíquas perto do punho (v baixo)
  for (let i = 0; i < 6; i++) {
    const y = h * (0.05 + i * 0.07 + r() * 0.03);
    g.fillStyle = "rgba(0,0,0,.22)";
    g.fillRect(0, y, w, 2);
    g.fillStyle = "rgba(255,255,255,.06)";
    g.fillRect(0, y + 2, w, 1);
  }
  // costura ao longo da manga
  g.strokeStyle = "rgba(150,146,130,.5)";
  g.setLineDash([2, 2]);
  g.beginPath();
  g.moveTo(w * 0.5, 0);
  g.lineTo(w * 0.5, h);
  g.stroke();
  g.setLineDash([]);
  blotches(g, w, h, r, 6, [0, 0, 0], 1.5, 0.3);
  edgeWear(g, w, h, r, [100, 96, 88], 5, 0.45);
  grain(g, w, h, r, 14);
};

const drawKnurl: Draw = (g, w, h) => {
  const r = mulberry(910);
  g.fillStyle = "#1c1c1e";
  g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 3) {
    for (let x = (y / 3) % 2 ? 0 : 1.5; x < w; x += 3) {
      g.fillStyle = `rgba(150,150,156,${0.18 + r() * 0.16})`;
      g.fillRect(x, y, 1, 1);
    }
  }
  for (let i = 0; i < 18; i++) {
    g.fillStyle = `rgba(170,170,176,${0.12 + r() * 0.2})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 4, 1);
  }
};

const drawAnodized: Draw = (g, w, h) => {
  const r = mulberry(920);
  g.fillStyle = "#202024";
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = `rgba(170,170,178,${0.1 + r() * 0.22})`;
    g.lineWidth = 0.5;
    const x = r() * w;
    const y = r() * h;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 18, y + (r() - 0.5) * 3);
    g.stroke();
  }
  edgeWear(g, w, h, r, [120, 120, 126], 3, 0.6);
};

/* ------------------------------------------------ geometria */

/**
 * Falange afilada (raio r0 na base, r1 na ponta), seção oval, levemente arqueada para o dorso (+y), ao longo de +x
 * de 0 a `len`, aberta nas pontas (o nó e a ponta redonda fecham). 6 lados × 2 anéis = 24 triângulos.
 */
function phalanx(T: typeof THREE, len: number, r0: number, r1: number, bow: number): THREE.BufferGeometry {
  const geo = new T.CylinderGeometry(r1, r0, len, 6, 2, true);
  geo.rotateZ(-Math.PI / 2);
  geo.translate(len / 2, 0, 0);
  const pos = geo.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) / len;
    pos.setY(i, pos.getY(i) + bow * len * 4 * u * (1 - u));
    pos.setZ(i, pos.getZ(i) * 0.88);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Nó/ponta: esfera baixa (5 × 3: 20 triângulos), um pouco achatada. */
function knob(T: typeof THREE, r: number): THREE.BufferGeometry {
  const geo = new T.SphereGeometry(r, 5, 3);
  geo.scale(1, 0.92, 0.88);
  return geo;
}

/** Palma com o dorso arqueado: caixa chanfrada (grade fina) com a face de fora (+x) estufada no meio. */
function palmGeo(T: typeof THREE, w: number, h: number, d: number, out: "x" | "y"): THREE.BufferGeometry {
  const geo = chamferBox(T, w, h, d, { chamfer: 0.008, seg: 40, uv: { mode: "face" } });
  const pos = geo.getAttribute("position");
  const [ha, hb, hc] = out === "x" ? [w / 2, h / 2, d / 2] : [h / 2, w / 2, d / 2];
  for (let i = 0; i < pos.count; i++) {
    const a = out === "x" ? pos.getX(i) : pos.getY(i);
    const b = out === "x" ? pos.getY(i) : pos.getX(i);
    const c = pos.getZ(i);
    if (a < ha * 0.3) continue;
    const bulge = 0.0045 * Math.max(0, 1 - (b / hb) ** 2) * Math.max(0, 1 - (c / hc) ** 2);
    if (out === "x") pos.setX(i, a + bulge);
    else pos.setY(i, a + bulge);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Manga: cone aberto com dobras mais fundas perto do punho. */
function sleeveGeo(T: typeof THREE, r0: number, r1: number, len: number): THREE.BufferGeometry {
  const geo = new T.CylinderGeometry(r1, r0, len, 10, 5, true);
  const pos = geo.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const near = Math.max(0, (len / 2 - y) / len);
    const f = 1 + 0.07 * near * Math.sin(a * 3 + y * 38) + 0.02 * Math.sin(a * 5 - y * 20);
    pos.setX(i, x * f);
    pos.setZ(i, z * f);
  }
  geo.computeVertexNormals();
  return geo;
}

const triangles = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.getAttribute("position").count) / 3;

export function createHands(three: typeof THREE, kit: MaterialKit, camera: THREE.Camera, scene: THREE.Object3D, o: HandsOptions): Hands {
  const T = three;
  const geometries: THREE.BufferGeometry[] = [];
  const g = <G extends THREE.BufferGeometry>(geo: G): G => {
    geometries.push(geo);
    return geo;
  };
  const meshes: THREE.Mesh[] = [];
  let counting: "right" | "left" | null = null;
  const tri = { right: 0, left: 0 };
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const m = new T.Mesh(g(geo), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = false;
    m.receiveShadow = true;
    parent.add(m);
    meshes.push(m);
    if (counting) tri[counting] += triangles(geo);
    return m;
  };
  const cbox = (w: number, h: number, d: number, c: number) => chamferBox(T, w, h, d, { chamfer: c, seg: 20, uv: { mode: "face" } });

  // pele um pouco mais clara e com um leve brilho próprio: a silhueta lê contra o fundo escuro
  const skin = kit.phong({ map: kit.texture("jogador:pele", drawSkin, 64), shininess: 16, specular: 0x1a100c, emissive: 0x120a07 });
  const skinBack = kit.phong({ map: kit.texture("jogador:dorso", drawSkinBack, 64), shininess: 16, specular: 0x1a100c, emissive: 0x120a07 });
  const nail = kit.phong({ map: kit.texture("jogador:unha", drawNail, 64), shininess: 50, emissive: 0x100806 });
  const sleeve = kit.phong({ map: kit.texture("jogador:manga", drawSleeve, 64), shininess: 4, emissive: 0x050505 });
  const cuff = kit.phong({ color: 0x3d3d38, shininess: 4, emissive: 0x050505 });
  const knurl = kit.phong({ map: kit.texture("jogador:lanterna", drawKnurl, 64), shininess: 30 });
  const anodized = kit.phong({ map: kit.texture("jogador:anodizado", drawAnodized, 64), shininess: 45, specular: 0x202024 });
  const rubber = kit.phong({ color: 0x0e0e0e, shininess: 4 });
  const bezel = kit.phong({ color: 0x77777e, specular: 0x404040, shininess: 70 });
  const reflector = kit.phong({ color: 0xb8b4a8, specular: 0x606060, shininess: 90 });
  const lens = kit.basic({ color: 0x4a4740 });

  /* ------------------------------------------------ mão direita com a lanterna */
  const right = new T.Group();
  right.name = "mao-direita";
  right.scale.setScalar(HAND_SCALE);
  camera.add(right);
  const grip = new T.Group();
  right.add(grip);

  const along = Math.PI / 2;
  const tube = (r0: number, r1: number, z0: number, z1: number, mat: THREE.Material, seg = 12, hs = 1) =>
    mesh(new T.CylinderGeometry(r1, r0, z1 - z0, seg, hs), mat, grip, 0, 0, (z0 + z1) / 2, along);
  tube(TORCH.r, TORCH.r, TORCH.knurl[0], TORCH.knurl[1], knurl, 12, 3);
  tube(TORCH.r, TORCH.r, TORCH.band[0], TORCH.band[1], anodized, 12, 2);
  const bellProfile = [
    [TORCH.r, 0],
    [TORCH.r + 0.0008, 0.012],
    [TORCH.headR - 0.001, 0.034],
    [TORCH.headR, TORCH.head[1] - TORCH.head[0]],
  ].map(([r, y]) => new T.Vector2(r, y));
  mesh(new T.LatheGeometry(bellProfile, 14), anodized, grip, 0, 0, TORCH.head[1], -along);
  mesh(new T.TorusGeometry(TORCH.headR - 0.0015, 0.0022, 6, 18), bezel, grip, 0, 0, TORCH.head[0]);
  mesh(new T.RingGeometry(0.0075, TORCH.headR - 0.003, 16), reflector, grip, 0, 0, TORCH.head[0] + 0.0012, 0, Math.PI);
  mesh(new T.CircleGeometry(0.0078, 12), lens, grip, 0, 0, TORCH.head[0] + 0.0008, 0, Math.PI);
  tube(TORCH.r + 0.001, TORCH.r + 0.001, TORCH.tail[0], TORCH.tail[1], anodized, 12, 1);
  mesh(new T.TorusGeometry(0.0055, 0.0013, 5, 10), bezel, grip, 0, -0.004, TORCH.tail[1] + 0.004, 0, Math.PI / 2);
  const btn = new T.Group();
  const ba = TORCH.button.angle;
  btn.position.set(Math.cos(ba) * TORCH.r, Math.sin(ba) * TORCH.r, TORCH.button.z);
  btn.rotation.z = ba - Math.PI / 2;
  grip.add(btn);
  mesh(cbox(0.013, 0.004, 0.02, 0.0012), anodized, btn, 0, 0.0015, 0);
  const dome = mesh(new T.SphereGeometry(0.0055, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), rubber, btn, 0, 0.0034, 0);
  dome.scale.set(1, 0.55, 1.25);

  const flash = new T.SpotLight(protoColor(T, FLASH.color), 0, FLASH.distance, FLASH.angle, FLASH.penumbra, FLASH.decay);
  flash.name = "lanterna";
  flash.position.set(0, 0, TORCH.head[0] - 0.005);
  const flashTarget = new T.Object3D();
  flashTarget.position.set(0, 0, -3);
  grip.add(flash, flashTarget);
  flash.target = flashTarget;
  flash.castShadow = true;
  flash.shadow.mapSize.set(FLASH_SHADOW.mapSize, FLASH_SHADOW.mapSize);
  flash.shadow.bias = FLASH_SHADOW.bias;
  flash.shadow.normalBias = FLASH_SHADOW.normalBias;
  flash.shadow.camera.near = FLASH_SHADOW.near;
  flash.shadow.camera.far = FLASH_SHADOW.far;
  flash.shadow.autoUpdate = false;

  counting = "right";
  const handR = new T.Group();
  grip.add(handR);
  const palmAngle = 0.05;
  const palmR = TORCH.r + 0.0145;
  mesh(palmGeo(T, 0.028, 0.046, 0.088, "x"), skinBack, handR, Math.cos(palmAngle) * palmR, Math.sin(palmAngle) * palmR, 0.008, 0, 0, palmAngle);

  type Chain = { joints: THREE.Group[]; bends: number[] };
  const chains: Chain[] = [];
  const fingerMeshes: THREE.Mesh[] = [];
  for (const f of FINGERS) {
    // folga: o nó (1,06·r0) também fica fora do tubo
    const d = TORCH.r + f.r0 * 1.06 + 0.0004;
    const alphas = f.l.map((l) => 2 * Math.atan(l / (2 * d)));
    const kr = d / Math.cos(alphas[0] / 2);
    const root = new T.Group();
    root.position.set(Math.cos(KNUCKLE_ANGLE) * kr, Math.sin(KNUCKLE_ANGLE) * kr, f.z);
    root.rotation.z = KNUCKLE_ANGLE - alphas[0] / 2 - Math.PI / 2;
    handR.add(root);
    const joints: THREE.Group[] = [];
    let parent: THREE.Object3D = root;
    let r: number = f.r0;
    f.l.forEach((l, i) => {
      if (i > 0) {
        const joint = new T.Group();
        joint.position.set(f.l[i - 1], 0, 0);
        parent.add(joint);
        joints.push(joint);
        parent = joint;
      }
      const rEnd = f.r0 + ((f.r1 - f.r0) * (i + 1)) / 3;
      fingerMeshes.push(mesh(knob(T, r * 1.06), skin, parent));
      fingerMeshes.push(mesh(phalanx(T, l, r, rEnd, 0.06), skin, parent));
      if (i === 2) {
        fingerMeshes.push(mesh(knob(T, rEnd * 1.02), skin, parent, l));
        mesh(new T.BoxGeometry(l * 0.5, 0.0016, rEnd * 1.25), nail, parent, l * 0.66, rEnd * 0.92, 0);
      }
      r = rEnd;
    });
    chains.push({ joints, bends: alphas.slice(1).map((a, i) => -(alphas[i] + a) / 2) });
  }

  // polegar: base carnuda (tenar) no alto da palma, duas falanges por cima do tubo até o botão
  const thumbBase = new T.Vector3(Math.cos(0.75) * (TORCH.r + 0.016), Math.sin(0.75) * (TORCH.r + 0.016), 0.012);
  const thenar = mesh(knob(T, 0.013), skin, handR, thumbBase.x + 0.004, thumbBase.y - 0.004, thumbBase.z + 0.008);
  thenar.scale.set(1.25, 0.95, 1.6);
  const thumbGeo = (r0: number, r1: number) => {
    const geo = phalanx(T, 1, r0, r1, 0.05);
    geo.rotateY(-Math.PI / 2);
    return geo;
  };
  const thumbProx = mesh(thumbGeo(0.0098, 0.0088), skin, handR);
  const thumbDist = mesh(thumbGeo(0.0088, 0.0074), skin, handR);
  const thumbJoint = mesh(knob(T, 0.0098), skin, handR);
  const thumbTip = mesh(knob(T, 0.0076), skin, handR);
  const thumbNail = mesh(new T.BoxGeometry(0.011, 0.0016, 0.011), nail, handR);
  counting = null;

  const target = new T.Vector3();
  const thumbMid = new T.Vector3(Math.cos(1.2) * (TORCH.r + 0.017), Math.sin(1.2) * (TORCH.r + 0.017), -0.012);
  const tipPos = new T.Vector3();
  const tipDir = new T.Vector3();
  /** Liga dois pontos com uma falange (geometria de comprimento 1 ao longo de +z). */
  const bone = (m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) => {
    m.position.copy(a);
    m.scale.set(1, 1, a.distanceTo(b));
    m.lookAt(target.copy(b).applyMatrix4(handR.matrixWorld));
  };
  const placeThumb = (press: number) => {
    const tipR = TORCH.r + 0.0062 + 0.0074 - press * 0.002;
    tipPos.set(Math.cos(ba) * tipR, Math.sin(ba) * tipR, TORCH.button.z - 0.004);
    handR.updateWorldMatrix(true, false);
    bone(thumbProx, thumbBase, thumbMid);
    bone(thumbDist, thumbMid, tipPos);
    thumbJoint.position.copy(thumbMid);
    thumbTip.position.copy(tipPos);
    // unha no dorso da ponta, voltada para fora do tubo
    tipDir.set(Math.cos(ba), Math.sin(ba), 0);
    thumbNail.position.copy(tipPos).addScaledVector(tipDir, 0.0068);
    thumbNail.rotation.set(0, 0, ba - Math.PI / 2);
    dome.position.y = 0.0034 - press * 0.0015;
  };

  // pulso afilando para o antebraço, punho e manga (atrás, abaixo e à direita, sem encostar na tampa)
  const wrist = new T.Group();
  wrist.position.set(0.044, -0.026, 0.064);
  wrist.lookAt(0.044 + 0.25, -0.026 - 0.38, 0.064 + 1);
  handR.add(wrist);
  mesh(new T.CylinderGeometry(0.0225, 0.027, 0.06, 8, 1, true), skin, wrist, 0, 0, 0.004, along);
  mesh(new T.CylinderGeometry(0.0465, 0.048, 0.034, 10, 1, true), cuff, wrist, 0, 0, 0.045, along);
  mesh(sleeveGeo(T, 0.044, 0.052, 0.32), sleeve, wrist, 0, 0, 0.2, along);

  /* ------------------------------------------------ mão esquerda (livre, relaxada) */
  const left = new T.Group();
  left.name = "mao-esquerda";
  left.scale.setScalar(HAND_SCALE);
  camera.add(left);
  const handL = new T.Group();
  left.add(handL);
  mesh(sleeveGeo(T, 0.044, 0.052, 0.34), sleeve, handL, 0, -0.004, 0.21, along);
  mesh(new T.CylinderGeometry(0.0475, 0.048, 0.035, 10, 1, true), cuff, handL, 0, -0.004, 0.035, along);
  counting = "left";
  mesh(new T.CylinderGeometry(0.026, 0.03, 0.03, 8, 1, true), skin, handL, 0, -0.002, 0.005, along);
  mesh(palmGeo(T, 0.076, 0.03, 0.082, "y"), skinBack, handL, 0, 0, -0.035);
  const leftChains: THREE.Group[][] = [];
  for (let i = 0; i < 4; i++) {
    const f = FINGERS[i];
    const base = new T.Group();
    base.position.set((i - 1.5) * -0.0185, 0.002, -0.074);
    handL.add(base);
    const chain: THREE.Group[] = [base];
    let parent: THREE.Object3D = base;
    let r: number = f.r0;
    f.l.forEach((l, k) => {
      const len = l * 0.86;
      if (k > 0) {
        const joint = new T.Group();
        joint.position.set(0, 0, -f.l[k - 1] * 0.86);
        parent.add(joint);
        chain.push(joint);
        parent = joint;
      }
      const rEnd = f.r0 + ((f.r1 - f.r0) * (k + 1)) / 3;
      mesh(knob(T, r * 1.05), skin, parent);
      const geo = phalanx(T, len, r, rEnd, 0.06);
      geo.rotateY(Math.PI / 2);
      mesh(geo, skin, parent);
      if (k === 2) {
        mesh(knob(T, rEnd), skin, parent, 0, 0, -len);
        mesh(new T.BoxGeometry(rEnd * 1.25, 0.0016, len * 0.5), nail, parent, 0, rEnd * 0.92, -len * 0.66);
      }
      r = rEnd;
    });
    leftChains.push(chain);
  }
  // polegar da esquerda: do lado de dentro (+x), com a base carnuda
  const lThumb = new T.Group();
  lThumb.position.set(0.036, -0.004, -0.028);
  lThumb.rotation.y = -0.6;
  handL.add(lThumb);
  const lThenar = mesh(knob(T, 0.012), skin, handL, 0.03, -0.004, -0.018);
  lThenar.scale.set(1.2, 0.9, 1.6);
  const lThumbProx = thumbGeo(0.0095, 0.0086);
  lThumbProx.scale(1, 1, 0.028);
  lThumbProx.rotateY(Math.PI);
  mesh(lThumbProx, skin, lThumb);
  const lThumbTip = new T.Group();
  lThumbTip.position.set(0, 0, -0.028);
  lThumb.add(lThumbTip);
  const lThumbDist = thumbGeo(0.0086, 0.0072);
  lThumbDist.scale(1, 1, 0.024);
  lThumbDist.rotateY(Math.PI);
  mesh(lThumbDist, skin, lThumbTip);
  mesh(knob(T, 0.0074), skin, lThumbTip, 0, 0, -0.024);
  counting = null;
  const LEFT_BENDS = [0.6, 0.9, 0.7] as const;
  const curlLeft = (k: number, thumb: number) => {
    for (let c = 0; c < leftChains.length; c++) {
      const chain = leftChains[c];
      for (let i = 0; i < chain.length; i++) chain[i].rotation.x = -k * LEFT_BENDS[i];
    }
    lThumb.rotation.x = -k * 0.4 + thumb * 0.55;
    lThumb.rotation.z = -thumb * 0.25;
    lThumbTip.rotation.x = -k * 0.5 - thumb * 0.3;
  };

  /* ------------------------------------------------ celular (proxy da T11, nasce no primeiro uso) */
  const PHONE_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];
  type PhoneRig = { root: THREE.Group; hinge: THREE.Group; keys: { key: string; mesh: THREE.Mesh }[] };
  let phoneRig: PhoneRig | null = null;
  const buildPhone = (): PhoneRig => {
    const plastic = kit.phong({ color: 0x3a3d43, shininess: 30 });
    const keyMat = kit.phong({ color: 0x8a9096, shininess: 20 });
    const screen = kit.basic({ color: 0x1a2a28 });
    const root = new T.Group();
    root.name = "celular-proxy";
    root.position.set(0.004, 0.026, -0.07);
    root.rotation.x = 1.0;
    handL.add(root);
    mesh(cbox(0.046, 0.012, 0.086, 0.003), plastic, root, 0, 0.006, 0);
    const keys = PHONE_KEYS.map((key, i) => ({ key, mesh: mesh(cbox(0.01, 0.003, 0.0065, 0.001), keyMat, root, ((i % 3) - 1) * 0.013, 0.0135, 0.008 + Math.floor(i / 3) * 0.011) }));
    const hinge = new T.Group();
    hinge.position.set(0, 0.012, -0.043);
    root.add(hinge);
    mesh(cbox(0.046, 0.009, 0.064, 0.003), plastic, hinge, 0, 0.0045, 0.032);
    mesh(cbox(0.036, 0.0012, 0.044, 0.0004), screen, hinge, 0, -0.0006, 0.03);
    mesh(new T.CylinderGeometry(0.0045, 0.0045, 0.03, 8), plastic, hinge, 0, 0, 0, 0, 0, Math.PI / 2);
    return { root, hinge, keys };
  };

  /* ------------------------------------------------ corpo de sombra */
  const ghost = kit.basic({ colorWrite: false, depthWrite: false });
  const body = new T.Group();
  body.name = "corpo-sombra";
  scene.add(body);
  const caster = (w: number, h: number, d: number, x: number, y: number, z: number, parent: THREE.Object3D = body) => {
    const m = new T.Mesh(g(new T.BoxGeometry(w, h, d)), ghost);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = false;
    parent.add(m);
    return m;
  };
  caster(0.36, 0.56, 0.2, 0, 1.17, 0.14);
  caster(0.16, 0.2, 0.16, 0, 1.56, 0.12);
  for (const x of [-0.225, 0.225]) caster(0.085, 0.5, 0.1, x, 1.15, 0.12);
  const legs: THREE.Group[] = [];
  for (const x of [-0.1, 0.1]) {
    const leg = new T.Group();
    leg.position.set(x, 0.9, 0.08);
    body.add(leg);
    caster(0.13, 0.86, 0.14, 0, -0.43, 0, leg);
    caster(0.11, 0.07, 0.27, 0, -0.865, -0.06, leg);
    legs.push(leg);
  }

  /* ------------------------------------------------ aplicar a pose (sem alocar) */
  let reduced = o.reduced;
  const anim = createHandsAnim({ seed: o.seed, reduced: o.reduced, still: o.still, flashOn: o.flashOn });
  let visible = true;
  let lastLight = -1;
  let studio: StudioView | null = null;
  const STUDIO_ROT: Record<StudioView["angle"], [number, number]> = { front: [0.15, Math.PI], left: [0.1, Math.PI / 2], right: [0.1, -Math.PI / 2], top: [1.25, 0] };
  const lensOn = protoColor(T, 0xfff4dc);
  const lensOff = protoColor(T, 0x4a4740);
  const apply = (pose: HandsPose) => {
    const r = pose.right;
    right.position.set(r.x, r.y, r.z);
    right.rotation.set(r.rx, r.ry, r.rz, "XYZ");
    // só afrouxar mexe nas juntas (abre); apertar fica no polegar, para nenhum dedo atravessar o tubo
    const k = 1 + 0.35 * Math.min(0, pose.grip);
    for (let c = 0; c < chains.length; c++) {
      const ch = chains[c];
      for (let i = 0; i < ch.joints.length; i++) ch.joints[i].rotation.z = ch.bends[i] * k;
    }
    placeThumb(Math.max(pose.thumb, 0.3 * Math.max(0, pose.grip)));
    const l = pose.left;
    left.position.set(l.x, l.y, l.z);
    left.rotation.set(l.rx, l.ry, l.rz, "XYZ");
    curlLeft(l.curl, pose.phone.thumb);
    left.visible = l.y > -0.52;
    if (studio) {
      const [rx, ry] = STUDIO_ROT[studio.angle];
      const g2 = studio.hand === "right" ? right : left;
      g2.position.set(0, -0.02, -0.3);
      g2.rotation.set(rx, ry, 0, "YXZ");
      g2.visible = true;
      (studio.hand === "right" ? left : right).visible = false;
    } else right.visible = true;
    if (pose.phone.visible && !phoneRig) phoneRig = buildPhone();
    if (phoneRig) {
      phoneRig.root.visible = pose.phone.visible;
      phoneRig.hinge.rotation.x = -pose.phone.lid * 2.88;
      for (let i = 0; i < phoneRig.keys.length; i++) {
        const key = phoneRig.keys[i];
        let depth = 0;
        for (let p = 0; p < MAX_PRESSES; p++) if (pose.phone.presses[p].key === key.key) depth = pose.phone.presses[p].depth;
        key.mesh.position.y = 0.0135 - depth * 0.0018;
      }
    }
    if (pose.light !== lastLight) {
      lastLight = pose.light;
      flash.intensity = FLASH.intensity * pose.light;
      flash.shadow.autoUpdate = pose.light > 0;
      flash.shadow.needsUpdate = pose.light > 0;
      lens.color.copy(pose.light > 0 ? lensOn : lensOff);
    }
  };
  const inp: HandsInput = { moving: false, run: false, crouch: false, panel: false, aiming: false, bob: 0 };
  const fill = (s: Partial<HandsUpdate>) => {
    inp.moving = s.moving ?? false;
    inp.run = s.run ?? false;
    inp.crouch = s.crouch ?? false;
    inp.panel = s.panel ?? false;
    inp.aiming = s.aiming ?? false;
    inp.bob = s.bob ?? 0;
    return inp;
  };
  apply(anim.step(0, fill({})).pose);

  return {
    flash,
    body,
    toggleFlash: () => anim.toggleFlash(),
    flashOn: () => anim.state().flashOn,
    reach: (seconds) => anim.reach(seconds),
    phone: (action) => anim.phone(action),
    press: (key) => anim.press(key),
    setReduced(v) {
      reduced = v;
      anim.setReduced(v);
    },
    setVisible(v) {
      visible = v;
      for (const m of meshes) m.visible = v;
    },
    update(dt, s) {
      const out = anim.step(dt, fill(s));
      if (o.onClick && out.events.includes("click")) o.onClick();
      apply(out.pose);
      const swing = s.moving && !reduced && !o.still ? Math.sin(s.bob) * (s.run ? 0.5 : 0.32) : 0;
      legs[0].rotation.x = swing;
      legs[1].rotation.x = -swing;
      body.scale.y += ((s.crouch ? 0.64 : 1) - body.scale.y) * Math.min(1, dt * 6);
    },
    state: () => anim.state(),
    debug: {
      setStill: (v) => anim.setStill(v),
      forceIdle: (kind) => anim.forceIdle(kind),
      step(seconds, s) {
        fill(s);
        for (let t = 0; t < seconds - 1e-9; t += 1 / 60) apply(anim.step(1 / 60, inp).pose);
      },
      view(v) {
        studio = v;
        apply(anim.step(0, inp).pose);
        if (!v) for (const m of meshes) m.visible = visible;
      },
      rig: () => ({ grip, tubeR: TORCH.r, fingers: fingerMeshes, thumbTip, button: dome, flash, headFront: TORCH.head[0], triangles: { ...tri } }),
    },
    dispose() {
      right.removeFromParent();
      left.removeFromParent();
      body.removeFromParent();
      flash.dispose();
      for (const geo of geometries) geo.dispose();
      geometries.length = 0;
    },
  };
}
