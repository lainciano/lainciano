import type * as THREE from "three";
import type { HoldSpec, InteractiveObject } from "../layers/types";
import type { Player } from "../player/controller";
import type { SaveV1 } from "../save/schema";
import { createGlow } from "./glow";
import { createHold, holdFor, type Hold } from "./hold";
import { aimPoint, cycleOrder, nextInCycle, objectVisible, promptFor, type PromptModel } from "./targeting";

/**
 * Interação do jogador com os objetos da camada (T9): junta a mira (que é do jogador, com histerese), o aviso, o
 * brilho, o segurar e o ciclo. Não conhece o DOM: fala com a casca por `InteractionUi`.
 *
 * - O aviso e o brilho existem SÓ com o objeto mirado e ao alcance (1,45 m no chão, 2,4 m em 3D).
 * - `E` com alvo age (ou começa o segurar, se o objeto é de segurar); `E` sem alvo ao alcance faz o ciclo, `Q`
 *   sempre faz: o olhar vira para o próximo objeto do lugar (habilitado, visível, não encoberto).
 * - Painel aberto: sem aviso, sem brilho, o segurar cai, `E` não faz nada aqui (o painel trata as próprias teclas).
 * - Toque (`coarse`): não há mira de passagem; tocar num objeto ao alcance age, num de segurar mostra a dica.
 */

export type InteractionUi = {
  /** Aviso (null esconde). Só muda quando o texto, a tecla ou o anel mudam (anel em 40 passos). */
  prompt(p: PromptModel | null): void;
  /** Mira: apagada (painel/toque), parada, ou sobre um alvo ao alcance. */
  reticle(s: "off" | "idle" | "hot"): void;
  /** Dica curta: nada ao alcance daqui, ou "segure E para <verbo>". */
  notice(n: { kind: "nothing" } | { kind: "hold"; verb: string }): void;
};

export type InteractionOptions = {
  three: typeof THREE;
  camera: THREE.Camera;
  player: Pick<Player, "aimedId" | "aimTarget" | "place" | "lookAt" | "reduced">;
  objects: readonly InteractiveObject[];
  save: () => SaveV1;
  /** Aciona o objeto (a casca monta o `ActApi`). */
  act(o: InteractiveObject): void;
  ui: InteractionUi;
  coarse?: boolean;
};

export type InteractionState = {
  aimedId: string | null;
  holdId: string | null;
  holdProgress: number;
  glow: string | null;
  /** Intensidade do brilho agora (0..1; fixo em 0,5 com movimento reduzido). */
  glowLevel: number;
  panel: boolean;
  lastCycled: string | null;
};

export type Interaction = {
  update(dt: number, t: number): void;
  /** E / clique apertado. */
  press(): void;
  /** E / clique solto. */
  release(): void;
  /** Q: vira para o próximo objeto do lugar. */
  cycle(): void;
  /** Vira o olhar para um ponto do objeto que o centro da tela acerta (ciclo, depuração). */
  face(o: InteractiveObject): void;
  /** Toque num objeto ao alcance. */
  activate(o: InteractiveObject): void;
  setPanel(open: boolean): void;
  state(): InteractionState;
  dispose(): void;
};

const RING_STEPS = 40;

export function createInteraction(opts: InteractionOptions): Interaction {
  const { three, player, objects, ui } = opts;
  const coarse = opts.coarse === true;
  const glow = createGlow(objects, () => player.reduced);
  const byId = (id: string | null) => (id === null ? undefined : objects.find((o) => o.id === id));

  let panel = false;
  let disposed = false;
  let hold: Hold | null = null;
  let holdObj: InteractiveObject | null = null;
  /** O segurar em curso fica como começou (o estado mudar no meio não troca a duração nem o verbo). */
  let holdSpec: HoldSpec | null = null;
  let lastCycled: string | null = null;
  let shown = "";
  let reticle = "";
  const point = new three.Vector3();
  const eye = new three.Vector3();
  const raycaster = new three.Raycaster();

  const emit = (p: PromptModel | null) => {
    // O anel anda em passos: poucas renderizações da casca e nenhum resíduo de ponto flutuante (0 é 0).
    const step = p && p.progress !== null ? Math.round(p.progress * RING_STEPS) : null;
    const key = p ? `${p.text}|${p.key}|${step ?? "-"}` : "";
    if (key === shown) return;
    shown = key;
    ui.prompt(p && step !== null ? { ...p, progress: step / RING_STEPS } : p);
  };
  const setReticle = (s: "off" | "idle" | "hot") => {
    if (s === reticle) return;
    reticle = s;
    ui.reticle(s);
  };
  const endHold = () => {
    hold?.cancel();
    hold = null;
    holdObj = null;
    holdSpec = null;
  };

  /** O alvo de agora: o da histerese, ou (para não perder o primeiro aperto) a leitura crua se já está ao alcance. */
  const aimed = (): InteractiveObject | undefined => {
    const id = player.aimedId ?? (player.aimTarget?.inReach ? player.aimTarget.id : null);
    const o = byId(id);
    return o && o.enabled(opts.save()) ? o : undefined;
  };

  const startHold = (o: InteractiveObject) => {
    const spec = holdFor(o, opts.save());
    if (!spec) return;
    hold = createHold(spec.seconds);
    holdObj = o;
    holdSpec = spec;
    hold.press();
  };

  const face = (o: InteractiveObject) => {
    opts.camera.getWorldPosition(eye);
    aimPoint(three, raycaster, eye, objects, o, opts.save(), point);
    player.lookAt(point.x, point.y, point.z);
  };

  const cycle = () => {
    if (disposed || panel) return;
    const order = cycleOrder(objects, player.place, opts.save(), objectVisible);
    const next = nextInCycle(order, lastCycled);
    const o = byId(next);
    if (!o) {
      ui.notice({ kind: "nothing" });
      return;
    }
    lastCycled = o.id;
    face(o);
  };

  const hint = (o: InteractiveObject) => {
    const spec = holdFor(o, opts.save());
    if (spec) ui.notice({ kind: "hold", verb: spec.verb });
  };

  return {
    update(dt, t) {
      if (disposed) return;
      if (panel) {
        endHold();
        glow.set(null);
        emit(null);
        setReticle("off");
        return;
      }
      if (holdObj && hold) {
        // O segurar vale enquanto o mesmo objeto segue mirado; sair dele (ou o gesto acabar) fecha.
        if (hold.pressed && aimed()?.id !== holdObj.id) {
          endHold();
        } else {
          const r = hold.update(dt);
          if (r.done) {
            const o = holdObj;
            endHold();
            opts.act(o);
          } else if (!hold.pressed && r.progress === 0) {
            endHold();
          }
        }
      }
      // O aviso e o brilho seguem o alvo da histerese (o mesmo que levanta a mão), não a leitura crua.
      const strict = coarse ? undefined : byId(player.aimedId);
      glow.set(strict ? strict.id : null);
      glow.update(t);
      setReticle(coarse ? "off" : strict ? "hot" : "idle");
      if (holdObj && hold && holdSpec) {
        emit({ text: holdSpec.verb, key: "hold", progress: hold.progress });
      } else {
        emit(strict ? promptFor({ id: strict.id, inReach: true }, strict, opts.save(), 0, false) : null);
      }
    },
    press() {
      if (disposed || panel) return;
      const o = aimed();
      if (!o) return cycle();
      if (holdFor(o, opts.save())) startHold(o);
      else opts.act(o);
    },
    release() {
      if (disposed || !hold || !holdObj) return;
      const spec = holdSpec;
      const r = hold.release();
      if (r.tooShort) {
        if (spec) ui.notice({ kind: "hold", verb: spec.verb });
        endHold();
      } else if (r.done) {
        endHold();
      }
    },
    cycle,
    face(o) {
      if (!disposed && !panel) face(o);
    },
    activate(o) {
      if (disposed || panel) return;
      if (holdFor(o, opts.save())) hint(o);
      else opts.act(o);
    },
    setPanel(open) {
      panel = open;
      if (open) {
        endHold();
        glow.set(null);
      }
    },
    state: () => ({
      aimedId: player.aimedId,
      holdId: holdObj?.id ?? null,
      holdProgress: hold?.progress ?? 0,
      glow: glow.current,
      glowLevel: glow.level,
      panel,
      lastCycled,
    }),
    dispose() {
      if (disposed) return;
      disposed = true;
      endHold();
      glow.dispose();
    },
  };
}
