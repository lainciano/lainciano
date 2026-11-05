import type * as THREE from "three";
import { protoColor, type MaterialKit } from "../render/materials";
import { chamferBox } from "../render/shapes";
import { createHandsAnim, MAX_PRESSES, type HandsInput, type HandsPose, type IdleKind, type PhoneState } from "./handsAnim";
import { drawAnodized, drawKnurl, drawNail, drawSkin, drawSkinBack, drawSleeve, knob, palmGeo, phalanx, sleeveGeo } from "./handsParts";
import { createPhoneModel, type PhoneKey, type PhoneModel } from "./phone";
import { createPhoneHold, createThumbSolver, GRIP, GRIP_TWIST, LID_CLEARANCE, LTHUMB, THUMB_CMC, THUMB_MCP_ON_PHONE } from "./phoneHold";

/**
 * Mãos presas à câmera e o corpo que só projeta sombra (T8, rodadas 3 e 4: a lanterna fica NA mão).
 *
 * Empunhadura (mão direita, lanterna para a frente, eixo −z no grupo `grip`): dorso e nós do lado de fora do tubo;
 * os quatro dedos (falanges afiladas, levemente curvas, de seção oval, com nós, pontas redondas e unhas) dão a volta
 * por baixo e sobem pelo lado esquerdo; o polegar sai da base carnuda (tenar), passa por cima em duas falanges e
 * pousa no botão de borracha; a cabeça (sino, aro, refletor e lente) fica à frente do indicador e a tampa de trás,
 * com a argola do cordão, passa do mindinho; pulso afilando para o antebraço, na manga com dobras e costura.
 * Cada falange segue um polígono circunscrito ao tubo, afastado dele pela folga do nó (1,06·r0 + 0,4 mm: a pele
 * fica a 2,4–3,6 mm da superfície, não encostada): abraça sem atravessar (teste geométrico). Apertar a
 * pegada não fecha mais as juntas (só afrouxar abre); o aperto aparece no polegar.
 * - A `SpotLight` (sombra 512²) sai da cabeça; apagada, intensidade 0 e o mapa de sombra não é redesenhado.
 * - A animação é toda do `handsAnim.ts` (puro); aqui só se aplica a pose (sem alocar por quadro).
 * - Corpo: tronco, braços e pernas com `colorWrite`/`depthWrite` desligados (só a sombra aparece).
 */

export type HandsUpdate = { moving: boolean; run: boolean; bob: number; crouch: boolean; panel: boolean; aiming: boolean; yawRate?: number; pitchRate?: number };
export type StudioView = { hand: "right" | "left" | "phone" | "grip"; angle: "front" | "left" | "right" | "top" | "back"; lid?: number };

export type HandsRig = {
  grip: THREE.Group;
  tubeR: number;
  /** Falanges, nós e pontas dos dedos que abraçam o tubo. */
  fingers: THREE.Mesh[];
  thumbTip: THREE.Object3D;
  /** Tenar, falanges, nó, ponta e unha do polegar. */
  thumb: THREE.Mesh[];
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
  state(): { mode: string; flashOn: boolean; idle: IdleKind; holster: number; light: number; phone: PhoneState; reduced: boolean; inertia: { yaw: number; pitch: number } };
  /**
   * Celular (T11): `open` sobe a mão esquerda com o aparelho fechado e o polegar empurra a tampa; `close` fecha e
   * desce; `press(tecla)` leva o polegar à tecla, que afunda e volta (devolve se aceitou). O aparelho (`phone.ts`)
   * nasce no primeiro `open` e é reaproveitado; a pose de segurar encaixa a tela no campo de visão do FOV em vigor.
   */
  phone(action: "open" | "close"): void;
  press(key: PhoneKey): boolean;
  /** Teclas que chegaram ao fundo no último `update` (cópia não: o array é reaproveitado). */
  keysFired(): readonly string[];
  /** Fração mínima da altura do quadro para a tela (janela baixa: LCD legível); 0,27 a 0,42. */
  setPhoneFrac(f: number): void;
  /**
   * Monta o aparelho já (ocioso, antes da 1ª abertura) e roda `compile` com ele e a mão esquerda visíveis por um
   * instante (só durante a chamada, que percorre a cena de forma síncrona): os programas ficam prontos.
   */
  preparePhone(compile: () => void): void;
  /** Cantos da tela interna no mundo (sup.-esq., sup.-dir., inf.-dir., inf.-esq.), só com a tampa aberta. */
  phoneScreen(out: THREE.Vector3[]): boolean;
  debug: {
    setStill(v: boolean): void;
    /** Fotos: a animação só anda pelos passos do debug. */
    setPaused(v: boolean): void;
    forceIdle(kind: Exclude<IdleKind, "none">): void;
    step(seconds: number, input: Partial<HandsUpdate>): void;
    /** Fotos: mostra uma mão no meio da tela num ângulo fixo; `null` volta ao normal. */
    view(v: StudioView | null): void;
    rig(): HandsRig;
    /** O aparelho (null antes do primeiro `open`) e a ponta do polegar esquerdo no mundo. */
    phone(): { model: PhoneModel; thumbTip: THREE.Vector3; thumbBones: { proximal: number; distal: number } } | null;
  };
  dispose(): void;
};

export type HandsOptions = {
  seed: number;
  reduced: boolean;
  still: boolean;
  flashOn: boolean;
  onClick?: () => void;
  /** Uma tecla do celular afundou (som): vem do evento `key:<nome>` do rig, no quadro em que ela cede. */
  onKey?: (key: string) => void;
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

const triangles = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.getAttribute("position").count) / 3;

export function createHands(three: typeof THREE, kit: MaterialKit, camera: THREE.Camera, scene: THREE.Scene, o: HandsOptions): Hands {
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
  // comprimento 1 ao longo de +z (o `bone` estica só em z): o arco tem de ser absoluto (~1,5 mm), não 5 % de 1 m
  const thumbGeo = (r0: number, r1: number, sides = 6) => {
    const geo = phalanx(T, 1, r0, r1, 0.0015, sides);
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
  /** Liga dois pontos (no espaço de `frame`) com uma falange (geometria de comprimento 1 ao longo de +z). */
  const boneIn = (m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3, frame: THREE.Object3D) => {
    m.position.copy(a);
    m.scale.set(1, 1, a.distanceTo(b));
    m.lookAt(target.copy(b).applyMatrix4(frame.matrixWorld));
  };
  const bone = (m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) => boneIn(m, a, b, handR);
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
  // polegar da esquerda: do lado de dentro (+x), com a base carnuda. `lThumb`/`lThumbTip` são só o esqueleto da pose
  // solta (sem malha); a malha segue três pontos (base, junta, ponta) e, com o celular, a ponta vai até a tecla por
  // IK de dois ossos (as falanges mantêm o comprimento; a junta dobra para fora do teclado).
  const lThumb = new T.Group();
  lThumb.position.set(0.036, -0.004, -0.028);
  lThumb.rotation.y = -0.6;
  handL.add(lThumb);
  const lThenar = mesh(knob(T, 0.012), skin, handL, 0.03, -0.004, -0.018);
  lThenar.scale.set(1.2, 0.9, 1.6);
  const lThumbTip = new T.Group();
  lThumbTip.position.set(0, 0, -LTHUMB.proximal);
  lThumb.add(lThumbTip);
  const lMeta = mesh(thumbGeo(0.0118, 0.0098), skin, handL);
  const lMcp = mesh(knob(T, 0.0099), skin, handL);
  // polegar afilado (8 lados: não lê como cunha de perto), ponta mais fina e unha pequena e curva
  const lProx = mesh(thumbGeo(0.0092, 0.0082, 8), skin, handL);
  const lDist = mesh(thumbGeo(0.008, 0.0062, 8), skin, handL);
  const lJoint = mesh(knob(T, 0.0085), skin, handL);
  const lTip = mesh(new T.SphereGeometry(LTHUMB.tip, 7, 4), skin, handL);
  const nailGeo = new T.SphereGeometry(1, 6, 2, 0, Math.PI * 2, 0, Math.PI / 2);
  nailGeo.scale(0.0037, 0.0011, 0.0047);
  const lNail = mesh(nailGeo, nail, handL);
  counting = null;
  const LEFT_BENDS = [0.6, 0.9, 0.7] as const;
  /**
   * Segurando o celular: a primeira falange corre rente ao verso, a do meio dobra em ~85° pela borda direita e a
   * ponta volta sobre a frente (o mindinho, mais embaixo, fecha um pouco mais).
   */
  const GRIP_BENDS = [
    [0.06, 1.42, 0.6],
    [0.05, 1.42, 0.6],
    [0.08, 1.45, 0.62],
    [0.2, 1.45, 0.66],
  ] as const;
  /** Segurando, os dedos afinam um pouco (a pegada lia como um bloco de pele). */
  const GRIP_THIN = 0.84;
  let gripMix = 0;
  const curlLeft = (k: number, thumb: number) => {
    for (let c = 0; c < leftChains.length; c++) {
      const chain = leftChains[c];
      for (let i = 0; i < chain.length; i++) chain[i].rotation.x = -(k * LEFT_BENDS[i] * (1 - gripMix) + GRIP_BENDS[c][i] * gripMix);
      const thin = 1 + (GRIP_THIN - 1) * gripMix;
      chain[0].scale.set(thin, thin, 1);
    }
    lThumb.rotation.x = -k * 0.4 + thumb * 0.55;
    lThumb.rotation.z = -thumb * 0.25;
    lThumbTip.rotation.x = -k * 0.5 - thumb * 0.3;
  };

  /* ------------------------------------------------ celular (T11): o aparelho nasce no primeiro `open` */
  let phoneModel: PhoneModel | null = null;
  const phoneMount = new T.Group();
  phoneMount.name = "celular-na-mao";
  phoneMount.position.set(GRIP.x, GRIP.y, GRIP.z);
  phoneMount.quaternion
    .setFromRotationMatrix(new T.Matrix4().makeBasis(new T.Vector3(0, 0, -1), new T.Vector3(1, 0, 0), new T.Vector3(0, -1, 0)))
    // na diagonal da palma (o pé do aparelho vai para o lado do pulso): a palma fica atrás dele, não sobra ao lado
    .multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), GRIP_TWIST));
  // a mão inteira está em escala HAND_SCALE: o aparelho volta ao tamanho real
  phoneMount.scale.setScalar(1 / HAND_SCALE);
  phoneMount.visible = false;
  handL.add(phoneMount);
  const hold = createPhoneHold(T, camera, phoneMount, () => phoneModel, (p) => anim.setPhoneHold(p));
  const ensurePhone = (): PhoneModel => {
    if (phoneModel) return phoneModel;
    phoneModel = createPhoneModel(T, kit);
    phoneMount.add(phoneModel.root);
    hold.fit();
    return phoneModel;
  };

  // polegar esquerdo: esqueleto solto, alvo no aparelho e o ponto em curso (no espaço do aparelho, suavizado)
  const lThumbRest = lThumb.position.clone();
  const lThumbBase = new T.Vector3();
  const lCmc = new T.Vector3(THUMB_CMC.x, THUMB_CMC.y, THUMB_CMC.z);
  const mcpPhone = new T.Vector3();
  const fkMid = new T.Vector3();
  const fkTip = new T.Vector3();
  const fkHint = new T.Vector3();
  const thumbGoal = new T.Vector3();
  const thumbNow = new T.Vector3();
  let thumbFresh = true;
  const ikTip = new T.Vector3();
  const ikHint = new T.Vector3();
  const thumb = createThumbSolver(T);
  const ikMid = thumb.mid;
  const tipNow = thumb.tip;
  const keyN = new T.Vector3();
  const tmp = new T.Vector3();
  const tmp2 = new T.Vector3();
  const nailBasis = new T.Matrix4();
  const placeLeftThumb = (pose: HandsPose, raise: number, dt: number) => {
    gripMix = raise;
    lThumbBase.copy(lThumbRest);
    if (raise > 0) {
      phoneMount.updateMatrix();
      mcpPhone.set(THUMB_MCP_ON_PHONE.x, THUMB_MCP_ON_PHONE.y, THUMB_MCP_ON_PHONE.z).applyMatrix4(phoneMount.matrix);
      lThumbBase.lerp(mcpPhone, raise);
    }
    lThumb.position.copy(lThumbBase);
    lThumb.updateMatrix();
    lThumbTip.updateMatrix();
    fkMid.copy(lThumbTip.position).applyMatrix4(lThumb.matrix);
    fkTip.set(0, 0, -LTHUMB.distal).applyMatrix4(lThumbTip.matrix).applyMatrix4(lThumb.matrix);
    tmp.subVectors(fkTip, lThumbBase).normalize();
    fkHint.subVectors(fkMid, lThumbBase);
    fkHint.addScaledVector(tmp, -fkHint.dot(tmp));
    if (raise > 0 && phoneModel) {
      thumb.target(pose, phoneModel, thumbGoal);
      const k = thumbFresh || dt <= 0 ? 1 : 1 - Math.exp(-dt * 38);
      thumbNow.lerp(thumbGoal, k);
      if (thumbFresh) thumbNow.copy(thumbGoal);
      thumbFresh = false;
      phoneMount.updateMatrix();
      ikTip.copy(thumbNow).applyMatrix4(phoneMount.matrix);
      keyN.set(0, 0, 1).applyQuaternion(phoneMount.quaternion);
      ikTip.lerpVectors(fkTip, ikTip, raise);
      ikHint.copy(fkHint).normalize().lerp(keyN, raise);
      thumb.solve(lThumbBase, ikTip, ikHint);
    } else {
      thumbFresh = true;
      thumb.solve(lThumbBase, fkTip, fkHint);
    }
    handL.updateWorldMatrix(true, false);
    boneIn(lMeta, lCmc, lThumbBase, handL);
    lMcp.position.copy(lThumbBase);
    boneIn(lProx, lThumbBase, ikMid, handL);
    boneIn(lDist, ikMid, tipNow, handL);
    lJoint.position.copy(ikMid);
    lTip.position.copy(tipNow);
    // unha no dorso da ponta (o lado oposto ao da tecla)
    const z = tmp.subVectors(tipNow, ikMid).normalize();
    const y = tmp2.copy(ikHint.lengthSq() > 0 ? ikHint : fkHint).addScaledVector(z, -(ikHint.lengthSq() > 0 ? ikHint : fkHint).dot(z)).normalize();
    const x = keyN.crossVectors(y, z).normalize();
    lNail.quaternion.setFromRotationMatrix(nailBasis.makeBasis(x, y, z));
    lNail.position.copy(tipNow).addScaledVector(y, LTHUMB.tip * 0.8).addScaledVector(z, -0.0012);
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
  let paused = false;
  /** Teclas que chegaram ao fundo no último `update` (o LCD responde nelas). */
  const fired: string[] = [];
  let lastLight = -1;
  let studio: StudioView | null = null;
  let studioScene: { hidden: THREE.Object3D[]; fog: THREE.Scene["fog"]; background: THREE.Scene["background"] } | null = null;
  const STUDIO_ROT: Record<StudioView["angle"], [number, number]> = { front: [0.15, Math.PI], left: [0.1, Math.PI / 2], right: [0.1, -Math.PI / 2], top: [1.25, 0], back: [0.1, 0] };
  /** Estúdio do celular sozinho: três quartos de frente, de trás, de lado, a dobradiça de cima. */
  const PHONE_STUDIO: Record<StudioView["angle"], [number, number]> = { front: [-0.2, 0.38], back: [-0.15, Math.PI + 0.4], left: [-0.1, Math.PI / 2 - 0.25], right: [-0.1, -Math.PI / 2 + 0.25], top: [0.9, 0.3] };
  const qBase = new T.Quaternion();
  const qStudio = new T.Quaternion();
  const STUDIO_GRIP: Record<StudioView["angle"], [number, number]> = { front: [0, 0], left: [0, 0.75], right: [0, -0.75], back: [0.1, Math.PI - 0.5], top: [0.8, 0.2] };
  const eul = new T.Euler();
  const lensOn = protoColor(T, 0xfff4dc);
  const lensOff = protoColor(T, 0x4a4740);
  const apply = (pose: HandsPose, dt = 1 / 60) => {
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
    const raise = phoneModel ? pose.phone.raise : 0;
    left.position.set(l.x, l.y, l.z);
    if (raise > 0) {
      // da pose solta até a de segurar por quatérnio (os ângulos de Euler dariam uma volta torta no caminho)
      const b = pose.leftBase;
      qBase.setFromEuler(eul.set(b.rx, b.ry, b.rz, "XYZ"));
      left.quaternion.slerpQuaternions(qBase, hold.quat, raise);
      // a tampa passa perto do olho no meio do giro: a mão recua e volta (nunca cruza o plano próximo)
      left.position.addScaledVector(hold.dir, LID_CLEARANCE * Math.sin(Math.PI * pose.phone.lid) * raise);
    } else left.rotation.set(l.rx, l.ry, l.rz, "XYZ");
    gripMix = raise;
    curlLeft(l.curl, 0);
    left.visible = l.y > -0.52 || raise > 0;
    if (phoneModel) {
      phoneMount.visible = pose.phone.visible && visible;
      phoneModel.setLid(pose.phone.lid);
      for (const key of phoneModel.keys) {
        let depth = 0;
        for (let p = 0; p < MAX_PRESSES; p++) if (pose.phone.presses[p].key === key) depth = Math.max(depth, pose.phone.presses[p].depth);
        phoneModel.setKey(key, depth);
      }
      phoneModel.setBacklight(pose.phone.lid >= 0.98);
    }
    placeLeftThumb(pose, raise, dt);
    if (studio) {
      if (studio.hand === "grip") {
        // a mão esquerda segurando o celular, com a pose de segurar de verdade, girada em volta da tela
        const [rx, ry] = STUDIO_GRIP[studio.angle];
        qStudio.setFromEuler(eul.set(rx, ry, 0, "YXZ"));
        left.quaternion.copy(qStudio).multiply(hold.quat);
        left.position.copy(hold.pos).sub(hold.center).applyQuaternion(qStudio).add(tmp.set(0.01, 0.01, -0.36));
        left.visible = true;
        right.visible = false;
      } else if (studio.hand === "phone") {
        const m = ensurePhone();
        if (m.root.parent !== camera) camera.add(m.root);
        const [rx, ry] = PHONE_STUDIO[studio.angle];
        // aberto ele mede ~18 cm: mais longe e centrado na dobradiça
        const open = (studio.lid ?? 0) > 0.5;
        m.root.position.set(0, open ? -0.03 : -0.004, open ? -0.3 : -0.2);
        m.root.rotation.set(rx, ry, 0, "YXZ");
        m.root.visible = true;
        m.setLid(studio.lid ?? 0);
        m.setBacklight(false);
        left.visible = false;
        right.visible = false;
      } else {
        const [rx, ry] = STUDIO_ROT[studio.angle];
        const g2 = studio.hand === "right" ? right : left;
        g2.position.set(0, -0.02, -0.3);
        g2.rotation.set(rx, ry, 0, "YXZ");
        g2.visible = true;
        (studio.hand === "right" ? left : right).visible = false;
      }
    } else {
      right.visible = true;
      if (phoneModel && phoneModel.root.parent !== phoneMount) {
        phoneModel.root.position.set(0, 0, 0);
        phoneModel.root.rotation.set(0, 0, 0);
        phoneMount.add(phoneModel.root);
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
    inp.yawRate = s.yawRate ?? 0;
    inp.pitchRate = s.pitchRate ?? 0;
    return inp;
  };
  apply(anim.step(0, fill({})).pose);

  return {
    flash,
    body,
    toggleFlash: () => anim.toggleFlash(),
    flashOn: () => anim.state().flashOn,
    reach: (seconds) => anim.reach(seconds),
    phone(action) {
      if (action === "open") ensurePhone();
      anim.phone(action);
    },
    press: (key) => anim.press(key),
    keysFired: () => fired,
    setPhoneFrac(f) {
      hold.setFrac(f);
    },
    preparePhone(compile) {
      ensurePhone();
      const was = { left: left.visible, mount: phoneMount.visible };
      left.visible = true;
      phoneMount.visible = true;
      try {
        compile();
      } finally {
        left.visible = was.left;
        phoneMount.visible = was.mount;
      }
    },
    phoneScreen(out) {
      if (!phoneModel || !phoneMount.visible || phoneModel.root.parent !== phoneMount || anim.state().phone !== "holding") return false;
      phoneModel.root.updateWorldMatrix(true, false);
      phoneModel.screenCorners(out);
      for (let i = 0; i < 4; i++) out[i].applyMatrix4(phoneModel.root.matrixWorld);
      return true;
    },
    setReduced(v) {
      reduced = v;
      anim.setReduced(v);
    },
    setVisible(v) {
      visible = v;
      for (const m of meshes) m.visible = v;
    },
    update(dt, s) {
      // FOV ou aspecto mudaram (ajustes, janela): a pose de segurar se refaz (só recalcula quando muda)
      if (phoneModel) {
        hold.fit();
        hold.step(dt);
      }
      // fotos: com a animação parada, os passos vêm só do debug (`step`)
      if (paused) return;
      const out = anim.step(dt, fill(s));
      if (o.onClick && out.events.includes("click")) o.onClick();
      fired.length = 0;
      for (const e of out.events) {
        if (!e.startsWith("key:")) continue;
        fired.push(e.slice(4));
        o.onKey?.(e.slice(4));
      }
      apply(out.pose, dt);
      const swing = s.moving && !reduced && !o.still ? Math.sin(s.bob) * (s.run ? 0.5 : 0.32) : 0;
      legs[0].rotation.x = swing;
      legs[1].rotation.x = -swing;
      body.scale.y += ((s.crouch ? 0.64 : 1) - body.scale.y) * Math.min(1, dt * 6);
    },
    state: () => anim.state(),
    debug: {
      setStill: (v) => anim.setStill(v),
      setPaused(v) {
        paused = v;
      },
      forceIdle: (kind) => anim.forceIdle(kind),
      step(seconds, s) {
        fill(s);
        for (let t = 0; t < seconds - 1e-9; t += 1 / 60) {
          if (phoneModel) {
            hold.fit();
            hold.step(1 / 60);
          }
          apply(anim.step(1 / 60, inp).pose);
        }
      },
      view(v) {
        // Estúdio: só a mão sobre fundo liso neutro, sem névoa (a sala não entra na foto de referência: arte e
        // luz da sala podem mudar nas próximas tarefas sem invalidar a referência da mão). As luzes ficam.
        if (v && !studioScene) {
          const hidden: THREE.Object3D[] = [];
          scene.traverse((obj) => {
            if (!(obj as THREE.Mesh).isMesh || !obj.visible) return;
            for (let p: THREE.Object3D | null = obj; p; p = p.parent) if (p === camera || p === body) return;
            obj.visible = false;
            hidden.push(obj);
          });
          studioScene = { hidden, fog: scene.fog, background: scene.background };
          scene.fog = null;
          scene.background = protoColor(T, 0x262626);
        } else if (!v && studioScene) {
          for (const obj of studioScene.hidden) obj.visible = true;
          scene.fog = studioScene.fog;
          scene.background = studioScene.background;
          studioScene = null;
        }
        studio = v;
        apply(anim.step(0, inp).pose, 0);
        if (!v) for (const m of meshes) m.visible = visible;
      },
      phone: () => {
        if (!phoneModel) return null;
        handL.updateWorldMatrix(true, false);
        return {
          model: phoneModel,
          thumbTip: lTip.getWorldPosition(new T.Vector3()),
          thumbBones: { proximal: lThumbBase.distanceTo(ikMid), distal: ikMid.distanceTo(tipNow) },
        };
      },
      rig: () => ({ grip, tubeR: TORCH.r, fingers: fingerMeshes, thumbTip, thumb: [thenar, thumbProx, thumbDist, thumbJoint, thumbTip, thumbNail], button: dome, flash, headFront: TORCH.head[0], triangles: { ...tri } }),
    },
    dispose() {
      right.removeFromParent();
      left.removeFromParent();
      body.removeFromParent();
      flash.dispose();
      phoneModel?.dispose();
      phoneModel = null;
      for (const geo of geometries) geo.dispose();
      geometries.length = 0;
    },
  };
}
