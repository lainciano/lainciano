import type { Line } from "../layers/types";

/**
 * Fila curta de falas com prioridade (T12): nenhuma dica corta fala de história.
 * - Tiers: história (fala e som dos objetos) > pista da escada (`hint: true`) > aviso de sistema ("nada ao alcance",
 *   "segure E…").
 * - Fala igual ou mais forte que a da tela entra na hora (a mais nova vale: o jogador agiu). Uma pista cortada por
 *   história antes da metade do tempo dela volta para a frente da fila (a pista não se perde).
 * - Mais fraca espera: até 3 pistas (as mais novas) e 1 aviso de sistema, que cai se envelhecer (`SYSTEM_TTL`)
 *   antes de aparecer: um "segure E" fora de hora confunde mais do que ajuda.
 * - Aviso de sistema vindo de um gesto do jogador (`gesture: true`: "segure E…", "nada ao alcance") corta a pista
 *   (ela volta para a fila, como na história), mas nunca a história.
 * - Pausado (mouse solto pelo Esc, jogo fora de "live"): a pista na tela volta para a frente da fila e nenhuma pista
 *   sai da fila até voltar (a legenda some sob o "pausado"; uma pista não pode expirar invisível).
 * Lógica pura: o tempo é o `now` (segundos) de quem chama; a casca agenda o `expire` pelo tempo da fala.
 */

export const TIER = { system: 0, hint: 1, story: 2 } as const;
const MAX_HINTS = 3;
/** Quanto um aviso de sistema pode esperar na fila (s). */
export const SYSTEM_TTL = 2.5;

export function tierOf(l: Line): number {
  if ((l.kind ?? "speech") === "system") return TIER.system;
  return l.hint ? TIER.hint : TIER.story;
}

export type LineQueue = {
  /** Uma fala chega. Devolve a que passa a aparecer agora, ou `null` se a da tela continua (a nova esperou ou caiu). */
  offer(line: Line, now: number): Line | null;
  /** O tempo da fala atual correu: devolve a próxima (ou `null`, tela limpa). Antes da hora, devolve a mesma. */
  expire(now: number): Line | null;
  current(): Line | null;
  /** Até quando (s) a fala atual fica na tela. */
  until(): number;
  /** Pausa/retoma (idempotente). Pausar devolve à fila a pista que estava na tela e segura as da fila. */
  pause(on: boolean): void;
  /** Legendas desligadas: tira a fala de história da tela; pistas e avisos (na tela ou na fila) ficam. */
  dropStory(): void;
  clear(): void;
};

export function createLineQueue(duration: (l: Line) => number): LineQueue {
  let cur: { line: Line; start: number; until: number } | null = null;
  let hints: Line[] = [];
  let system: { line: Line; deadline: number } | null = null;
  let paused = false;

  const show = (line: Line, now: number) => {
    cur = { line, start: now, until: now + duration(line) };
    return line;
  };
  const enqueueHint = (line: Line, front = false) => {
    hints = front ? [line, ...hints] : [...hints, line];
    if (hints.length > MAX_HINTS) hints = front ? hints.slice(0, MAX_HINTS) : hints.slice(-MAX_HINTS);
  };

  return {
    offer(line, now) {
      if (paused && tierOf(line) === TIER.hint) {
        enqueueHint(line);
        return null;
      }
      if (!cur || now >= cur.until) return show(line, now);
      const incoming = tierOf(line);
      const showing = tierOf(cur.line);
      const gestureCutsHint = line.gesture === true && showing === TIER.hint;
      if (incoming >= showing || gestureCutsHint) {
        if (showing === TIER.hint && (incoming > showing || gestureCutsHint) && now - cur.start < (cur.until - cur.start) / 2) enqueueHint(cur.line, true);
        return show(line, now);
      }
      if (incoming === TIER.hint) enqueueHint(line);
      else system = { line, deadline: now + SYSTEM_TTL };
      return null;
    },
    expire(now) {
      if (cur && now < cur.until) return cur.line;
      cur = null;
      const next = paused ? undefined : hints.shift();
      if (next) return show(next, now);
      const s = system;
      system = null;
      if (s && now <= s.deadline) return show(s.line, now);
      return null;
    },
    current: () => cur?.line ?? null,
    until: () => cur?.until ?? 0,
    pause(on) {
      if (on === paused) return;
      paused = on;
      if (on && cur && tierOf(cur.line) === TIER.hint) {
        enqueueHint(cur.line, true);
        cur = null;
      }
    },
    dropStory() {
      if (cur && tierOf(cur.line) === TIER.story) cur = null;
    },
    clear() {
      cur = null;
      hints = [];
      system = null;
    },
  };
}
