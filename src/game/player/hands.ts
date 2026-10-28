import type * as THREE from "three";
import { protoColor, type MaterialKit } from "../render/materials";
import { blotches, edgeWear, grain, mulberry, type Draw } from "../render/paint";
import { chamferBox } from "../render/shapes";
import { createHandsAnim, type HandsInput, type HandsPose, type IdleKind, type PhoneState } from "./handsAnim";

/**
 * Mãos presas à câmera e o corpo que só projeta sombra (rodada 3 da T8: a lanterna fica NA mão).
 *
 * Empunhadura (mão direita, lanterna apontada para a frente, eixo −z no grupo `grip`): o dorso e a fileira dos
 * nós ficam do lado de fora (direita) do tubo; os quatro dedos, em três falanges cada, dão a volta por baixo e
 * sobem pelo lado esquerdo, com as pontas perto do polegar; o polegar passa por cima e pousa no botão de borracha
 * do corpo; a cabeça (sino, aro e lente) fica à frente do indicador e a tampa de trás, com a argola do cordão,
 * passa do mindinho; o pulso e o antebraço ficam atrás, abaixo e à direita, sem encostar no tubo.
 * Os dedos são polígonos circunscritos ao tubo (cada falange tangente a ele): abraçam sem atravessar; apertar e
 * afrouxar só mudam as dobras das juntas.
 * - A `SpotLight` (sombra 512²) sai da cabeça da lanterna, na mão. Apagada: intensidade 0 e o mapa de sombra não
 *   é redesenhado (`autoUpdate` falso), sem trocar programa de material.
 * - Toda a animação é da máquina pura `handsAnim.ts`; aqui só se aplica a pose a grupos montados uma vez.
 * - Corpo: tronco, braços e pernas com `colorWrite`/`depthWrite` desligados (só a sombra aparece).
 */

export type HandsUpdate = { moving: boolean; run: boolean; bob: number; crouch: boolean; panel: boolean; aiming: boolean };

export type Hands = {
  flash: THREE.SpotLight;
  /** Corpo de sombra: o controlador posiciona (pés do jogador, yaw). */
  body: THREE.Group;
  /** Polegar clica o botão; a luz troca logo depois. */
  toggleFlash(): void;
  flashOn(): boolean;
  /** A mão esquerda sobe para alcançar por `seconds`. */
  reach(seconds?: number): void;
  setVisible(visible: boolean): void;
  update(dt: number, s: HandsUpdate): void;
  state(): { mode: string; flashOn: boolean; idle: IdleKind; holster: number; light: number; phone: PhoneState };
  /**
   * Rig do celular (para a T11): `open` sobe a mão esquerda com o aparelho fechado e o polegar abre a tampa;
   * `close` fecha e desce; `press(tecla)` afunda a tecla e volta. Na 1A o aparelho é um proxy (caixa chanfrada
   * com tampa articulada e teclado), criado só no primeiro uso e alcançável só pelo debug.
   */
  phone(action: "open" | "close"): void;
  press(key: string): void;
  /** Debug (fotos): solta o `still`, força uma ociosa ou avança a animação com entradas dadas. */
  debug: {
    setStill(v: boolean): void;
    forceIdle(kind: Exclude<IdleKind, "none">): void;
    step(seconds: number, input: Partial<HandsUpdate>): void;
    /** Fotos: mostra a mão direita no meio da tela, de frente (lente) ou de um lado; `null` volta ao normal. */
    view(v: "front" | "side-left" | "side-right" | null): void;
  };
  dispose(): void;
};

export type HandsOptions = {
  seed: number;
  /** Movimento reduzido (ou balanço desligado nos ajustes): sem ociosa nem balanço, trocas em ≤ 120 ms. */
  reduced: boolean;
  /** Foto de referência: nada anda sozinho. */
  still: boolean;
  flashOn: boolean;
  /** Tique do botão (som). Opcional: sem ele, nada toca. */
  onClick?: () => void;
};

/**
 * Lanterna (valores do protótipo, luz física recalibrada) e a receita de sombra da T6 para um mapa de 512². A
 * intensidade 1,1π do protótipo estourava o círculo em branco a menos de 1 m (foto de perto da porta e do armário):
 * 0,7π mantém o círculo legível de perto e ainda ilumina a 3 m.
 */
export const FLASH = { color: 0xfff0d8, intensity: 0.7 * Math.PI, distance: 8, angle: 0.42, penumbra: 0.55, decay: 1.2 } as const;
/**
 * Receptores típicos a 1–3 m: texel ≈ 2·d·tan 0,42/512 ≈ 1,7–5,2 mm; `normalBias` 0,005 ≈ 1–1,5 texel a 2–3 m
 * (o 0,03 do protótipo descolava a sombra do objeto, peter-panning). Medido na T8: a lanterna varrendo as paredes
 * oeste e norte de raspão dá diferença 0 contra normalBias 0,2 (sem acne).
 * `near` 0,1, e não o 0,5 da pendente: lá o 0,5 tira a cúpula e a lâmpada do mapa; aqui não há nada atrás da lente
 * (a mão está atrás dela). Com 0,5, o que fica a menos de 0,5 m da lente deixa de barrar a luz: com o olho a
 * 0,6 m do caderno, o tampo da mesa deixa o facho passar e acende a parede atrás (diferença média 0,74; 1,5 % dos
 * pixels > 12 níveis; a 0,75 m, 0,40; a 1,1 m, 0). Imagem: `t8-lanterna-near-e-acne.png` no relatório.
 */
export const FLASH_SHADOW = { mapSize: 512, near: 0.1, far: 8, bias: -0.0005, normalBias: 0.005 } as const;

/** Lanterna no grupo `grip` (eixo −z para a frente), em metros. */
const TORCH = {
  r: 0.0165,
  /** Corpo recartilhado: do botão para trás, onde os dedos fecham. */
  knurl: [-0.02, 0.045],
  /** Faixa lisa do botão. */
  band: [-0.046, -0.02],
  /** Cabeça em sino até o aro. */
  head: [-0.092, -0.046],
  headR: 0.024,
  /** Tampa de trás. */
  tail: [0.045, 0.058],
  /** Botão no alto da faixa, um pouco para a esquerda (onde o polegar pousa). */
  button: { angle: 1.75, z: -0.033 },
} as const;

/** Dedos: posição ao longo do tubo, espessura e as três falanges (proximal, média, distal). */
const FINGERS = [
  { z: -0.012, t: 0.0175, l: [0.04, 0.024, 0.02] },
  { z: 0.006, t: 0.018, l: [0.044, 0.027, 0.021] },
  { z: 0.023, t: 0.017, l: [0.041, 0.025, 0.02] },
  { z: 0.038, t: 0.015, l: [0.032, 0.02, 0.017] },
] as const;
/** Ângulo (rad, no plano xy do tubo; 0 = direita, π/2 = cima) onde a fileira dos nós começa. */
const KNUCKLE_ANGLE = -0.7;

const drawSleeve: Draw = (g, w, h) => {
  const r = mulberry(890);
  g.fillStyle = "#2b2c28";
  g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      g.fillStyle = ((x >> 1) + (y >> 1)) % 4 < 2 ? "rgba(255,255,255,.035)" : "rgba(0,0,0,.08)";
      g.fillRect(x, y, 2, 2);
    }
  }
  blotches(g, w, h, r, 6, [0, 0, 0], 1.5, 0.3);
  edgeWear(g, w, h, r, [86, 84, 78], 4, 0.35);
  grain(g, w, h, r, 14);
};

/** Pele: tom quente, mais escuro nas dobras (a textura corre ao longo do dedo). */
const drawSkin: Draw = (g, w, h) => {
  const r = mulberry(900);
  g.fillStyle = "#8c6652";
  g.fillRect(0, 0, w, h);
  blotches(g, w, h, r, 5, [120, 70, 56], 1.4, 0.3);
  for (const y of [0.18, 0.82]) {
    g.fillStyle = "rgba(70,40,30,.28)";
    g.fillRect(0, h * y, w, 1.5);
  }
  grain(g, w, h, r, 8);
};

/** Corpo da lanterna: alumínio anodizado preto recartilhado, gasto onde a mão pega. */
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
  // brilho do alumínio onde o anodizado gastou
  for (let i = 0; i < 18; i++) {
    g.fillStyle = `rgba(170,170,176,${0.12 + r() * 0.2})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 4, 1);
  }
};

/** Anodizado liso com arranhões finos e a borda do aro gasta até o metal. */
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

export function createHands(three: typeof THREE, kit: MaterialKit, camera: THREE.Camera, scene: THREE.Object3D, o: HandsOptions): Hands {
  const T = three;
  const geometries: THREE.BufferGeometry[] = [];
  const g = <G extends THREE.BufferGeometry>(geo: G): G => {
    geometries.push(geo);
    return geo;
  };
  const meshes: THREE.Mesh[] = [];
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const m = new T.Mesh(g(geo), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = false;
    m.receiveShadow = true;
    parent.add(m);
    meshes.push(m);
    return m;
  };
  const cbox = (w: number, h: number, d: number, c: number) => chamferBox(T, w, h, d, { chamfer: c, seg: 20, uv: { mode: "face" } });

  const sleeve = kit.phong({ map: kit.texture("jogador:manga", drawSleeve, 64), shininess: 4 });
  const cuff = kit.phong({ color: 0x3a3a35, shininess: 4 });
  const skin = kit.phong({ map: kit.texture("jogador:pele", drawSkin, 64), shininess: 14, specular: 0x140c08 });
  const nail = kit.phong({ color: 0xb08878, shininess: 40 });
  const knurl = kit.phong({ map: kit.texture("jogador:lanterna", drawKnurl, 64), shininess: 30 });
  const anodized = kit.phong({ map: kit.texture("jogador:anodizado", drawAnodized, 64), shininess: 45, specular: 0x202024 });
  const rubber = kit.phong({ color: 0x0e0e0e, shininess: 4 });
  const bezel = kit.phong({ color: 0x77777e, specular: 0x404040, shininess: 70 });
  const reflector = kit.phong({ color: 0xb8b4a8, specular: 0x606060, shininess: 90 });
  const lens = kit.basic({ color: 0x4a4740 });

  /* ------------------------------------------------ mão direita com a lanterna */
  const right = new T.Group();
  right.name = "mao-direita";
  camera.add(right);
  const grip = new T.Group();
  right.add(grip);

  // lanterna (cilindros com o eixo y girado para z)
  const along = Math.PI / 2;
  const tube = (r0: number, r1: number, z0: number, z1: number, mat: THREE.Material, seg = 12, hs = 1) =>
    mesh(new T.CylinderGeometry(r1, r0, z1 - z0, seg, hs), mat, grip, 0, 0, (z0 + z1) / 2, along);
  tube(TORCH.r, TORCH.r, TORCH.knurl[0], TORCH.knurl[1], knurl, 12, 3);
  tube(TORCH.r, TORCH.r, TORCH.band[0], TORCH.band[1], anodized, 12, 2);
  // sino da cabeça: perfil de baixo para cima (a lathe olha para fora) e girado para a boca larga ir à frente
  const bell = [
    [TORCH.r, 0],
    [TORCH.r + 0.0008, 0.012],
    [TORCH.headR - 0.001, 0.034],
    [TORCH.headR, TORCH.head[1] - TORCH.head[0]],
  ].map(([r, y]) => new T.Vector2(r, y));
  mesh(new T.LatheGeometry(bell, 14), anodized, grip, 0, 0, TORCH.head[1], -along);
  mesh(new T.TorusGeometry(TORCH.headR - 0.0015, 0.0022, 6, 18), bezel, grip, 0, 0, TORCH.head[0]);
  // refletor (anel metálico) e a lente por dentro do aro
  mesh(new T.RingGeometry(0.0075, TORCH.headR - 0.003, 16), reflector, grip, 0, 0, TORCH.head[0] + 0.0012, 0, Math.PI);
  mesh(new T.CircleGeometry(0.0078, 12), lens, grip, 0, 0, TORCH.head[0] + 0.0008, 0, Math.PI);
  // tampa de trás com a argola do cordão
  tube(TORCH.r + 0.001, TORCH.r + 0.001, TORCH.tail[0], TORCH.tail[1], anodized, 12, 1);
  mesh(new T.TorusGeometry(0.0055, 0.0013, 5, 10), bezel, grip, 0, -0.004, TORCH.tail[1] + 0.004, 0, Math.PI / 2);
  // botão: base chanfrada e a cúpula de borracha, no alto da faixa
  const btn = new T.Group();
  const ba = TORCH.button.angle;
  btn.position.set(Math.cos(ba) * TORCH.r, Math.sin(ba) * TORCH.r, TORCH.button.z);
  btn.rotation.z = ba - Math.PI / 2;
  grip.add(btn);
  mesh(cbox(0.013, 0.004, 0.02, 0.0012), anodized, btn, 0, 0.0015, 0);
  const dome = mesh(new T.SphereGeometry(0.0055, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), rubber, btn, 0, 0.0034, 0);
  dome.scale.set(1, 0.55, 1.25);

  // a luz sai da cabeça
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

  // dorso e palma do lado de fora do tubo
  const handR = new T.Group();
  grip.add(handR);
  const palmAngle = 0.05;
  const palmR = TORCH.r + 0.0145;
  const palm = mesh(cbox(0.028, 0.046, 0.088, 0.008), skin, handR, Math.cos(palmAngle) * palmR, Math.sin(palmAngle) * palmR, 0.008, 0, 0, palmAngle);
  palm.name = "palma";

  // dedos: polígono circunscrito ao tubo (cada falange tangente a ele no meio)
  type Chain = { root: THREE.Group; joints: THREE.Group[]; bends: number[] };
  const chains: Chain[] = [];
  for (const f of FINGERS) {
    const d = TORCH.r + f.t / 2 + 0.0004;
    const alphas = f.l.map((l) => 2 * Math.atan(l / (2 * d)));
    const k0 = KNUCKLE_ANGLE;
    const kr = d / Math.cos(alphas[0] / 2);
    const root = new T.Group();
    root.position.set(Math.cos(k0) * kr, Math.sin(k0) * kr, f.z);
    // direção da 1ª falange: tangente no meio dela, girando no sentido horário (para baixo e para a esquerda)
    root.rotation.z = k0 - alphas[0] / 2 - Math.PI / 2;
    handR.add(root);
    // nó do dedo (articulação saliente)
    mesh(cbox(0.016, f.t + 0.004, f.t + 0.002, 0.005), skin, root, 0.004, 0.002, 0);
    const joints: THREE.Group[] = [];
    let parent: THREE.Object3D = root;
    f.l.forEach((l, i) => {
      if (i > 0) {
        const joint = new T.Group();
        joint.position.set(f.l[i - 1], 0, 0);
        parent.add(joint);
        joints.push(joint);
        parent = joint;
      }
      mesh(cbox(l, f.t * (1 - i * 0.05), f.t * (1 - i * 0.06), 0.0045), skin, parent, l / 2, 0, 0);
      if (i === 2) mesh(cbox(l * 0.55, 0.0022, f.t * 0.62, 0.0008), nail, parent, l * 0.62, -f.t / 2 + 0.0008, 0);
    });
    const bends = alphas.slice(1).map((a, i) => -(alphas[i] + a) / 2);
    chains.push({ root, joints, bends });
  }

  // polegar: da base (eminência tenar, alto da palma) por cima do tubo até o botão
  const thumbBase = new T.Vector3(Math.cos(0.75) * (TORCH.r + 0.016), Math.sin(0.75) * (TORCH.r + 0.016), 0.012);
  const thumbProx = mesh(cbox(0.02, 0.018, 1, 0.006), skin, handR);
  const thumbDist = mesh(cbox(0.018, 0.016, 1, 0.006), skin, handR);
  const thumbNail = mesh(cbox(0.012, 0.0022, 0.01, 0.0008), nail, thumbDist);
  const v2 = new T.Vector3();
  const thumbMid = new T.Vector3(Math.cos(1.2) * (TORCH.r + 0.017), Math.sin(1.2) * (TORCH.r + 0.017), -0.012);
  const thumbTip = new T.Vector3();
  /** Liga dois pontos com uma falange (caixa ao longo de z, centrada, olhando para o fim). */
  const bone = (m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) => {
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.scale.set(1, 1, a.distanceTo(b));
    m.lookAt(v2.copy(b).applyMatrix4(handR.matrixWorld));
  };
  const placeThumb = (press: number) => {
    // ponta sobre a cúpula do botão; apertar desce 2 mm
    const tipR = TORCH.r + 0.0062 + 0.008 - press * 0.002;
    thumbTip.set(Math.cos(ba) * tipR, Math.sin(ba) * tipR, TORCH.button.z - 0.004);
    handR.updateWorldMatrix(true, false);
    bone(thumbProx, thumbBase, thumbMid);
    bone(thumbDist, thumbMid, thumbTip);
    thumbNail.position.set(0, 0.0085, 0.3);
    thumbNail.scale.set(1, 1, 1 / Math.max(1e-3, thumbDist.scale.z));
    dome.position.y = 0.0034 - press * 0.0015;
  };

  // pulso e antebraço: atrás, abaixo e à direita (sem encostar na tampa de trás)
  const wrist = new T.Group();
  wrist.position.set(0.044, -0.026, 0.064);
  wrist.lookAt(0.044 + 0.25, -0.026 - 0.38, 0.064 + 1);
  handR.add(wrist);
  mesh(new T.CylinderGeometry(0.023, 0.026, 0.05, 10), skin, wrist, 0, 0, 0.0, along);
  mesh(new T.CylinderGeometry(0.047, 0.047, 0.035, 10), cuff, wrist, 0, 0, 0.042, along);
  mesh(new T.CylinderGeometry(0.043, 0.05, 0.32, 10), sleeve, wrist, 0, 0, 0.2, along);

  /* ------------------------------------------------ mão esquerda (livre, relaxada) */
  const left = new T.Group();
  left.name = "mao-esquerda";
  camera.add(left);
  const handL = new T.Group();
  left.add(handL);
  mesh(new T.CylinderGeometry(0.043, 0.05, 0.34, 10), sleeve, handL, 0, -0.004, 0.2, along);
  mesh(new T.CylinderGeometry(0.048, 0.048, 0.035, 10), cuff, handL, 0, -0.004, 0.035, along);
  mesh(new T.CylinderGeometry(0.026, 0.03, 0.03, 10), skin, handL, 0, -0.002, 0.005, along);
  mesh(cbox(0.074, 0.03, 0.082, 0.009), skin, handL, 0, 0, -0.035);
  const leftFingers: THREE.Group[][] = [];
  for (let i = 0; i < 4; i++) {
    const f = FINGERS[i];
    const base = new T.Group();
    base.position.set((i - 1.5) * -0.0185, 0.002, -0.074);
    handL.add(base);
    const chain: THREE.Group[] = [base];
    let parent: THREE.Object3D = base;
    f.l.forEach((l, k) => {
      if (k > 0) {
        const joint = new T.Group();
        joint.position.set(0, 0, -f.l[k - 1] * 0.85);
        parent.add(joint);
        chain.push(joint);
        parent = joint;
      }
      const len = l * 0.85;
      mesh(cbox(f.t * 0.95, f.t, len, 0.0045), skin, parent, 0, 0, -len / 2);
      if (k === 2) mesh(cbox(f.t * 0.6, 0.0022, len * 0.5, 0.0008), nail, parent, 0, f.t / 2 - 0.0006, -len * 0.62);
    });
    leftFingers.push(chain);
  }
  const lThumb = new T.Group();
  // mão esquerda com a palma para baixo: o polegar fica do lado de dentro (+x)
  lThumb.position.set(0.036, -0.004, -0.028);
  lThumb.rotation.y = -0.6;
  handL.add(lThumb);
  mesh(cbox(0.019, 0.018, 0.028, 0.005), skin, lThumb, 0, 0, -0.012);
  const curlLeft = (k: number, thumb: number) => {
    for (const chain of leftFingers) chain.forEach((j, i) => (j.rotation.x = -k * [0.6, 0.9, 0.7][i]));
    // polegar: abre a tampa (empurra para cima e para a frente) ou aperta a tecla
    lThumb.rotation.x = -k * 0.4 + thumb * 0.55;
    lThumb.rotation.z = -thumb * 0.25;
  };

  /* ------------------------------------------------ celular (proxy da T11, nasce no primeiro uso) */
  const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];
  type PhoneRig = { root: THREE.Group; hinge: THREE.Group; keys: Map<string, THREE.Mesh> };
  let phoneRig: PhoneRig | null = null;
  const buildPhone = (): PhoneRig => {
    const plastic = kit.phong({ color: 0x3a3d43, shininess: 30 });
    const keyMat = kit.phong({ color: 0x8a9096, shininess: 20 });
    const screen = kit.basic({ color: 0x1a2a28 });
    const root = new T.Group();
    root.name = "celular-proxy";
    // na palma, teclado para cima, girado para a cara ficar de frente para o olho
    root.position.set(0.004, 0.026, -0.07);
    root.rotation.x = 1.0;
    handL.add(root);
    mesh(cbox(0.046, 0.012, 0.086, 0.003), plastic, root, 0, 0.006, 0);
    const keys = new Map<string, THREE.Mesh>();
    KEYS.forEach((k, i) => {
      const key = mesh(cbox(0.01, 0.003, 0.0065, 0.001), keyMat, root, (i % 3 - 1) * 0.013, 0.0135, 0.008 + Math.floor(i / 3) * 0.011);
      keys.set(k, key);
    });
    // tampa articulada na borda de cima: fechada deita sobre o teclado; aberta gira ~165° para a frente
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

  /* ------------------------------------------------ aplicar a pose */
  const anim = createHandsAnim({ seed: o.seed, reduced: o.reduced, still: o.still, flashOn: o.flashOn });
  let visible = true;
  let lastLight = -1;
  let studio: "front" | "side-left" | "side-right" | null = null;
  const STUDIO = { front: [0, -0.02, -0.3, 0.15, Math.PI, 0], "side-left": [0, -0.02, -0.3, 0.1, Math.PI / 2, 0], "side-right": [0, -0.02, -0.3, 0.1, -Math.PI / 2, 0] } as const;
  const apply = (pose: HandsPose) => {
    const r = pose.right;
    right.position.set(r.x, r.y, r.z);
    right.rotation.set(r.rx, r.ry, r.rz);
    if (studio) {
      const [x, y, z, rx, ry, rz] = STUDIO[studio];
      right.position.set(x, y, z);
      right.rotation.set(rx, ry, rz, "YXZ");
    } else right.rotation.order = "XYZ";
    // apertar fecha um pouco as juntas; afrouxar abre (nunca atravessa o tubo: só abre mais que o encaixe)
    const k = pose.grip >= 0 ? 1 + 0.04 * pose.grip : 1 + 0.35 * pose.grip;
    for (const c of chains) c.joints.forEach((j, i) => (j.rotation.z = c.bends[i] * k));
    placeThumb(pose.thumb);
    const l = pose.left;
    left.position.set(l.x, l.y, l.z);
    left.rotation.set(l.rx, l.ry, l.rz);
    curlLeft(l.curl, pose.phone.thumb);
    if (pose.phone.visible && !phoneRig) phoneRig = buildPhone();
    if (phoneRig) {
      phoneRig.root.visible = pose.phone.visible;
      phoneRig.hinge.rotation.x = -pose.phone.lid * 2.88;
      for (const [k, key] of phoneRig.keys) key.position.y = 0.0135 - (k === pose.phone.key ? pose.phone.press * 0.0018 : 0);
    }
    left.visible = visible && l.y > -0.52;
    if (pose.light !== lastLight) {
      lastLight = pose.light;
      flash.intensity = FLASH.intensity * pose.light;
      flash.shadow.autoUpdate = pose.light > 0;
      flash.shadow.needsUpdate = pose.light > 0;
      lens.color.copy(protoColor(T, pose.light > 0 ? 0xfff4dc : 0x4a4740));
    }
  };
  const input = (s: Partial<HandsUpdate>): HandsInput => ({
    moving: s.moving ?? false,
    run: s.run ?? false,
    crouch: s.crouch ?? false,
    panel: s.panel ?? false,
    aiming: s.aiming ?? false,
    bob: s.bob ?? 0,
  });
  let lastInput: HandsInput = input({});
  apply(anim.step(0, lastInput).pose);

  return {
    flash,
    body,
    toggleFlash: () => anim.toggleFlash(),
    phone: (action) => anim.phone(action),
    press: (key) => anim.press(key),
    flashOn: () => anim.state().flashOn,
    reach: (seconds) => anim.reach(seconds),
    setVisible(v) {
      // Esconde só as malhas: a lanterna continua acesa nas fotos de perto.
      visible = v;
      for (const m of meshes) m.visible = v;
    },
    update(dt, s) {
      lastInput = input(s);
      const out = anim.step(dt, lastInput);
      if (out.events.includes("click")) o.onClick?.();
      apply(out.pose);
      // corpo: o controlador põe a posição; aqui só o balanço das pernas e o agachar
      const swing = s.moving && !o.reduced && !o.still ? Math.sin(s.bob) * (s.run ? 0.5 : 0.32) : 0;
      legs[0].rotation.x = swing;
      legs[1].rotation.x = -swing;
      body.scale.y += ((s.crouch ? 0.64 : 1) - body.scale.y) * Math.min(1, dt * 6);
    },
    state: () => anim.state(),
    debug: {
      setStill: (v) => anim.setStill(v),
      forceIdle: (kind) => anim.forceIdle(kind),
      step(seconds, s) {
        const inp = input(s);
        for (let t = 0; t < seconds - 1e-9; t += 1 / 60) apply(anim.step(1 / 60, inp).pose);
      },
      view(v) {
        studio = v;
        apply(anim.step(0, lastInput).pose);
      },
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
