import { STORAGE_KEYS } from "@/interaction/boot";
import { isExplorerComplete, parseVisited, visitArea, type ExplorerArea } from "./explorer";
import { relicStore } from "./store";

let visited: readonly ExplorerArea[] | null = null;

function load(): readonly ExplorerArea[] {
  if (visited) return visited;
  try {
    visited = parseVisited(localStorage.getItem(STORAGE_KEYS.explorer));
  } catch {
    visited = [];
  }
  return visited;
}

/** Explorador (spec 8.4): cada página marca sua área; as 7 dão a relíquia (o relicStore ignora repetição). */
export const explorerStore = {
  visit(area: ExplorerArea) {
    const before = load();
    const next = visitArea(before, area);
    if (next !== before) {
      visited = next;
      try {
        localStorage.setItem(STORAGE_KEYS.explorer, JSON.stringify(next));
      } catch {}
    }
    if (isExplorerComplete(next)) relicStore.unlock("explorador");
  },
};
