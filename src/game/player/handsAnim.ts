import { mulberry } from "../render/paint";

/**
 * Máquina de estados das mãos (lógica pura, sem three): devolve a pose de cada quadro e os eventos. O `hands.ts`
 * só aplica a pose a grupos já montados (nada de geometria por quadro).
 *
 * - Mão direita: `held` → `holstering` → `holstered` (painel ou celular aberto: a lanterna desce e sai do quadro)
 *   → `drawing` → `held`. Reverter no meio continua de onde está (o fator `holster` é contínuo).
 * - Ligar/apagar: o polegar aperta o botão, evento `click`, a luz troca logo depois (pisca ao acender). Barrado com
 *   painel ou celular aberto, ou com a lanterna fora da posição (nem animação nem clique).
 * - Ociosas "de tempos em tempos" (só parado, segurando, sem mirar): trocar a pegada, balançar a lanterna, a mão
 *   esquerda ajeitar. Entram e saem por um fator de mistura (~120 ms): interromper não dá estalo.
 * - Balanço do passo: vertical, lateral e giro do pulso defasados; correr 2×, andar 1×, agachado 0,5×; parado só
 *   respiração. Mirar sobe e aproxima; agachar recolhe.
 * - Movimento reduzido (`setReduced`, pode mudar em execução): sem ociosa, balanço nem respiração (somem
 *   suaves); trocas em ≤ 120 ms. `still` (foto): nada anda sozinho.
 * - Celular (rig da T11): subir e abrir a tampa / fechar a tampa e descer são valores contínuos (`raise`, `lid`):
 *   fechar no meio da abertura (e o contrário) continua de onde está. Teclas: até 4 apertos independentes.
 *
 * Desempenho: `step` não aloca. A pose e a lista de eventos devolvidas são reaproveitadas a cada quadro (copie se
 * precisar guardar).
 */

export type Pose6 = { x: number; y: number; z: number; rx: number; ry: number; rz: number };
export type KeyPress = { key: string; depth: number };
export type HandsPose = {
  right: Pose6;
  /** Pegada: 0 normal, > 0 aperta, < 0 afrouxa. */
  grip: number;
  /** Polegar no botão: 0 apoiado, 1 apertado. */
  thumb: number;
  left: Pose6 & { curl: number };
  /** Fator da luz da lanterna (0 apagada, 1 acesa; pisca ao acender). */
  light: number;
  /** 0 segurando à frente, 1 guardada. */
  holster: number;
  /** Celular: tampa (0 fechada, 1 aberta), polegar da esquerda, e os apertos (`key` vazio = livre). */
  phone: { visible: boolean; lid: number; thumb: number; presses: KeyPress[] };
};
export type HandsInput = { moving: boolean; run: boolean; crouch: boolean; panel: boolean; aiming: boolean; bob: number };
export type IdleKind = "none" | "regrip" | "sway" | "adjust";
export type HandsMode = "held" | "holstering" | "holstered" | "drawing";
export type HandsEvent = "click" | `key:${string}`;
export type PhoneState = "none" | "opening" | "holding" | "closing";

export const HANDS_TIMING = {
  toggle: 0.24,
  holster: 0.35,
  draw: 0.3,
  /** Com movimento reduzido: troca quase instantânea. */
  reduced: 0.1,
  idleMin: 3.5,
  idleSpan: 5,
  /** Entrada e saída da ociosa (mistura). */
  idleFade: 0.12,
  phoneRise: 0.35,
  phoneFlick: 0.25,
  phoneShut: 0.2,
  phoneDrop: 0.3,
} as const;

/** Balanço do passo por canal (m ou rad por unidade de amplitude). */
const SWAY = { y: 0.0055, x: 0.008, rz: 0.022, rx: 0.01, left: 0.5 } as const;
export const MAX_PRESSES = 4;

/** Segurando: o facho cai um pouco abaixo do centro da tela, como no protótipo. */
const HELD: Pose6 = { x: 0.13, y: -0.14, z: -0.33, rx: -0.03, ry: 0.06, rz: 0.04 };
const HOLSTERED: Pose6 = { x: 0.2, y: -0.6, z: -0.22, rx: -0.9, ry: 0.25, rz: 0.2 };
const AIM = { x: 0, y: 0.035, z: 0.05, rx: 0.06, ry: 0, rz: 0 };
const CROUCH = { x: -0.03, y: 0.012, z: 0.04, rx: 0, ry: 0, rz: 0 };
type LeftPose = Pose6 & { curl: number };
const LEFT_REST: LeftPose = { x: -0.3, y: -0.62, z: -0.25, rx: 0.4, ry: -0.3, rz: 0, curl: 0.35 };
const LEFT_REACH: LeftPose = { x: -0.08, y: -0.14, z: -0.42, rx: 0.12, ry: -0.18, rz: 0.15, curl: 0.2 };
/** Ajeitar: a mão esquerda entra pelo canto de baixo à esquerda (dentro do FOV 62°: |y| < z·tan 31°). */
const LEFT_ADJUST: LeftPose = { x: -0.16, y: -0.16, z: -0.33, rx: 0.3, ry: -0.2, rz: 0.25, curl: 0.55 };
/** Celular à frente do olho, um pouco abaixo e à esquerda do centro. */
const LEFT_PHONE: LeftPose = { x: -0.06, y: -0.085, z: -0.27, rx: 0.35, ry: 0.15, rz: 0.1, curl: 0.72 };
const IDLE_SECONDS = { regrip: 0.9, sway: 1.6, adjust: 1.4 } as const;
const IDLE_KINDS = ["regrip", "sway", "adjust"] as const;

const KEYS6 = ["x", "y", "z", "rx", "ry", "rz"] as const;
const KEYS7 = ["x", "y", "z", "rx", "ry", "rz", "curl"] as const;
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const smooth = (v: number) => v * v * (3 - 2 * v);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** Aproxima `v` de `target` com passo máximo `step` (sem passar). */
const approach = (v: number, target: number, step: number) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));

export type HandsAnimOptions = { seed: number; reduced: boolean; still: boolean; flashOn: boolean };

export function createHandsAnim(o: HandsAnimOptions) {
  const rng = mulberry(o.seed);
  let reduced = o.reduced;
  let still = o.still;
  let flashOn = o.flashOn;
  let light = flashOn ? 1 : 0;
  let mode: HandsMode = "held";
  let holster = 0;
  let toggleT = -1;
  let toggleTarget = flashOn;
  let clicked = false;
  let lastPanel = false;
  let pendingToggle = false;
  const startToggle = () => {
    toggleT = 0;
    clicked = false;
    toggleTarget = !flashOn;
    flashOn = toggleTarget;
  };
  // ociosa: tipo em curso, tempo, se está ativa (a mistura decai depois de interrompida) e a mistura
  let idle: Exclude<IdleKind, "none"> | null = null;
  let idleT = 0;
  let idleActive = false;
  let idleMix = 0;
  let nextIdle = HANDS_TIMING.idleMin + rng() * HANDS_TIMING.idleSpan;
  let reachLeft = 0;
  let t = 0;
  let swayAmp = 0;
  let breathMix = reduced || still ? 0 : 1;
  // celular: alvo (aberto/fechado/nenhum), subida e tampa
  let phoneTarget: "open" | "closed" | null = null;
  let raise = 0;
  let lid = 0;
  const presses = Array.from({ length: MAX_PRESSES }, () => ({ key: "", t: 0, dur: 0, fired: false }));

  // saídas reaproveitadas
  const base: Pose6 = { ...HELD };
  const left: LeftPose = { ...LEFT_REST };
  const pose: HandsPose = {
    right: { ...HELD },
    grip: 0,
    thumb: 0,
    left: { ...LEFT_REST },
    light,
    holster: 0,
    phone: { visible: false, lid: 0, thumb: 0, presses: Array.from({ length: MAX_PRESSES }, () => ({ key: "", depth: 0 })) },
  };
  const events: HandsEvent[] = [];
  const result = { pose, events };

  const phoneState = (): PhoneState => {
    if (phoneTarget === "open") return lid >= 1 ? "holding" : "opening";
    if (phoneTarget === "closed") return "closing";
    return "none";
  };

  return {
    /** Polegar clica o botão. Devolve se aceitou (barrado com painel/celular aberto ou fora da posição). */
    toggleFlash(): boolean {
      if (toggleT >= 0 || pendingToggle || lastPanel || phoneTarget !== null || mode === "holstering" || mode === "holstered") return false;
      // sacando: aceita e clica assim que a lanterna voltar à posição
      if (mode === "drawing") {
        pendingToggle = true;
        return true;
      }
      startToggle();
      return true;
    },
    reach(seconds = 0.6) {
      reachLeft = Math.max(reachLeft, seconds);
    },
    setStill(v: boolean) {
      still = v;
    },
    setReduced(v: boolean) {
      reduced = v;
    },
    forceIdle(kind: Exclude<IdleKind, "none">) {
      idle = kind;
      idleT = 0;
      idleActive = true;
    },
    phone(action: "open" | "close") {
      if (action === "open") phoneTarget = "open";
      else if (phoneTarget === "open") phoneTarget = "closed";
    },
    /** Uma tecla do celular aberto: aperto independente (atraso e duração sorteados). */
    press(key: string) {
      if (phoneState() !== "holding") return;
      const slot = presses.find((p) => p.key === "");
      if (!slot) return;
      slot.key = key;
      slot.t = -(0.03 + rng() * 0.05);
      slot.dur = 0.12 + rng() * 0.06;
      slot.fired = false;
    },
    state: () => ({ mode, flashOn, idle: idleActive && idle ? idle : ("none" as IdleKind), holster, light, phone: phoneState(), reduced }),
    step(dt: number, input: HandsInput): { pose: HandsPose; events: HandsEvent[] } {
      events.length = 0;
      const lively = !reduced && !still;
      if (!still) t += dt;
      lastPanel = input.panel;

      // celular: valores contínuos (reentrante); com movimento reduzido, cada sentido ≤ 120 ms
      const scaleOpen = reduced ? HANDS_TIMING.reduced / (HANDS_TIMING.phoneRise + HANDS_TIMING.phoneFlick) : 1;
      const scaleClose = reduced ? HANDS_TIMING.reduced / (HANDS_TIMING.phoneShut + HANDS_TIMING.phoneDrop) : 1;
      let lidMoving = false;
      if (phoneTarget === "open") {
        if (raise < 1) raise = Math.min(1, raise + dt / (HANDS_TIMING.phoneRise * scaleOpen));
        else if (lid < 1) {
          lid = Math.min(1, lid + dt / (HANDS_TIMING.phoneFlick * scaleOpen));
          lidMoving = true;
        }
      } else if (phoneTarget === "closed") {
        for (const p of presses) p.key = "";
        if (lid > 0) {
          lid = Math.max(0, lid - dt / (HANDS_TIMING.phoneShut * scaleClose));
          lidMoving = true;
        } else if (raise > 0) raise = Math.max(0, raise - dt / (HANDS_TIMING.phoneDrop * scaleClose));
        if (lid === 0 && raise === 0) phoneTarget = null;
      }
      const phoneThumb = lidMoving ? Math.sin(Math.PI * lid) : 0;
      let pressMax = 0;
      for (let i = 0; i < MAX_PRESSES; i++) {
        const p = presses[i];
        const out = pose.phone.presses[i];
        out.key = p.key;
        out.depth = 0;
        if (p.key === "") continue;
        p.t += dt;
        const q = p.t / p.dur;
        let depth = q <= 0 ? 0 : q < 0.35 ? q / 0.35 : q < 0.6 ? 1 : 1 - (q - 0.6) / 0.4;
        if (!p.fired && q >= 0.35) {
          p.fired = true;
          depth = 1;
          events.push(`key:${p.key}`);
        }
        if (q >= 1) {
          p.key = "";
          out.key = "";
          depth = 0;
        }
        out.depth = clamp01(depth);
        pressMax = Math.max(pressMax, out.depth);
      }

      // guardar / sacar (painel ou celular)
      const panel = input.panel || phoneTarget !== null;
      if (panel && mode !== "holstered") mode = "holstering";
      if (!panel && mode !== "held") mode = "drawing";
      if (mode === "holstering") {
        holster = clamp01(holster + dt / (reduced ? HANDS_TIMING.reduced : HANDS_TIMING.holster));
        if (holster >= 1 - 1e-9) {
          holster = 1;
          mode = "holstered";
        }
      } else if (mode === "drawing") {
        holster = clamp01(holster - dt / (reduced ? HANDS_TIMING.reduced : HANDS_TIMING.draw));
        if (holster <= 1e-9) {
          holster = 0;
          mode = "held";
          if (pendingToggle) {
            pendingToggle = false;
            startToggle();
          }
        }
      }
      // voltou ao painel antes de terminar de sacar: o F pendente é descartado (barrado com painel)
      if (mode === "holstering") pendingToggle = false;

      // ligar / apagar
      let thumb = 0;
      if (toggleT >= 0) {
        toggleT += dt;
        const down = reduced ? 0.03 : 0.07;
        const hold = reduced ? 0.05 : 0.13;
        const up = reduced ? 0.1 : HANDS_TIMING.toggle;
        const flip = reduced ? 0.05 : 0.11;
        thumb = clamp01(toggleT < down ? toggleT / down : toggleT < hold ? 1 : 1 - (toggleT - hold) / (up - hold));
        if (!clicked && toggleT >= down) {
          clicked = true;
          events.push("click");
        }
        if (toggleT >= flip) light = toggleTarget ? (!reduced && toggleT < flip + 0.035 ? 0.55 : 1) : 0;
        if (toggleT >= up) toggleT = -1;
      }

      // ociosas: ativa enquanto dá; interrompida, a mistura decai (sem estalo)
      const canIdle = lively && mode === "held" && !input.moving && !input.aiming && !input.crouch && toggleT < 0;
      if (idle && idleActive) {
        idleT += dt;
        if (!canIdle || idleT >= IDLE_SECONDS[idle]) {
          idleActive = false;
          nextIdle = HANDS_TIMING.idleMin + rng() * HANDS_TIMING.idleSpan;
        }
      } else if (canIdle) {
        nextIdle -= dt;
        if (nextIdle <= 0 && idleMix <= 0) {
          idle = IDLE_KINDS[Math.floor(rng() * IDLE_KINDS.length) % IDLE_KINDS.length];
          idleT = 0;
          idleActive = true;
        }
      } else nextIdle = Math.max(nextIdle, 1.5);
      idleMix = still ? (idleActive ? 1 : 0) : approach(idleMix, idleActive ? 1 : 0, dt / HANDS_TIMING.idleFade);
      if (!idleActive && idleMix <= 0) idle = null;
      const p = idle ? clamp01(idleT / IDLE_SECONDS[idle]) : 0;
      const bell = Math.sin(Math.PI * p) * idleMix;

      // base: mirar sobe e aproxima, agachar recolhe
      const k = still ? 1 : Math.min(1, dt * (reduced ? 30 : 10));
      for (const key of KEYS6) {
        const target = HELD[key] + (input.aiming ? AIM[key] : 0) + (input.crouch ? CROUCH[key] : 0);
        base[key] = lerp(base[key], target, k);
      }

      // balanço do passo e respiração (somem suaves se o movimento reduzido ligar em execução)
      const ampTarget = lively && input.moving ? (input.run ? 2 : input.crouch ? 0.5 : 1) : 0;
      swayAmp = lerp(swayAmp, ampTarget, still ? 1 : Math.min(1, dt * 6));
      breathMix = still ? 0 : approach(breathMix, lively ? 1 : 0, dt * 4);
      const b = input.bob;
      const by = Math.abs(Math.sin(b)) * SWAY.y * swayAmp;
      const bx = Math.cos(b) * SWAY.x * swayAmp;
      const broll = Math.sin(b + 0.6) * SWAY.rz * swayAmp;
      const bpitch = Math.sin(2 * b + 1.1) * SWAY.rx * swayAmp;
      const r = pose.right;
      r.x = base.x + bx + Math.sin(t * 1.1) * 0.0018 * breathMix;
      r.y = base.y - by + Math.sin(t * 1.4) * 0.0022 * breathMix;
      r.z = base.z;
      r.rx = base.rx + bpitch + Math.sin(t * 0.9) * 0.004 * breathMix;
      r.ry = base.ry + (idle === "sway" ? Math.sin(2 * Math.PI * p) * 0.06 * (1 - p) * idleMix : 0);
      r.rz = base.rz + broll + (idle === "sway" ? bell * 0.05 : 0);
      const h = smooth(holster);
      for (const key of KEYS6) r[key] = lerp(r[key], HOLSTERED[key], h);

      const idleGrip = idle === "regrip" ? 0.9 * Math.sin(2 * Math.PI * p) * (1 - 0.4 * p) * idleMix : 0;
      pose.grip = lerp(idleGrip, -0.5, h);
      pose.thumb = thumb;

      // mão esquerda: alcança, ajeita (com a mistura) ou descansa; o celular se mistura por cima
      reachLeft = Math.max(0, reachLeft - (still ? 0 : dt));
      const kl = still ? 1 : Math.min(1, dt * (reduced ? 30 : 8));
      const adjust = idle === "adjust" ? idleMix : 0;
      const rs = smooth(raise);
      const l = pose.left;
      for (const key of KEYS7) {
        const rest = reachLeft > 0 ? LEFT_REACH[key] : lerp(LEFT_REST[key], LEFT_ADJUST[key], adjust);
        left[key] = lerp(left[key], rest, kl);
        l[key] = lerp(left[key], LEFT_PHONE[key], rs);
      }
      const sl = SWAY.left;
      l.x -= bx * sl;
      l.y -= by * sl;
      l.rz -= broll * sl;

      pose.light = light;
      pose.holster = holster;
      pose.phone.visible = phoneTarget !== null;
      pose.phone.lid = lid;
      pose.phone.thumb = Math.max(phoneThumb, pressMax);
      return result;
    },
  };
}

export type HandsAnim = ReturnType<typeof createHandsAnim>;
