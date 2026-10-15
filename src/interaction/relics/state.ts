import { RELIC_IDS, isRelicId, type RelicId } from "./catalog";

export type RunTicket = { issuedAt: number; token: string };

export type RelicState = {
  won: RelicId[];
  runId: string | null;
  startedAt: number | null;
  platinumAt: number | null;
  /** Bilhete do servidor (Fase 6, D4): autentica a run no livro. */
  ticket: RunTicket | null;
  /** Posição no livro depois de gravar (a tela de platina mostra em vez do formulário). */
  recordedPosition: number | null;
};

export const EMPTY_STATE: RelicState = {
  won: [],
  runId: null,
  startedAt: null,
  platinumAt: null,
  ticket: null,
  recordedPosition: null,
};

/** Inicia a run (cronômetro da platina) uma única vez. */
export function startRun(state: RelicState, runId: string, now: number): RelicState {
  return state.startedAt !== null ? state : { ...state, runId, startedAt: now };
}

export function unlockRelic(state: RelicState, id: RelicId, now: number) {
  if (state.won.includes(id)) return { state, isNew: false, becamePlatinum: false };
  const won = [...state.won, id];
  const becamePlatinum = won.length === RELIC_IDS.length;
  return {
    state: { ...state, won, platinumAt: becamePlatinum ? now : state.platinumAt },
    isNew: true,
    becamePlatinum,
  };
}

/** Guarda o bilhete uma única vez; o runId passa a ser o do servidor e o cronômetro local não muda. */
export function attachTicket(state: RelicState, ticket: { runId: string; issuedAt: number; token: string }): RelicState {
  if (state.ticket) return state;
  return { ...state, runId: ticket.runId, ticket: { issuedAt: ticket.issuedAt, token: ticket.token } };
}

export function markRecorded(state: RelicState, position: number): RelicState {
  return { ...state, recordedPosition: position };
}

const finite = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

function parseTicket(raw: Record<string, unknown>): RunTicket | null {
  const issuedAt = finite(raw.issuedAt);
  return issuedAt !== null && typeof raw.token === "string" && raw.token !== "" ? { issuedAt, token: raw.token } : null;
}

export function parseRelicState(raw: string | null): RelicState {
  if (!raw) return EMPTY_STATE;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const won = Array.isArray(value.won) ? [...new Set(value.won.filter(isRelicId))] : [];
    return {
      won,
      runId: typeof value.runId === "string" ? value.runId : null,
      startedAt: finite(value.startedAt),
      platinumAt: won.length === RELIC_IDS.length ? finite(value.platinumAt) : null,
      ticket:
        value.ticket && typeof value.ticket === "object"
          ? parseTicket(value.ticket as Record<string, unknown>)
          : null,
      recordedPosition: (() => {
        const position = finite(value.recordedPosition);
        return position !== null && Number.isInteger(position) && position >= 1 ? position : null;
      })(),
    };
  } catch {
    return EMPTY_STATE;
  }
}

export function platinumElapsedMs(state: RelicState): number | null {
  return state.platinumAt !== null && state.startedAt !== null ? state.platinumAt - state.startedAt : null;
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}
