import type { GameAudio } from "../audio/types";
import type { Action } from "../input/actions";
import type { InteractiveObject, LayerInstance } from "../layers/types";
import type { Engine } from "../runtime/engine";
import type { SaveV1, Settings } from "../save/schema";
import { moveWithCollision, segmentClear, type Box2, type Vec2 } from "../world/collision";
import { nearestPlace, pathBetween, type Place } from "../world/places";
import { pickTarget, rayHit, type Target } from "../interaction/targeting";
import { surfaceAt } from "../world/surfaces";
import { createAim, stepAim } from "./aim";
import { createHands, type Hands, type HandsUpdate } from "./hands";

/**
 * Jogador em primeira pessoa (valores do brief da T8, verbatim):
 * andar 1,4 m/s · correr 2,6 m/s · agachar baixa o olho de 1,6 para 1,05 m · espiar (Z/X) inclina 12° e desloca
 * 0,28 m para o lado sem atravessar colisão · raio 0,22 · sensibilidade 0,0022 × settings.sensitivity.
 * - `goTo(lugar)` anda pelo grafo (`pathBetween`) com as mesmas velocidades; mexer-se (WASD) cancela e resolve
 *   `false`. Com movimento reduzido, escurece, teleporta e clareia.
 * - O balanço da câmera e das mãos some com `settings.bob` desligado ou com movimento reduzido.
 * - Colisão: círculo no plano XZ contra `layer.colliders` (paredes e móveis já vêm como caixas).
 */

export const PLAYER = {
  walk: 1.4,
  run: 2.6,
  crouchSpeed: 0.8,
  eye: 1.6,
  crouchEye: 1.05,
  peekDeg: 12,
  peekShift: 0.28,
  /** A câmera ao espiar mantém esta folga das caixas (o plano próximo é 2 cm). */
  peekRadius: 0.12,
  radius: 0.22,
  sensitivity: 0.0022,
  pitchMin: -1.35,
  pitchMax: 1.2,
  /** Raio em que se considera "estar num lugar" (o do protótipo). */
  placeRadius: 0.3,
} as const;

const NO_BOUNDS: Box2 = { minX: -Infinity, maxX: Infinity, minZ: -Infinity, maxZ: Infinity };

export type CameraPose = { x: number; y: number; z: number; yaw: number; pitch: number };

export type PlayerOptions = {
  /** Estado do save (lugares trancados). */
  save?: () => SaveV1;
  audio?: GameAudio;
  /** Chegou a um lugar (ou saiu: `null`). */
  onPlace?: (place: string | null) => void;
  /** Toque num objeto ao alcance: agir (a interação completa é da T9). */
  onAct?: (object: InteractiveObject) => void;
  /** Foto de referência: sem balanço, respiração nem relógio próprio (o quadro sai igual a cada execução). */
  still?: boolean;
  /** Tique do botão da lanterna (som, quando houver). */
  onFlashClick?: () => void;
};

export type Player = {
  readonly place: string | null;
  readonly position: Vec2;
  goTo(place: string): Promise<boolean>;
  update(dt: number): void;
  apply(a: Action): void;
  dispose(): void;
  /** Põe o jogador num lugar na hora (início, foto de referência), já virado para onde o lugar olha. */
  placeAt(place: string): void;
  /** Toque na tela (NDC −1..1): objeto ao alcance age, objeto longe leva ao lugar dele, chão anda até o ponto. */
  tap(ndcX: number, ndcY: number, run: boolean): void;
  /** Debug: câmera presa numa pose (sem balanço nem espiar); `null` solta. */
  debugPose(pose: CameraPose | null): void;
  /** Debug/fotos: esconde as mãos. */
  setHandsVisible(v: boolean): void;
  /** Painel aberto (lista, leitor, exame, celular): a lanterna é guardada; ao voltar a andar, sacada. */
  setPanel(open: boolean): void;
  readonly hands: Hands;
  /** Mirando um objeto ao alcance (com histerese). */
  readonly aiming: boolean;
  /** Id do objeto mirado, ao alcance, habilitado e visível (com histerese de 3 leituras); null sem alvo. */
  readonly aimedId: string | null;
  /** Última leitura crua do centro da tela (sem histerese): o objeto acertado e se está ao alcance. */
  readonly aimTarget: Target | null;
  /** Vira o olhar para um ponto do mundo (ciclo de alvos); `seconds` 0 ou movimento reduzido = na hora. */
  lookAt(x: number, y: number, z: number, seconds?: number): void;
  /** `prefers-reduced-motion` do sistema (reativo). */
  readonly reduced: boolean;
  /** Ajustes mudaram (balanço): as mãos e a câmera seguem na hora. */
  updateSettings(s: Settings): void;
};

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/** yaw da câmera (olhando −z em 0) para uma direção horizontal. */
const yawOf = (dx: number, dz: number) => Math.atan2(-dx, -dz);
/** Menor diferença angular a − b em (−π, π]. */
const angDiff = (a: number, b: number) => {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

type Route = {
  pts: Vec2[];
  i: number;
  face: { yaw: number; pitch: number } | null;
  run: boolean;
  phase: "walk" | "turn" | "fadeOut" | "fadeIn";
  t: number;
  target: string | null;
  resolve(ok: boolean): void;
};

export function createPlayer(engine: Engine, layer: LayerInstance, settings: Settings, opts: PlayerOptions = {}): Player {
  const { three: T, camera, kit, scene } = engine;
  const graph = layer.places;
  const boxes = layer.colliders;
  // Movimento reduzido reativo: a preferência do sistema pode mudar com o jogo aberto, e o ajuste de balanço
  // chega por `updateSettings`. `reduced` vale para a câmera e as viagens; as mãos recebem `reduced || !bob`.
  let reduced = prefersReducedMotion();
  let bobSetting = settings.bob;
  // A lanterna começa acesa, como no protótipo 7 aprovado (F apaga). Balanço desligado nos ajustes conta como
  // movimento reduzido para as mãos (sem ociosa nem balanço).
  const hands = createHands(T, kit, camera, scene, {
    seed: 7,
    reduced: reduced || !bobSetting,
    still: opts.still === true,
    flashOn: true,
    onClick: opts.onFlashClick,
  });
  const still = opts.still === true;
  let sway = bobSetting && !reduced && !still;
  const refreshMotion = () => {
    sway = bobSetting && !reduced && !still;
    hands.setReduced(reduced || !bobSetting);
  };
  const media = typeof window !== "undefined" ? window.matchMedia?.("(prefers-reduced-motion: reduce)") : undefined;
  const onMedia = (e: MediaQueryListEvent) => {
    reduced = e.matches;
    refreshMotion();
  };
  media?.addEventListener?.("change", onMedia);
  const sens = PLAYER.sensitivity * settings.sensitivity;

  let pos: Vec2 = { x: 0, z: 0 };
  let yaw = 0;
  let pitch = 0;
  let eye: number = PLAYER.eye;
  let place: string | null = null;
  let move = { x: 0, z: 0 };
  /** Shift segurado; correr de fato é `runHeld && !crouch` (soltar o C com Shift ainda apertado volta a correr). */
  let runHeld = false;
  let crouch = false;
  const isRunning = () => runHeld && !crouch;
  let peekTarget = 0;
  let peek = 0;
  let bob = 0;
  let lastSin = 0;
  let moving = false;
  let time = 0;
  let route: Route | null = null;
  let pose: CameraPose | null = null;
  let disposed = false;

  const isOpen = (id: string) => {
    const p = graph.places[id];
    if (!p) return false;
    const save = opts.save?.();
    return !(p.locked && save && p.locked(save));
  };

  const setPlace = (id: string | null) => {
    if (id === place) return;
    place = id;
    opts.onPlace?.(id);
  };

  const free = (p: Vec2) => segmentClear(p, p, PLAYER.radius, boxes, NO_BOUNDS);

  const cancelRoute = () => {
    if (!route) return;
    const r = route;
    route = null;
    if (r.phase === "fadeOut" || r.phase === "fadeIn") engine.setFade(1);
    r.resolve(false);
  };

  /** Pontos até (x, z): direto se o caminho está livre; senão pelo grafo, do lugar alcançável mais perto. */
  const routeTo = (to: Vec2, targetPlace: string | null): Vec2[] | null => {
    if (segmentClear(pos, to, PLAYER.radius * 0.86, boxes, NO_BOUNDS)) return [to];
    const nearestReachable = (p: Vec2) => {
      let best: string | null = null;
      let bestD = Infinity;
      for (const n of Object.values(graph.places)) {
        if (!isOpen(n.id)) continue;
        const d = Math.hypot(n.x - p.x, n.z - p.z);
        if (d < bestD && (d < 0.05 || segmentClear(p, n, PLAYER.radius * 0.86, boxes, NO_BOUNDS))) {
          best = n.id;
          bestD = d;
        }
      }
      return best;
    };
    const start = nearestReachable(pos);
    const end = targetPlace ?? nearestReachable(to);
    if (!start || !end) return null;
    const path = pathBetween(graph, start, end, isOpen);
    if (!path) return null;
    const pts: Vec2[] = [graph.places[start], ...path.map((id) => graph.places[id])].map((p) => ({ x: p.x, z: p.z }));
    if (!targetPlace) pts.push(to);
    return pts;
  };

  const faceOf = (p: Place) => ({ yaw: yawOf(p.face.x, p.face.z), pitch: p.pitch });

  const startRoute = (pts: Vec2[], face: Route["face"], target: string | null, run: boolean): Promise<boolean> => {
    cancelRoute();
    return new Promise<boolean>((resolve) => {
      route = { pts, i: 0, face, run, phase: reduced ? "fadeOut" : "walk", t: 0, target, resolve };
    });
  };

  const arrive = (target: string | null) => {
    setPlace(target ?? nearestPlace(graph, pos, isOpen, PLAYER.placeRadius));
  };

  /** Avança a rota; devolve true se o jogador se moveu neste quadro. */
  const stepRoute = (dt: number): boolean => {
    const r = route;
    if (!r) return false;
    if (r.phase === "fadeOut" || r.phase === "fadeIn") {
      r.t += dt;
      const k = clamp(r.t / (r.phase === "fadeOut" ? 0.12 : 0.15), 0, 1);
      engine.setFade(r.phase === "fadeOut" ? 1 - k : k);
      if (k < 1) return false;
      if (r.phase === "fadeOut") {
        const last = r.pts[r.pts.length - 1];
        pos = { ...last };
        if (r.face) ({ yaw, pitch } = r.face);
        r.phase = "fadeIn";
        r.t = 0;
        return false;
      }
      route = null;
      arrive(r.target);
      r.resolve(true);
      return false;
    }
    if (r.phase === "turn") {
      const f = r.face;
      if (!f) return false;
      const k = Math.min(1, dt * 7);
      yaw += angDiff(f.yaw, yaw) * k;
      pitch += (f.pitch - pitch) * k;
      if (Math.abs(angDiff(f.yaw, yaw)) < 0.01 && Math.abs(f.pitch - pitch) < 0.01) {
        yaw = f.yaw;
        pitch = f.pitch;
        route = null;
        arrive(r.target);
        r.resolve(true);
      }
      return false;
    }
    const target = r.pts[r.i];
    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.02) {
      r.i += 1;
      if (r.i >= r.pts.length) {
        if (r.face) r.phase = "turn";
        else {
          route = null;
          arrive(r.target);
          r.resolve(true);
        }
      }
      return false;
    }
    const heading = yawOf(dx, dz);
    yaw += angDiff(heading, yaw) * Math.min(1, dt * 8);
    pitch += (-0.06 - pitch) * Math.min(1, dt * 3);
    const speed = r.run ? PLAYER.run : PLAYER.walk;
    const stepLen = Math.min(dist, speed * dt);
    const next = moveWithCollision(pos, { x: (dx / dist) * stepLen, z: (dz / dist) * stepLen }, PLAYER.radius, boxes, NO_BOUNDS);
    const moved = Math.hypot(next.x - pos.x, next.z - pos.z);
    pos = next;
    if (stepLen > 1e-4 && moved < stepLen * 0.05) {
      // preso (algo no caminho que o grafo não previu): desiste sem atravessar
      route = null;
      arrive(null);
      r.resolve(false);
      return false;
    }
    return moved > 1e-4;
  };

  const stepFree = (dt: number): boolean => {
    const len = Math.hypot(move.x, move.z);
    if (len < 1e-6) return false;
    const speed = crouch ? PLAYER.crouchSpeed : isRunning() ? PLAYER.run : PLAYER.walk;
    const mx = move.x / Math.max(1, len);
    const mz = move.z / Math.max(1, len);
    const sy = Math.sin(yaw);
    const cy = Math.cos(yaw);
    // direita = (cos, −sin); frente = (−sin, −cos); move.z −1 é para a frente
    const dx = (cy * mx + sy * mz) * speed * dt;
    const dz = (-sy * mx + cy * mz) * speed * dt;
    const next = moveWithCollision(pos, { x: dx, z: dz }, PLAYER.radius, boxes, NO_BOUNDS);
    const moved = Math.hypot(next.x - pos.x, next.z - pos.z) > 1e-5;
    pos = next;
    if (moved) setPlace(nearestPlace(graph, pos, isOpen, PLAYER.placeRadius));
    return moved;
  };

  const walkToPoint = (x: number, z: number, run: boolean) => {
    let target = { x, z };
    for (let k = 0; k < 30 && !free(target); k++) target = { x: target.x + (pos.x - target.x) * 0.12, z: target.z + (pos.z - target.z) * 0.12 };
    if (!free(target)) return;
    const pts = routeTo(target, null);
    if (pts) void startRoute(pts, null, null, run);
  };

  const raycaster = new T.Raycaster();
  const floorPlane = new T.Plane(new T.Vector3(0, 1, 0), 0);
  const hit = new T.Vector3();
  const ndc = new T.Vector2();

  let panel = false;
  let aiming = false;
  let aimedId: string | null = null;
  let aimTarget: Target | null = null;
  let aim = createAim();
  /** Entrada das mãos, reaproveitada a cada quadro. */
  const handsIn: HandsUpdate = { moving: false, run: false, bob: 0, crouch: false, panel: false, aiming: false };
  const saveState = () => opts.save?.();
  let aimClock = 0;
  const center = new T.Vector2(0, 0);
  /** Leitura do centro da tela: o objeto interativo acertado (habilitado, visível, não encoberto) e o alcance. */
  const readAim = (): Target | null => pickTarget(rayHit(raycaster, camera, center, layer.objects, saveState()), pos);

  /** Virada suave do olhar (ciclo de alvos). */
  let turn: { y0: number; dy: number; p0: number; dp: number; t: number; dur: number } | null = null;

  const applyCamera = () => {
    if (pose) {
      camera.position.set(pose.x, pose.y, pose.z);
      camera.rotation.set(pose.pitch, pose.yaw, 0, "YXZ");
      camera.updateMatrixWorld();
      return;
    }
    const amp = sway && moving ? (crouch ? 0.012 : isRunning() || route?.run ? 0.04 : 0.022) : 0;
    const bobY = -Math.abs(Math.sin(bob)) * amp;
    const bobX = Math.cos(bob) * amp * 0.45;
    const breath = sway ? Math.sin(time * 1.4) * 0.003 : 0;
    // espiar: desloca para o lado (direita da câmera) até onde a colisão deixa, e inclina
    const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
    const want = { x: right.x * peek * PLAYER.peekShift, z: right.z * peek * PLAYER.peekShift };
    const allowed = moveWithCollision(pos, want, PLAYER.peekRadius, boxes, NO_BOUNDS);
    const ox = allowed.x - pos.x;
    const oz = allowed.z - pos.z;
    camera.position.set(pos.x + Math.cos(yaw) * bobX + ox, eye + bobY + breath, pos.z - Math.sin(yaw) * bobX + oz);
    const roll = (-peek * PLAYER.peekDeg * Math.PI) / 180 + (sway && moving ? Math.cos(bob) * 0.005 : 0);
    camera.rotation.set(pitch, yaw, roll, "YXZ");
    camera.updateMatrixWorld();
  };

  const player: Player = {
    get place() {
      return place;
    },
    get position() {
      return { ...pos };
    },
    hands,
    get aiming() {
      return aiming;
    },
    get aimedId() {
      return aimedId;
    },
    get aimTarget() {
      return aimTarget;
    },
    get reduced() {
      return reduced;
    },
    lookAt(x, y, z, seconds = 0.35) {
      if (disposed || route) return;
      const dx = x - pos.x;
      const dz = z - pos.z;
      const targetYaw = yawOf(dx, dz);
      const targetPitch = clamp(Math.atan2(y - eye, Math.hypot(dx, dz)), PLAYER.pitchMin, PLAYER.pitchMax);
      if (seconds <= 0 || reduced) {
        turn = null;
        yaw = targetYaw;
        pitch = targetPitch;
        applyCamera();
        return;
      }
      turn = { y0: yaw, dy: angDiff(targetYaw, yaw), p0: pitch, dp: targetPitch - pitch, t: 0, dur: seconds };
    },
    updateSettings(next) {
      bobSetting = next.bob;
      refreshMotion();
    },
    goTo(id) {
      const p = graph.places[id];
      if (!p || !isOpen(id) || disposed) return Promise.resolve(false);
      const pts = routeTo({ x: p.x, z: p.z }, id);
      if (!pts) return Promise.resolve(false);
      setPlace(null);
      return startRoute(pts, faceOf(p), id, false);
    },
    placeAt(id) {
      const p = graph.places[id];
      if (!p) return;
      cancelRoute();
      turn = null;
      pos = { x: p.x, z: p.z };
      ({ yaw, pitch } = faceOf(p));
      eye = crouch ? PLAYER.crouchEye : PLAYER.eye;
      setPlace(id);
      applyCamera();
    },
    update(dt) {
      if (disposed) return;
      if (!still) time += dt;
      const fromRoute = route ? stepRoute(dt) : false;
      const fromFree = route ? false : stepFree(dt);
      moving = fromRoute || fromFree;
      if (turn && !route) {
        turn.t += dt;
        const k = clamp(turn.t / turn.dur, 0, 1);
        const e = k * k * (3 - 2 * k);
        yaw = turn.y0 + turn.dy * e;
        pitch = turn.p0 + turn.dp * e;
        if (k >= 1) turn = null;
      }
      eye += ((crouch ? PLAYER.crouchEye : PLAYER.eye) - eye) * Math.min(1, dt * 5);
      peek += (peekTarget - peek) * Math.min(1, dt * 8);
      if (moving) bob += dt * (crouch ? 6 : isRunning() || route?.run ? 12 : 8.5);
      const s = Math.sin(bob);
      if (moving && lastSin !== 0 && Math.sign(s) !== Math.sign(lastSin)) opts.audio?.step(surfaceAt(pos, layer.surfaces, "granilite"));
      lastSin = s;
      applyCamera();
      // o corpo de sombra fica nos pés, virado para onde se olha
      hands.body.position.set(pos.x, 0, pos.z);
      hands.body.rotation.y = yaw;
      // mirar: a cada 50 ms o centro da tela; a histerese (3 leituras iguais) segura o alvo, então a mão e o aviso
      // não oscilam na borda de um objeto e o alvo troca em ~150 ms
      aimClock -= dt;
      if (aimClock <= 0) {
        aimClock = 0.05;
        aimTarget = panel ? null : readAim();
        aim = stepAim(aim, aimTarget && aimTarget.inReach ? aimTarget.id : null);
        aimedId = panel ? null : aim.current;
        aiming = aimedId !== null;
      }
      handsIn.moving = moving;
      handsIn.run = isRunning() || !!route?.run;
      handsIn.bob = bob;
      handsIn.crouch = crouch;
      handsIn.panel = panel;
      handsIn.aiming = aiming;
      hands.update(dt, handsIn);
    },
    apply(a) {
      if (disposed) return;
      switch (a.type) {
        case "move":
          move = { x: a.x, z: a.z };
          if (a.x !== 0 || a.z !== 0) turn = null;
          if ((a.x !== 0 || a.z !== 0) && route) cancelRoute();
          return;
        case "look":
          if (route) return;
          turn = null;
          yaw -= a.dx * sens;
          pitch = clamp(pitch - a.dy * sens, PLAYER.pitchMin, PLAYER.pitchMax);
          return;
        case "run":
          runHeld = a.on;
          return;
        case "crouch":
          crouch = a.on;
          return;
        case "peek":
          peekTarget = a.dir;
          return;
        case "flash":
          hands.toggleFlash();
          return;
        case "interact":
          if (a.down) hands.reach();
          return;
        default:
          return;
      }
    },
    tap(nx, ny, run) {
      if (disposed) return;
      ndc.set(nx, ny);
      raycaster.setFromCamera(ndc, camera);
      // objetos primeiro (habilitados, visíveis e não encobertos)
      const seen = rayHit(raycaster, camera, ndc, layer.objects, saveState());
      const picked = seen && layer.objects.find((o) => o.id === seen.id);
      if (seen && picked) {
        if (pickTarget(seen, pos)?.inReach) {
          opts.onAct?.(picked);
          hands.reach();
          return;
        }
        if (picked.place !== place && isOpen(picked.place)) {
          void player.goTo(picked.place);
          return;
        }
      }
      if (!raycaster.ray.intersectPlane(floorPlane, hit)) return;
      if (hit.distanceTo(camera.position) > 8) return;
      walkToPoint(hit.x, hit.z, run);
    },
    debugPose(p) {
      pose = p && [p.x, p.y, p.z, p.yaw, p.pitch].every(Number.isFinite) ? { ...p } : null;
      applyCamera();
    },
    setHandsVisible(v) {
      hands.setVisible(v);
    },
    setPanel(open) {
      panel = open;
      if (open) {
        aiming = false;
        aimedId = null;
        aimTarget = null;
        aim = createAim();
        turn = null;
      }
    },
    dispose() {
      if (disposed) return;
      cancelRoute();
      disposed = true;
      media?.removeEventListener?.("change", onMedia);
      hands.dispose();
    },
  };
  return player;
}
