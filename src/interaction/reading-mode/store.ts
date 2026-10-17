import { useSyncExternalStore } from "react";
import { STORAGE_KEYS } from "@/interaction/boot";
import { parseReadingPref, resolveReading, type ReadingPref } from "./resolve";

let pref: ReadingPref = "auto";
let reduced = false;
let initialized = false;
const listeners = new Set<() => void>();

function apply() {
  document.documentElement.dataset.reading = resolveReading(pref, reduced) ? "on" : "off";
}

function emit() {
  listeners.forEach((listener) => listener());
}

export const readingStore = {
  init() {
    if (initialized || typeof window === "undefined") return;
    initialized = true;
    try {
      pref = parseReadingPref(localStorage.getItem(STORAGE_KEYS.reading));
    } catch {
      pref = "auto";
    }
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduced = mq.matches;
    mq.addEventListener("change", (event) => {
      reduced = event.matches;
      apply();
      emit();
    });
    apply();
    emit();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot(): boolean {
    return resolveReading(pref, reduced);
  },
  set(next: ReadingPref) {
    pref = next;
    try {
      localStorage.setItem(STORAGE_KEYS.reading, next);
    } catch {}
    apply();
    emit();
  },
  toggle() {
    readingStore.set(readingStore.getSnapshot() ? "off" : "on");
  },
};

export function useReadingMode(): boolean {
  return useSyncExternalStore(readingStore.subscribe, readingStore.getSnapshot, () => false);
}
