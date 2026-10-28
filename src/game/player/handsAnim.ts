import { mulberry } from "../render/paint";

/**
 * Máquina de estados das mãos (lógica pura, sem three): devolve a pose de cada quadro e os eventos (o clique do
 * botão). O `hands.ts` só aplica a pose a grupos já montados (nada de geometria por quadro).
 *
 * Estados da mão direita: `held` (segura a lanterna à frente) → `holstering` → `holstered` (painel aberto: a
 * lanterna desce e sai do quadro, a mão relaxa) → `drawing` → `held`.
 * - Ligar/apagar: o polegar aperta o botão; a luz troca com um pequeno atraso (e pisca ao acender); evento "click".
 * - Ociosas "de tempos em tempos" (só parado, segurando, sem mirar): trocar a pegada (aperta e afrouxa), balançar
 *   a lanterna, a mão esquerda subir para ajeitar. Intervalo sorteado por semente (determinístico).
 * - Mirar objeto ao alcance: a lanterna sobe e chega perto. Correr: balanço maior. Agachar: mão perto do corpo.
 * - Movimento reduzido: sem ociosa, balanço nem respiração; ligar/apagar e guardar/sacar em ≤ 120 ms.
 * - `still` (foto de referência): nada anda sozinho; a pose é a mesma a cada quadro.
 * As poses são do grupo da empunhadura no espaço da câmera (presas a ela: olhar para cima ou para baixo não
 * deforma a mão).
 */

export type Pose6 = { x: number; y: number; z: number; rx: number; ry: number; rz: number };
export type HandsPose = {
  right: Pose6;
  /** Aperto dos dedos em volta da lanterna: 0 normal, > 0 aperta, < 0 afrouxa. */
  grip: number;
  /** Polegar no botão: 0 apoiado, 1 apertado. */
  thumb: number;
  left: Pose6 & { curl: number };
  /** Fator da luz da lanterna (0 apagada, 1 acesa; pisca ao acender). */
  light: number;
  /** 0 segurando à frente, 1 guardada (fora do quadro). */
  holster: number;
  /** Celular na mão esquerda (rig para a T11): tampa (0 fechada, 1 aberta), tecla apertada e a profundidade. */
  phone: { visible: boolean; lid: number; key: string | null; press: number; thumb: number };
};
export type HandsInput = { moving: boolean; run: boolean; crouch: boolean; panel: boolean; aiming: boolean; bob: number };
export type IdleKind = "none" | "regrip" | "sway" | "adjust";
export type HandsMode = "held" | "holstering" | "holstered" | "drawing";
export type HandsEvent = "click" | `key:${string}`;
export type PhoneState = "none" | "opening" | "holding" | "closing";

export const HANDS_TIMING = {
  /** Ciclo inteiro do polegar (apertar, segurar, soltar). */
  toggle: 0.24,
  holster: 0.35,
  draw: 0.3,
  /** Com movimento reduzido: troca quase instantânea. */
  reduced: 0.1,
  idleMin: 3.5,
  idleSpan: 5,
  /** Celular: subir com a tampa fechada, abrir a tampa com o polegar; fechar a tampa, descer. */
  phoneRise: 0.35,
  phoneFlick: 0.25,
  phoneShut: 0.2,
  phoneDrop: 0.3,
} as const;

/** Balanço do passo por canal (m ou rad por unidade de amplitude; andar = 1, correr = 2, agachado = 0,5). */
const SWAY = { y: 0.0055, x: 0.008, rz: 0.022, rx: 0.01, left: 0.5 } as const;

/** Segurando: o facho cai um pouco abaixo do centro da tela, como no protótipo. */
const HELD: Pose6 = { x: 0.14, y: -0.15, z: -0.34, rx: -0.03, ry: 0.06, rz: 0.04 };
const HOLSTERED: Pose6 = { x: 0.2, y: -0.6, z: -0.22, rx: -0.9, ry: 0.25, rz: 0.2 };
const AIM: Partial<Pose6> = { y: 0.035, z: 0.05, rx: 0.06 };
const CROUCH: Partial<Pose6> = { x: -0.03, y: 0.012, z: 0.04 };
const LEFT_REST = { x: -0.3, y: -0.62, z: -0.25, rx: 0.4, ry: -0.3, rz: 0, curl: 0.35 };
const LEFT_REACH = { x: -0.08, y: -0.14, z: -0.42, rx: 0.12, ry: -0.18, rz: 0.15, curl: 0.2 };
/** Ajeitar: a mão esquerda entra pelo canto de baixo à esquerda (dentro do FOV 62°: |y| < z·tan 31°). */
const LEFT_ADJUST = { x: -0.16, y: -0.16, z: -0.33, rx: 0.3, ry: -0.2, rz: 0.25, curl: 0.55 };
/** Celular à frente do olho, um pouco abaixo e à esquerda do centro. */
const LEFT_PHONE = { x: -0.06, y: -0.085, z: -0.27, rx: 0.35, ry: 0.15, rz: 0.1, curl: 0.72 };
const IDLE_SECONDS: Record<Exclude<IdleKind, "none">, number> = { regrip: 0.9, sway: 1.6, adjust: 1.4 };
const IDLE_KINDS = ["regrip", "sway", "adjust"] as const;

const KEYS = ["x", "y", "z", "rx", "ry", "rz"] as const;
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const smooth = (v: number) => v * v * (3 - 2 * v);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export type HandsAnimOptions = { seed: number; reduced: boolean; still: boolean; flashOn: boolean };

export function createHandsAnim(o: HandsAnimOptions) {
  const rng = mulberry(o.seed);
  const reduced = o.reduced;
  let still = o.still;
  let flashOn = o.flashOn;
  let light = flashOn ? 1 : 0;
  let mode: HandsMode = "held";
  let holster = 0;
  let toggleT = -1;
  let toggleTarget = flashOn;
  let clicked = false;
  let idle: IdleKind = "none";
  let idleT = 0;
  let nextIdle = HANDS_TIMING.idleMin + rng() * HANDS_TIMING.idleSpan;
  let reachLeft = 0;
  let t = 0;
  let swayAmp = 0;
  let phone: PhoneState = "none";
  let phoneT = 0;
  let press: { key: string; t: number; dur: number; fired: boolean } | null = null;
  // base suavizada (mirar, agachar) e a mão esquerda
  const base: Pose6 = { ...HELD };
  const left = { ...LEFT_REST };

  const startIdle = (kind: IdleKind) => {
    idle = kind;
    idleT = 0;
  };

  return {
    toggleFlash() {
      if (toggleT >= 0) return;
      toggleT = 0;
      clicked = false;
      toggleTarget = !flashOn;
      flashOn = toggleTarget;
    },
    reach(seconds = 0.6) {
      reachLeft = Math.max(reachLeft, seconds);
    },
    setStill(v: boolean) {
      still = v;
    },
    forceIdle(kind: Exclude<IdleKind, "none">) {
      startIdle(kind);
    },
    /** Rig do celular (T11): abrir sobe a mão e abre a tampa; fechar fecha a tampa e desce. */
    phone(action: "open" | "close") {
      if (action === "open" && (phone === "none" || phone === "closing")) {
        phone = "opening";
        phoneT = 0;
      } else if (action === "close" && (phone === "holding" || phone === "opening")) {
        phone = "closing";
        phoneT = 0;
        press = null;
      }
    },
    /** Polegar aperta uma tecla do celular aberto (atraso e duração sorteados: nunca dois iguais). */
    press(key: string) {
      if (phone !== "holding") return;
      press = { key, t: -(0.03 + rng() * 0.05), dur: 0.12 + rng() * 0.06, fired: false };
    },
    state: () => ({ mode, flashOn, idle, holster, light, phone }),
    step(dt: number, input: HandsInput): { pose: HandsPose; events: HandsEvent[] } {
      const events: HandsEvent[] = [];
      const lively = !reduced && !still;
      if (!still) t += dt;

      // celular: subir e abrir / fechar e descer (com movimento reduzido, cada um ≤ 120 ms)
      let lid = phone === "holding" ? 1 : 0;
      let phoneThumb = 0;
      let phoneRaise = phone === "holding" ? 1 : 0;
      if (phone === "opening" || phone === "closing") {
        phoneT += dt;
        const [a, b] = phone === "opening" ? [HANDS_TIMING.phoneRise, HANDS_TIMING.phoneFlick] : [HANDS_TIMING.phoneShut, HANDS_TIMING.phoneDrop];
        const scale = reduced ? HANDS_TIMING.reduced / (a + b) : 1;
        const [ta, tb] = [a * scale, b * scale];
        if (phone === "opening") {
          phoneRaise = clamp01(phoneT / ta);
          const f = clamp01((phoneT - ta) / tb);
          lid = smooth(f);
          phoneThumb = Math.sin(Math.PI * f);
          if (phoneT >= ta + tb - 1e-9) phone = "holding";
        } else {
          const f = clamp01(phoneT / ta);
          lid = 1 - smooth(f);
          phoneThumb = Math.sin(Math.PI * f);
          phoneRaise = 1 - clamp01((phoneT - ta) / tb);
          if (phoneT >= ta + tb - 1e-9) {
            phone = "none";
            lid = 0;
            phoneRaise = 0;
          }
        }
        if (phone === "holding") {
          lid = 1;
          phoneRaise = 1;
        }
      }
      let pressDepth = 0;
      let pressKey: string | null = null;
      if (press) {
        press.t += dt;
        const q = press.t / press.dur;
        pressKey = press.key;
        pressDepth = q <= 0 ? 0 : q < 0.35 ? q / 0.35 : q < 0.6 ? 1 : 1 - (q - 0.6) / 0.4;
        pressDepth = clamp01(pressDepth);
        if (!press.fired && q >= 0.35) {
          press.fired = true;
          pressDepth = 1;
          events.push(`key:${press.key}`);
        }
        if (q >= 1) {
          press = null;
          pressDepth = 0;
          pressKey = null;
        }
      }

      // guardar / sacar (o celular aberto também guarda a lanterna)
      const fast = reduced ? HANDS_TIMING.reduced : 0;
      const panel = input.panel || phone !== "none";
      if (panel && mode !== "holstered") mode = "holstering";
      if (!panel && mode !== "held") mode = "drawing";
      if (mode === "holstering") {
        holster = clamp01(holster + dt / (fast || HANDS_TIMING.holster));
        if (holster >= 1 - 1e-9) {
          holster = 1;
          mode = "holstered";
        }
      } else if (mode === "drawing") {
        holster = clamp01(holster - dt / (fast || HANDS_TIMING.draw));
        if (holster <= 1e-9) {
          holster = 0;
          mode = "held";
        }
      }

      // ligar / apagar: polegar aperta (click no fundo do curso), a luz troca logo depois
      let thumb = 0;
      if (toggleT >= 0) {
        toggleT += dt;
        const [down, hold, up, flip] = reduced ? [0.03, 0.05, 0.1, 0.05] : [0.07, 0.13, HANDS_TIMING.toggle, 0.11];
        thumb = toggleT < down ? toggleT / down : toggleT < hold ? 1 : 1 - (toggleT - hold) / (up - hold);
        thumb = clamp01(thumb);
        if (!clicked && toggleT >= down) {
          clicked = true;
          events.push("click");
        }
        if (toggleT >= flip) light = toggleTarget ? (!reduced && toggleT < flip + 0.035 ? 0.55 : 1) : 0;
        if (toggleT >= up) toggleT = -1;
      }

      // ociosas
      const canIdle = lively && mode === "held" && !input.moving && !input.aiming && !input.crouch && toggleT < 0;
      if (idle !== "none") {
        idleT += dt;
        if (!canIdle || idleT >= IDLE_SECONDS[idle]) {
          idle = "none";
          nextIdle = HANDS_TIMING.idleMin + rng() * HANDS_TIMING.idleSpan;
        }
      } else if (canIdle) {
        nextIdle -= dt;
        if (nextIdle <= 0) startIdle(IDLE_KINDS[Math.floor(rng() * IDLE_KINDS.length) % IDLE_KINDS.length]);
      } else {
        nextIdle = Math.max(nextIdle, 1.5);
      }
      const p = idle === "none" ? 0 : clamp01(idleT / IDLE_SECONDS[idle]);
      const bell = Math.sin(Math.PI * p);

      // base: mirar sobe e aproxima, agachar recolhe
      const target: Pose6 = { ...HELD };
      for (const [delta, on] of [
        [AIM, input.aiming],
        [CROUCH, input.crouch],
      ] as const) {
        if (!on) continue;
        for (const k of KEYS) target[k] += delta[k] ?? 0;
      }
      const k = still ? 1 : Math.min(1, dt * (reduced ? 30 : 10));
      for (const key of KEYS) base[key] = lerp(base[key], target[key], k);

      // balanço do passo: vertical, lateral e giro do pulso defasados; a amplitude entra e sai suave
      const ampTarget = lively && input.moving ? (input.run ? 2 : input.crouch ? 0.5 : 1) : 0;
      swayAmp = lerp(swayAmp, ampTarget, still ? 1 : Math.min(1, dt * 6));
      const b = input.bob;
      const by = Math.abs(Math.sin(b)) * SWAY.y * swayAmp;
      const bx = Math.cos(b) * SWAY.x * swayAmp;
      const broll = Math.sin(b + 0.6) * SWAY.rz * swayAmp;
      const bpitch = Math.sin(2 * b + 1.1) * SWAY.rx * swayAmp;
      const breathe = lively ? 1 : 0;
      const right: Pose6 = {
        x: base.x + bx + Math.sin(t * 1.1) * 0.0018 * breathe,
        y: base.y - by + Math.sin(t * 1.4) * 0.0022 * breathe,
        z: base.z,
        rx: base.rx + bpitch + Math.sin(t * 0.9) * 0.004 * breathe,
        ry: base.ry + (idle === "sway" ? Math.sin(2 * Math.PI * p) * 0.06 * (1 - p) : 0),
        rz: base.rz + broll + (idle === "sway" ? bell * 0.05 : 0),
      };
      const h = smooth(holster);
      for (const key of KEYS) right[key] = lerp(right[key], HOLSTERED[key], h);

      let grip = idle === "regrip" ? 0.9 * Math.sin(2 * Math.PI * p) * (1 - 0.4 * p) : 0;
      // guardada, a mão afrouxa
      grip = lerp(grip, -0.5, h);

      // mão esquerda: alcança (agir), ajeita (ociosa) ou descansa abaixo do quadro
      reachLeft = Math.max(0, reachLeft - (still ? 0 : dt));
      const lt = reachLeft > 0 ? LEFT_REACH : idle === "adjust" ? LEFT_ADJUST : LEFT_REST;
      const kl = still ? 1 : Math.min(1, dt * (reduced ? 30 : 8));
      for (const key of [...KEYS, "curl"] as const) left[key] = lerp(left[key], lt[key], kl);
      // celular: a mão esquerda segue a subida/descida (as transições têm tempo próprio, não o do lerp)
      const raise = smooth(phoneRaise);
      const lp = { ...left };
      if (phone !== "none") for (const key of [...KEYS, "curl"] as const) lp[key] = lerp(left[key], LEFT_PHONE[key], raise);
      if (phone !== "none" && raise >= 1) for (const key of [...KEYS, "curl"] as const) left[key] = LEFT_PHONE[key];
      const sl = SWAY.left;
      const leftOut = { ...lp, x: lp.x - bx * sl, y: lp.y - by * sl, rz: lp.rz - broll * sl };

      const phoneOut = { visible: phone !== "none", lid, key: pressKey, press: pressDepth, thumb: Math.max(phoneThumb, pressDepth) };
      return { pose: { right, grip, thumb, left: leftOut, light, holster, phone: phoneOut }, events };
    },
  };
}

export type HandsAnim = ReturnType<typeof createHandsAnim>;
