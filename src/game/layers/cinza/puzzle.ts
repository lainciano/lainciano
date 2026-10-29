import type { Puzzle, PuzzleEffect } from "../../puzzles/types";
import type { SaveV1 } from "../../save/schema";
import type { HoldSpec } from "../types";
import { DOOR_FLAG } from "./places";

/**
 * Puzzle da sala cinza (Fase 1A, prova do motor; bíblia 8 como molde). Redutor puro; o estado mora em
 * `save.puzzles.cinza` e sobrevive ao recarregar.
 *
 * - Estado inicial: porta norte trancada, bilhete na mesa, chave da porta no fundo da prateleira de cima do armário
 *   (não se vê: a chavinha com borla na fechadura do armário é do próprio armário).
 * - Ações: ler o bilhete (E/toque no bilhete), pegar a chave (E/toque no armário), usar a porta (E/toque na porta),
 *   forçar a porta (segurar E, o clique ou o dedo por 1,4 s, só depois da 3ª pista), e a pista que a escada solta.
 * - Solução: o bilhete diz onde está a chave → pegar no armário → usar na porta. Quem não leu o bilhete acha a chave
 *   depois da 2ª pista (ela diz o mesmo).
 * - Acerto: a chave gira, a porta abre (efeito `open` na `porta-norte`). Erro: "trancada." e uma batida.
 * - Escada: 3 pistas, uma a cada 60 s sem avançar (ver `createHintLadder`). Saída: forçar, com `forced: true`.
 * - Depois de recarregar: o bilhete lido, a chave no inventário, as pistas já dadas e a porta aberta continuam.
 *
 * TEXTO EM RASCUNHO (bilhete, falas e verbos): a aprovar pelo dono. As pistas são as do plano.
 */

export type CinzaState = {
  keyTaken: boolean;
  noteRead: boolean;
  doorOpen: boolean;
  forced: boolean;
  /**
   * Pistas já dadas (0..3). Além do plano (que fixava só os quatro campos acima): o redutor precisa saber se a 3ª
   * pista já saiu para liberar `force-door`, e recarregar não pode repetir pistas nem trancar de novo a saída.
   */
  hints: number;
};

/** `hint`: a escada soltou mais uma pista (a fala sai pela sessão, com prioridade de dica). */
export type CinzaAction = { type: "take-key" } | { type: "read-note" } | { type: "use-door" } | { type: "force-door" } | { type: "hint" };

export const CINZA_HINTS = [
  "o bilhete na mesa fala de um armário.",
  "a chave fica na prateleira de cima do armário.",
  "a porta ao norte usa a chave. ou cede, se insistir.",
] as const;

/** Falas do puzzle (rascunho, a aprovar pelo dono). */
export const CINZA_LINES = {
  /** E no armário sem saber da chave: a chavinha que se vê na fechadura é do próprio armário. */
  wardrobeBlind: "cabides vazios e cheiro de naftalina. a chavinha na fechadura é só do armário.",
  keyFound: "na prateleira de cima, lá no fundo: uma chave de ferro, comprida.",
  wardrobeEmpty: "só cabides e naftalina agora.",
  doorLocked: "trancada.",
  doorUnlocked: "a chave gira com esforço. a porta cede.",
  doorForced: "a fechadura estala e cede. a porta abre torta.",
  doorOpen: "do outro lado, só o escuro frio.",
} as const;

/** Item do inventário (o celular mostra) enquanto a chave está na mão. */
export const KEY_ITEM = "chave";
/** Alvo do efeito `open`: a porta norte (a camada liga a flag `DOOR_FLAG` e abre a folha). */
export const DOOR_TARGET = "porta-norte";
/** Segurar para forçar (como o cadeado do protótipo 7). */
export const FORCE_HOLD: HoldSpec = { seconds: 1.4, verb: "forçar a porta" };

const INITIAL: CinzaState = { keyTaken: false, noteRead: false, doorOpen: false, forced: false, hints: 0 };
const say = (text: string): PuzzleEffect => ({ type: "say", text });
const same = (s: CinzaState, ...effects: PuzzleEffect[]) => ({ state: s, effects });
const knowsWhere = (s: CinzaState) => s.noteRead || s.hints >= 2;

export const cinzaPuzzle: Puzzle<CinzaState, CinzaAction> = {
  id: "cinza",
  initial: INITIAL,
  hints: CINZA_HINTS,
  exit: { type: "force-door" },
  solved: (s) => s.doorOpen,
  reduce(s, a) {
    switch (a.type) {
      case "read-note":
        return s.noteRead ? same(s) : same({ ...s, noteRead: true });
      case "take-key":
        if (s.keyTaken) return same(s, say(CINZA_LINES.wardrobeEmpty));
        if (!knowsWhere(s)) return same(s, say(CINZA_LINES.wardrobeBlind));
        return same({ ...s, keyTaken: true }, { type: "sfx", name: "key" }, say(CINZA_LINES.keyFound));
      case "use-door":
        if (s.doorOpen) return same(s, say(CINZA_LINES.doorOpen));
        if (!s.keyTaken) return same(s, { type: "sfx", name: "knock" }, say(CINZA_LINES.doorLocked));
        return same({ ...s, doorOpen: true }, { type: "sfx", name: "unlock" }, say(CINZA_LINES.doorUnlocked), { type: "open", target: DOOR_TARGET });
      case "force-door":
        // a saída só existe depois da última pista (nunca antes: o puzzle tem de ter a chance de ser resolvido)
        if (s.doorOpen || s.hints < CINZA_HINTS.length) return same(s);
        return same({ ...s, doorOpen: true, forced: true }, { type: "sfx", name: "force" }, say(CINZA_LINES.doorForced), { type: "open", target: DOOR_TARGET });
      case "hint":
        return s.hints >= CINZA_HINTS.length ? same(s) : same({ ...s, hints: s.hints + 1 });
    }
  },
};

/** Estado do puzzle no save; ausente, estragado ou de outro formato vira o inicial (campo a campo). */
export function readCinza(save: SaveV1): CinzaState {
  const raw = save.puzzles.cinza;
  if (!raw || typeof raw !== "object") return INITIAL;
  const p = raw as Record<string, unknown>;
  const hints = typeof p.hints === "number" && Number.isFinite(p.hints) ? Math.min(CINZA_HINTS.length, Math.max(0, Math.floor(p.hints))) : 0;
  return { keyTaken: p.keyTaken === true, noteRead: p.noteRead === true, doorOpen: p.doorOpen === true, forced: p.forced === true, hints };
}

/** A chave está na mão: pegou e ainda não a deixou na fechadura da porta (abrir forçando não gasta a chave). */
const keyInHand = (s: CinzaState) => s.keyTaken && !(s.doorOpen && !s.forced);

/**
 * Patch do save para o estado novo (Ruling 8: `flags`/`puzzles` fundem 1 nível, `items` é substituído inteiro):
 * o estado em `puzzles.cinza`, a chave no inventário enquanto está na mão e a flag da porta norte.
 */
export function cinzaPatch(save: SaveV1, next: CinzaState): Partial<SaveV1> {
  const has = save.items.includes(KEY_ITEM);
  const want = keyInHand(next);
  const items = want === has ? save.items : want ? [...save.items, KEY_ITEM] : save.items.filter((i) => i !== KEY_ITEM);
  return { puzzles: { cinza: next }, items, flags: { [DOOR_FLAG]: next.doorOpen } };
}

/** Passos dados (bilhete, chave, porta): quando muda, a escada de pistas zera o relógio. Pista não é passo. */
export function cinzaSteps(s: CinzaState): number {
  return Number(s.noteRead) + Number(s.keyTaken) + Number(s.doorOpen);
}

/** A porta é de segurar (forçar) só depois da 3ª pista, fechada e sem a chave na mão; senão, E age na hora. */
export function doorHold(save: SaveV1): HoldSpec | undefined {
  const s = readCinza(save);
  return !s.doorOpen && !s.keyTaken && s.hints >= CINZA_HINTS.length ? FORCE_HOLD : undefined;
}
