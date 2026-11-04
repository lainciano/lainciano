import type * as THREE from "three";
import { MAX_PRESSES, type HandsPose, type Pose6 } from "./handsAnim";
import { PHONE, type PhoneKey, type PhoneModel } from "./phone";

/**
 * Pegada do celular na mão esquerda (T11), tirada de `hands.ts`: onde a tela fica no quadro, o encaixe dela no FOV
 * e no aspecto da câmera (`createPhoneHold`) e a ponta do polegar sobre as teclas (`createThumbSolver`).
 * Nada aqui aloca por quadro: vetores, matrizes e a pose entregue ao `handsAnim` são pré-alocados e reaproveitados
 * (o refazer do encaixe, que só roda quando FOV, aspecto ou fração mudam, também usa só esses objetos).
 */

/**
 * Celular na palma da mão esquerda (no `handL`): costas do aparelho na palma, os dedos dando a volta na borda
 * direita, o polegar do lado esquerdo, sobre o teclado. Eixos do aparelho no `handL`: x = −z (para onde os dedos
 * apontam), y = +x (lado do polegar), z = −y (para fora da palma).
 */
export const GRIP = { x: 0.018, y: -0.0208, z: -0.0855 } as const;
/** Giro do aparelho na palma, em volta da normal dela (rad). */
export const GRIP_TWIST = -0.32;
/** Dedos da esquerda segurando o aparelho. */
export const GRIP_CURL = 1.05;
/**
 * Onde a tela fica no quadro (fração da meia-altura e da meia-largura, a partir do centro) e quanto da altura ela
 * ocupa: a tela lê grande e ainda sobra o alto do teclado, onde o polegar aperta.
 */
export const HOLD = { x: -0.1, y: 0.3, frac: 0.27, roll: 0.05 } as const;
/** Quanto a mão recua no meio do giro da tampa (m): a ponta livre não chega a 3,5 cm do olho em FOV 55–80. */
export const LID_CLEARANCE = 0.075;
/** Polegar esquerdo: comprimento das falanges (as do esqueleto de antes) e o raio da ponta. */
export const LTHUMB = { proximal: 0.028, distal: 0.021, tip: 0.0062, hover: 0.0035 } as const;
/**
 * Com o celular, a junta da base do polegar (a ponta do metacarpo) vai para junto da borda esquerda do aparelho
 * (no espaço do aparelho): o metacarpo sai do tenar até ela, e as duas falanges alcançam o teclado.
 */
export const THUMB_MCP_ON_PHONE = { x: -0.03, y: 0.002, z: 0.0 } as const;
/** Base do metacarpo do polegar esquerdo, dentro do tenar (no `handL`). */
export const THUMB_CMC = { x: 0.03, y: -0.006, z: -0.012 } as const;

/** Fração mínima e máxima da altura do quadro para a tela (janela baixa: LCD legível). */
export const PHONE_FRAC_MAX = 0.42;

/** Pose da mão esquerda segurando o celular (o que o `handsAnim.setPhoneHold` recebe). */
export type HoldPose = Pose6 & { curl: number };

export type PhoneHold = {
  /** Pose mostrada (posição e giro da mão esquerda na câmera): corre até o alvo. Objetos reaproveitados. */
  readonly pos: THREE.Vector3;
  readonly quat: THREE.Quaternion;
  /** Do olho para a tela segurada: abrindo e fechando, a mão recua por aqui (a tampa gira na direção do olho). */
  readonly dir: THREE.Vector3;
  /** Centro da tela segurada, na câmera (o estúdio da pegada gira em volta dele). */
  readonly center: THREE.Vector3;
  /** Refaz o alvo se FOV, aspecto ou fração mudaram desde o último encaixe (senão não faz nada). */
  fit(): void;
  /** Avança a pose mostrada até o alvo (~150 ms) e a entrega ao `handsAnim`. */
  step(dt: number): void;
  /** Fração da altura do quadro para a tela, de `HOLD.frac` a `PHONE_FRAC_MAX`; refaz o encaixe. */
  setFrac(f: number): void;
};

export function createPhoneHold(
  T: typeof THREE,
  camera: THREE.Camera,
  mount: THREE.Object3D,
  getModel: () => PhoneModel | null,
  setPose: (p: HoldPose) => void,
): PhoneHold {
  const pose: HoldPose = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, curl: GRIP_CURL };
  const quat = new T.Quaternion();
  const dir = new T.Vector3(0, 0, -1);
  const center = new T.Vector3();
  const cornerBuf = [0, 1, 2, 3].map(() => new T.Vector3());
  // chave do último encaixe (números, sem montar texto a cada quadro)
  let fitFov = Number.NaN;
  let fitAspect = Number.NaN;
  let fitFrac = Number.NaN;
  /** O alvo mudou e a pose mostrada ainda não chegou nele. */
  let moving = true;
  /** Fração da altura do quadro que a tela ocupa (sobe em janela baixa: o LCD não cai abaixo de ~200 px). */
  let frac: number = HOLD.frac;
  // alvo da pose de segurar (refeito quando FOV, aspecto ou fração mudam) e a pose mostrada, que corre até ele
  const targetPos = new T.Vector3();
  const targetQuat = new T.Quaternion();
  const pos = new T.Vector3();
  let snapNext = true;
  const euler = new T.Euler();
  // rascunho do encaixe (reaproveitado: nada de `new` ao refazer)
  const S = new T.Vector3();
  const mid = new T.Vector3();
  const xr = new T.Vector3();
  const ur = new T.Vector3();
  const nr = new T.Vector3();
  const nc = new T.Vector3();
  const up0 = new T.Vector3();
  const xc = new T.Vector3();
  const uc = new T.Vector3();
  const rootPos = new T.Vector3();
  const scaleSink = new T.Vector3();
  const Mr = new T.Matrix4();
  const Mc = new T.Matrix4();
  const R = new T.Matrix4();
  const root = new T.Matrix4();
  const mountInv = new T.Matrix4();

  /**
   * Pose da mão esquerda que põe a tela onde `HOLD` pede (fração do quadro, virada para o olho) no FOV e no aspecto
   * da câmera: a altura na tela não muda com o FOV dos ajustes (55–80°), só a distância.
   */
  const fit = () => {
    const model = getModel();
    if (!model) return;
    const cam = camera as THREE.PerspectiveCamera;
    const fov = cam.fov ?? 62;
    const aspect = cam.aspect ?? 1.6;
    if (fov === fitFov && aspect === fitAspect && frac === fitFrac) return;
    fitFov = fov;
    fitAspect = aspect;
    fitFrac = frac;
    moving = true;
    const tanH = Math.tan((fov * Math.PI) / 360);
    const d = PHONE.screen.h / (2 * tanH * frac);
    S.set(HOLD.x * tanH * aspect * d, HOLD.y * tanH * d, -d);
    dir.copy(S).normalize();
    center.copy(S);
    // moldura da tela no aparelho, com a tampa aberta
    const lidNow = model.lid.rotation.x;
    model.setLid(1);
    const c = model.screenCorners(cornerBuf);
    model.lid.rotation.x = lidNow;
    mid.set(0, 0, 0).add(c[0]).add(c[1]).add(c[2]).add(c[3]).multiplyScalar(0.25);
    xr.subVectors(c[1], c[0]).normalize();
    ur.subVectors(c[0], c[3]).normalize();
    nr.crossVectors(xr, ur).normalize();
    Mr.makeBasis(xr, ur, nr);
    // na câmera: a tela olha para o olho, com um giro leve de quem segura
    nc.copy(S).negate().normalize();
    up0.set(-Math.sin(HOLD.roll), Math.cos(HOLD.roll), 0);
    xc.crossVectors(up0, nc).normalize();
    uc.crossVectors(nc, xc).normalize();
    Mc.makeBasis(xc, uc, nc);
    R.copy(Mc).multiply(Mr.transpose());
    rootPos.copy(S).sub(mid.applyMatrix4(R));
    root.copy(R).setPosition(rootPos);
    mount.updateMatrix();
    root.multiply(mountInv.copy(mount.matrix).invert());
    root.decompose(targetPos, targetQuat, scaleSink);
    step(0);
  };

  /**
   * A pose mostrada corre até o alvo em ~150 ms (FOV mudado nos ajustes com o celular na mão: nada de teleporte);
   * com o celular guardado, ou na 1ª vez, encaixa direto.
   */
  function step(dt: number) {
    // parado no alvo (ou guardado e já encaixado): nada a fazer neste quadro
    if (!moving) return;
    const snap = snapNext || !mount.visible;
    const k = snap ? 1 : 1 - Math.exp(-dt / 0.05);
    if (!snap && k === 0) return;
    if (snap || (pos.distanceToSquared(targetPos) < 1e-12 && quat.angleTo(targetQuat) < 1e-6)) moving = false;
    snapNext = false;
    pos.lerp(targetPos, k);
    if (snap) pos.copy(targetPos);
    quat.slerp(targetQuat, k);
    if (snap) quat.copy(targetQuat);
    euler.setFromQuaternion(quat, "XYZ");
    pose.x = pos.x;
    pose.y = pos.y;
    pose.z = pos.z;
    pose.rx = euler.x;
    pose.ry = euler.y;
    pose.rz = euler.z;
    pose.curl = GRIP_CURL;
    setPose(pose);
  }

  return {
    pos,
    quat,
    dir,
    center,
    fit,
    step,
    setFrac(f) {
      frac = Math.min(PHONE_FRAC_MAX, Math.max(HOLD.frac, Number.isFinite(f) ? f : HOLD.frac));
      fit();
    },
  };
}

const smoothStep = (v: number) => {
  const c = Math.min(1, Math.max(0, v));
  return c * c * (3 - 2 * c);
};

export type ThumbSolver = {
  /** Junta e ponta resolvidas pelo último `solve` (no espaço do `handL`). Objetos reaproveitados. */
  readonly mid: THREE.Vector3;
  readonly tip: THREE.Vector3;
  /** IK de dois ossos (base → junta → ponta) com a junta dobrando para o lado de `hint`. */
  solve(base: THREE.Vector3, tip: THREE.Vector3, hint: THREE.Vector3): void;
  /** Alvo da ponta do polegar no aparelho: a borda da tampa ao abrir, a tecla mirada, ou o descanso. */
  target(pose: HandsPose, m: PhoneModel, out: THREE.Vector3): THREE.Vector3;
};

export function createThumbSolver(T: typeof THREE): ThumbSolver {
  const mid = new T.Vector3();
  const tip = new T.Vector3();
  const tmp = new T.Vector3();
  const tmp2 = new T.Vector3();
  const restBuf = new T.Vector3();
  // uma só função (não um fecho novo a cada chamada): o alvo roda todo quadro com o celular na mão
  const rest = (m: PhoneModel, lift: number, o: THREE.Vector3) => m.keyTop("ok", o).add(tmp2.set(-0.0095, -0.0105, lift + LTHUMB.hover * 2));
  return {
    mid,
    tip,
    solve(base, goal, hint) {
      const a = LTHUMB.proximal;
      const b = LTHUMB.distal;
      tmp.subVectors(goal, base);
      const c0 = tmp.length() || 1e-6;
      tmp.multiplyScalar(1 / c0);
      const c = Math.min(a + b - 1e-4, Math.max(Math.abs(a - b) + 1e-4, c0));
      tip.copy(base).addScaledVector(tmp, c);
      const cosA = (a * a + c * c - b * b) / (2 * a * c);
      const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
      tmp2.copy(hint).addScaledVector(tmp, -hint.dot(tmp));
      if (tmp2.lengthSq() < 1e-12) tmp2.set(0, 1, 0).addScaledVector(tmp, -tmp.y);
      tmp2.normalize();
      mid.copy(base).addScaledVector(tmp, a * cosA).addScaledVector(tmp2, a * sinA);
    },
    target(pose, m, out) {
      const ph = pose.phone;
      const lift = LTHUMB.tip * 0.92;
      if (ph.lid === 0 && ph.raise < 1 && ph.flick === 0) {
        // subindo com a tampa fechada: o polegar já espera embaixo da ponta livre, pronto para empurrar
        return m.lidEdge(out).add(tmp2.set(-0.004, -0.006, 0.0015));
      }
      if (ph.flick > 0) {
        const edge = m.lidEdge(out).add(tmp2.set(-0.004, -0.005, 0.002));
        const k = smoothStep((ph.flick - 0.3) / 0.6);
        return k > 0 ? edge.lerp(rest(m, lift, restBuf), k) : edge;
      }
      if (ph.lid < 1) return rest(m, lift, out);
      const aim = (ph.aim || "") as PhoneKey | "";
      if (!aim) return rest(m, lift, out);
      let depth = 0;
      for (let i = 0; i < MAX_PRESSES; i++) if (ph.presses[i].key === aim) depth = Math.max(depth, ph.presses[i].depth);
      return m.keyTop(aim, out).add(tmp2.set(0, 0, lift + LTHUMB.hover * (1 - depth) - PHONE.travel * depth));
    },
  };
}
