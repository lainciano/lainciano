import type { InputMode } from "../input/actions";

/**
 * Pilha de painéis (T9; o leitor da T10 e o celular da T11 usam a mesma): quem abre empilha, quem fecha desempilha,
 * e o modo de entrada é o do topo. Fechar um documento aberto pelo celular volta ao celular, não ao jogo; só a
 * pilha vazia é "andar". Lógica pura, sem DOM nem three.
 */
export type PanelMode = Exclude<InputMode, "walk">;
export type Panel = { mode: PanelMode; id?: string };

export type PanelStack = {
  push(p: Panel): void;
  pop(): Panel | undefined;
  /** Cópia do painel do topo (mexer nela não mexe na pilha). */
  top(): Panel | undefined;
  /** Modo de entrada em vigor: o do topo, ou `walk` com a pilha vazia. */
  mode(): InputMode;
  size(): number;
  has(mode: PanelMode): boolean;
  clear(): void;
};

export function createPanelStack(): PanelStack {
  const items: Panel[] = [];
  return {
    push(p) {
      items.push({ ...p });
    },
    pop() {
      return items.pop();
    },
    top() {
      const t = items[items.length - 1];
      return t ? { ...t } : undefined;
    },
    mode() {
      return items[items.length - 1]?.mode ?? "walk";
    },
    size: () => items.length,
    has: (mode) => items.some((p) => p.mode === mode),
    clear() {
      items.length = 0;
    },
  };
}
