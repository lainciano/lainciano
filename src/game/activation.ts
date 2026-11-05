import { useSyncExternalStore } from "react";
import { STORAGE_KEYS } from "@/interaction/boot";

/** A chave de ativação só vale com o texto exato "on". */
export function parseGameFlag(raw: string | null): boolean {
  return raw === "on";
}

export type Activation = { enabled: boolean; persist: "on" | null; cleanSearch: string };

/**
 * Lê `?jogo=1` e a chave guardada. Só "1" liga pela URL (e pede para gravar); qualquer `jogo=` sai da URL.
 * Desligar é pelo console (`jogo off`), nunca por parâmetro.
 */
export function readActivation(search: string, stored: string | null): Activation {
  const params = new URLSearchParams(search);
  const fromUrl = params.get("jogo") === "1";
  params.delete("jogo");
  const rest = params.toString();
  return {
    enabled: fromUrl || parseGameFlag(stored),
    persist: fromUrl ? "on" : null,
    cleanSearch: rest ? `?${rest}` : "",
  };
}

let memoryFlag = false; // fallback quando o localStorage está bloqueado
let open = false;
const listeners = new Set<() => void>();
const emit = () => {
  for (const listener of [...listeners]) listener();
};

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.game);
  } catch {
    return memoryFlag ? "on" : null;
  }
}

/** Chave de ativação e estado aberto/fechado do jogo. Não toca DOM: só guarda e avisa quem escuta. */
export const gameStore = {
  isEnabled: () => parseGameFlag(readStored()),
  setEnabled(on: boolean): void {
    memoryFlag = on;
    try {
      if (on) localStorage.setItem(STORAGE_KEYS.game, "on");
      else localStorage.removeItem(STORAGE_KEYS.game);
    } catch {
      /* sem storage: vale só nesta sessão */
    }
    if (!on) gameStore.close();
  },
  requestOpen(): boolean {
    if (open || !gameStore.isEnabled()) return false;
    open = true;
    emit();
    return true;
  },
  isOpen: () => open,
  close(): void {
    if (!open) return;
    open = false;
    emit();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function useGameOpen(): boolean {
  return useSyncExternalStore(gameStore.subscribe, gameStore.isOpen, () => false);
}
