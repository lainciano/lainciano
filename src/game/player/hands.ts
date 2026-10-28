import type * as THREE from "three";
import { protoColor, type MaterialKit } from "../render/materials";
import { blotches, edgeWear, grain, mulberry, type Draw } from "../render/paint";
import { chamferBox } from "../render/shapes";

/**
 * Mãos e antebraços low-poly presos à câmera (como o protótipo 7) e o corpo que só projeta sombra.
 * - Direita: segura a lanterna (dedos fechados em volta do corpo dela); a `SpotLight` da lanterna tem sombra
 *   512² e mora na mão, então a luz segue o balanço. Desligada, a intensidade vai a 0 e o mapa de sombra para de
 *   ser redesenhado (`autoUpdate` falso): ligar não troca o programa de nenhum material (sem engasgo).
 * - Esquerda: fica abaixo do quadro e sobe quando a pessoa age (`reach`).
 * - Balanço (passo, respiração): desligável por `settings.bob` e pelo movimento reduzido (quem decide é o
 *   controlador, que passa `sway`).
 * - Corpo: tronco, braços e pernas com `colorWrite` e `depthWrite` desligados: não aparece na imagem, mas a luz
 *   pendente projeta a sombra dele no chão (o jogador "existe" na sala).
 * Tudo que nasce aqui é descartado em `dispose`; os materiais e texturas vêm do kit (compartilhados).
 */

export type HandsState = {
  moving: boolean;
  run: boolean;
  /** Fase do passo (rad); o balanço da mão acompanha a câmera. */
  bob: number;
  /** Balanço ligado (settings.bob e sem movimento reduzido). */
  sway: boolean;
  crouch: boolean;
};

export type Hands = {
  flash: THREE.SpotLight;
  /** Corpo de sombra: o controlador posiciona (pés do jogador, yaw). */
  body: THREE.Group;
  setFlash(on: boolean): void;
  flashOn(): boolean;
  /** A mão esquerda sobe para alcançar por `seconds`. */
  reach(seconds?: number): void;
  setVisible(visible: boolean): void;
  update(dt: number, t: number, s: HandsState): void;
  dispose(): void;
};

/**
 * Lanterna (valores do protótipo, luz física recalibrada) e a receita de sombra da T6 para um mapa de 512². A
 * intensidade 1,1π do protótipo estourava o círculo em branco a menos de 1 m (foto de perto da porta e do armário):
 * 0,7π mantém o círculo legível de perto e ainda ilumina a 3 m.
 */
export const FLASH = { color: 0xfff0d8, intensity: 0.7 * Math.PI, distance: 8, angle: 0.42, penumbra: 0.55, decay: 1.2 } as const;
/**
 * Receptores típicos a 1–3 m: texel ≈ 2·d·tan 0,42/512 ≈ 1,7–5,2 mm; `normalBias` 0,005 ≈ 1–1,5 texel a 2–3 m
 * (o 0,03 do protótipo descolava a sombra do objeto, peter-panning). `near` 0,1: as mãos ficam atrás da lente.
 */
export const FLASH_SHADOW = { mapSize: 512, near: 0.1, far: 8, bias: -0.0005, normalBias: 0.005 } as const;

type Pose = { x: number; y: number; z: number; rx: number; ry: number; rz: number; c: number };
const REST_R: Pose = { x: 0.17, y: -0.19, z: -0.3, rx: 0.06, ry: 0.09, rz: 0.05, c: 1 };
const REST_L: Pose = { x: -0.32, y: -0.6, z: -0.22, rx: 0.4, ry: -0.3, rz: 0, c: 0.3 };
const REACH_L: Pose = { x: -0.07, y: -0.13, z: -0.42, rx: 0.12, ry: -0.18, rz: 0.15, c: 0.2 };

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

const drawSkin: Draw = (g, w, h) => {
  const r = mulberry(900);
  g.fillStyle = "#8c6652";
  g.fillRect(0, 0, w, h);
  blotches(g, w, h, r, 5, [120, 70, 56], 1.4, 0.3);
  grain(g, w, h, r, 8);
};

const drawKnurl: Draw = (g, w, h) => {
  g.fillStyle = "#1c1c1e";
  g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 3) {
    for (let x = (y / 3) % 2 ? 0 : 1.5; x < w; x += 3) {
      g.fillStyle = "rgba(120,120,126,.25)";
      g.fillRect(x, y, 1, 1);
    }
  }
};

export function createHands(three: typeof THREE, kit: MaterialKit, camera: THREE.Camera, scene: THREE.Object3D): Hands {
  const T = three;
  const geometries: THREE.BufferGeometry[] = [];
  const g = <G extends THREE.BufferGeometry>(geo: G): G => {
    geometries.push(geo);
    return geo;
  };
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    const m = new T.Mesh(g(geo), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = false;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const cbox = (w: number, h: number, d: number, c: number) => chamferBox(T, w, h, d, { chamfer: c, seg: 20, uv: { mode: "face" } });

  const sleeve = kit.phong({ map: kit.texture("jogador:manga", drawSleeve, 64), shininess: 4 });
  const cuff = kit.phong({ color: 0x3a3a35, shininess: 4 });
  const skin = kit.phong({ map: kit.texture("jogador:pele", drawSkin, 64), shininess: 14, specular: 0x140c08 });
  const nail = kit.phong({ color: 0xb08878, shininess: 40 });

  type Finger = { base: THREE.Group; tip: THREE.Group };
  const makeHand = (side: 1 | -1) => {
    const root = new T.Group();
    // antebraço na manga (cônico, 8 lados) e o punho dobrado, mais gasto
    mesh(new T.CylinderGeometry(0.043, 0.05, 0.34, 8), sleeve, root, 0, -0.004, 0.2, Math.PI / 2);
    mesh(new T.CylinderGeometry(0.048, 0.048, 0.035, 8), cuff, root, 0, -0.004, 0.035, Math.PI / 2);
    // pulso e dorso: o dorso é mais largo nos nós e afina para o pulso
    mesh(new T.CylinderGeometry(0.026, 0.03, 0.03, 8), skin, root, 0, -0.002, 0.005, Math.PI / 2);
    mesh(cbox(0.074, 0.03, 0.082, 0.009), skin, root, 0, 0, -0.035);
    const fingers: Finger[] = [];
    for (let i = 0; i < 4; i++) {
      const spread = (i - 1.5) * 0.0185 * side;
      const len = 0.05 - Math.abs(i - 1.5) * 0.007 - (i === 3 ? 0.006 : 0);
      const base = new T.Group();
      base.position.set(spread, 0.002, -0.074);
      root.add(base);
      mesh(cbox(0.0165, 0.018, len * 0.55, 0.004), skin, base, 0, 0, -len * 0.27);
      const tip = new T.Group();
      tip.position.set(0, 0, -len * 0.55);
      base.add(tip);
      mesh(cbox(0.0152, 0.0158, len * 0.48, 0.0045), skin, tip, 0, -0.0005, -len * 0.23);
      mesh(cbox(0.011, 0.0025, 0.009, 0.001), nail, tip, 0, 0.0075, -len * 0.4);
      fingers.push({ base, tip });
    }
    const thumb = new T.Group();
    thumb.position.set(0.036 * side, -0.006, -0.028);
    thumb.rotation.y = 0.6 * side;
    root.add(thumb);
    mesh(cbox(0.019, 0.018, 0.028, 0.005), skin, thumb, 0, 0, -0.012);
    const thumbTip = new T.Group();
    thumbTip.position.set(0, 0, -0.026);
    thumb.add(thumbTip);
    mesh(cbox(0.017, 0.016, 0.024, 0.005), skin, thumbTip, 0, 0, -0.011);
    mesh(cbox(0.012, 0.0025, 0.009, 0.001), nail, thumbTip, 0, 0.0075, -0.017);
    const curl = (k: number) => {
      for (const f of fingers) {
        f.base.rotation.x = -k * 1.05;
        f.tip.rotation.x = -k * 1.1;
      }
      thumb.rotation.x = -k * 0.5;
      thumbTip.rotation.x = -k * 0.6;
    };
    return { root, curl };
  };

  const right = new T.Group();
  const left = new T.Group();
  camera.add(right, left);
  const rHand = makeHand(1);
  const lHand = makeHand(-1);
  right.add(rHand.root);
  left.add(lHand.root);

  // lanterna: corpo recartilhado, cabeça em sino (o −y da lathe vira −z: a boca larga encontra o anel), anel e lente,
  // botão de borracha e a tampa de trás
  const flashG = new T.Group();
  flashG.position.set(0, 0.016, -0.05);
  rHand.root.add(flashG);
  const knurl = kit.phong({ map: kit.texture("jogador:lanterna", drawKnurl, 64), shininess: 30 });
  const black = kit.phong({ color: 0x1b1b1d, shininess: 40 });
  const rubber = kit.phong({ color: 0x0e0e0e, shininess: 4 });
  const bezel = kit.phong({ color: 0x6a6a70, specular: 0x404040, shininess: 60 });
  const lens = kit.basic({ color: 0x4a4740 });
  mesh(new T.CylinderGeometry(0.016, 0.016, 0.15, 10, 3), knurl, flashG, 0, 0, -0.02, Math.PI / 2);
  const bell = [
    [0.016, 0],
    [0.017, -0.012],
    [0.022, -0.03],
    [0.023, -0.042],
    [0.0001, -0.042],
  ].map(([r, y]) => new T.Vector2(r, y)).reverse();
  mesh(new T.LatheGeometry(bell, 12), black, flashG, 0, 0, -0.095, Math.PI / 2);
  mesh(new T.TorusGeometry(0.021, 0.0025, 6, 14), bezel, flashG, 0, 0, -0.137);
  mesh(new T.CircleGeometry(0.019, 12), lens, flashG, 0, 0, -0.1375, 0, Math.PI);
  mesh(new T.CylinderGeometry(0.017, 0.017, 0.012, 10), black, flashG, 0, 0, 0.061, Math.PI / 2);
  mesh(cbox(0.009, 0.006, 0.014, 0.002), rubber, flashG, 0, 0.0165, -0.045);

  const flash = new T.SpotLight(protoColor(T, FLASH.color), 0, FLASH.distance, FLASH.angle, FLASH.penumbra, FLASH.decay);
  flash.name = "lanterna";
  flash.position.set(0, 0, -0.15);
  const flashTarget = new T.Object3D();
  flashTarget.position.set(0, 0, -3);
  flashG.add(flash, flashTarget);
  flash.target = flashTarget;
  flash.castShadow = true;
  flash.shadow.mapSize.set(FLASH_SHADOW.mapSize, FLASH_SHADOW.mapSize);
  flash.shadow.bias = FLASH_SHADOW.bias;
  flash.shadow.normalBias = FLASH_SHADOW.normalBias;
  flash.shadow.camera.near = FLASH_SHADOW.near;
  flash.shadow.camera.far = FLASH_SHADOW.far;
  flash.shadow.autoUpdate = false;

  // corpo de sombra
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

  const hr: Pose = { ...REST_R };
  const hl: Pose = { ...REST_L };
  let flashOn = false;
  let reachLeft = 0;
  const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

  return {
    flash,
    body,
    setFlash(on) {
      flashOn = on;
      flash.intensity = on ? FLASH.intensity : 0;
      flash.shadow.autoUpdate = on;
      flash.shadow.needsUpdate = on;
      lens.color.setHex(on ? 0xfff4dc : 0x4a4740);
    },
    flashOn: () => flashOn,
    reach(seconds = 0.6) {
      reachLeft = Math.max(reachLeft, seconds);
    },
    setVisible(v) {
      // Esconde só as malhas: a lanterna (filha da mão direita) continua acesa nas fotos de perto.
      for (const hand of [rHand.root, lHand.root]) hand.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.visible = v;
      });
    },
    update(dt, t, s) {
      reachLeft = Math.max(0, reachLeft - dt);
      const tl = reachLeft > 0 ? REACH_L : REST_L;
      const k = Math.min(1, dt * 10);
      for (const key of Object.keys(hr) as (keyof Pose)[]) {
        hr[key] = lerp(hr[key], REST_R[key], k);
        hl[key] = lerp(hl[key], tl[key], k);
      }
      const sw = s.sway ? 1 : 0;
      const bk = s.sway && s.moving ? (s.run ? 2 : 1) : 0;
      const by = Math.abs(Math.sin(s.bob)) * 0.009 * bk;
      const bx = Math.cos(s.bob) * 0.008 * bk;
      right.position.set(hr.x + bx + Math.sin(t * 1.1) * 0.0025 * sw, hr.y - by + Math.sin(t * 1.7) * 0.0025 * sw, hr.z);
      right.rotation.set(hr.rx + Math.sin(s.bob) * 0.015 * bk, hr.ry, hr.rz);
      left.position.set(hl.x - bx, hl.y - by, hl.z);
      left.rotation.set(hl.rx, hl.ry, hl.rz);
      rHand.curl(hr.c);
      lHand.curl(hl.c);
      left.visible = hl.y > -0.52;
      // corpo: o controlador põe a posição; aqui só o balanço das pernas e o agachar
      const swing = s.moving && s.sway ? Math.sin(s.bob) * (s.run ? 0.5 : 0.32) : 0;
      legs[0].rotation.x = swing;
      legs[1].rotation.x = -swing;
      body.scale.y = lerp(body.scale.y, s.crouch ? 0.64 : 1, Math.min(1, dt * 6));
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
