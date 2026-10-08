import { useSyncExternalStore } from "react";
import { STORAGE_KEYS } from "@/interaction/boot";
import { getRelic, type RelicId } from "./catalog";
import { EMPTY_STATE, parseRelicState, startRun, unlockRelic, type RelicState } from "./state";

type UnlockListener = (relic: ReturnType<typeof getRelic>, state: RelicState, becamePlatinum: boolean) => void;

let state: RelicState = EMPTY_STATE;
let hydrated = false;
const listeners = new Set<() => void>();
const unlockListeners = new Set<UnlockListener>();

function newRunId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEYS.relics, JSON.stringify(state));
  } catch {}
}

function emit() {
  listeners.forEach((listener) => listener());
}

export const relicStore = {
  hydrate() {
    if (hydrated || typeof window === "undefined") return;
    hydrated = true;
    try {
      state = parseRelicState(localStorage.getItem(STORAGE_KEYS.relics));
    } catch {
      state = EMPTY_STATE;
    }
    if (state.startedAt === null) {
      state = startRun(state, newRunId(), Date.now());
      persist();
    }
    emit();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot(): RelicState {
    return state;
  },
  unlock(id: RelicId) {
    const result = unlockRelic(state, id, Date.now());
    if (!result.isNew) return;
    state = result.state;
    persist();
    emit();
    const relic = getRelic(id);
    unlockListeners.forEach((listener) => listener(relic, state, result.becamePlatinum));
  },
  onUnlock(listener: UnlockListener) {
    unlockListeners.add(listener);
    return () => {
      unlockListeners.delete(listener);
    };
  },
};

export function useRelics(): RelicState {
  return useSyncExternalStore(relicStore.subscribe, relicStore.getSnapshot, () => EMPTY_STATE);
}
