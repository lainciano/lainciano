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

/**
 * Abre um painel com desfazer: empilha, sincroniza (a lanterna guarda, a mira e o brilho apagam) e SÓ ENTÃO constrói
 * o que o painel mostra (a cópia do exame lê materiais já sem o brilho da mira). Se construir lançar, desempilha e
 * sincroniza de novo: nenhum painel fantasma (modo preso, mouse solto, sem cartão) e o erro segue adiante.
 */
export function openPanel(stack: PanelStack, panel: Panel, sync: () => void, build: () => void): void {
  stack.push(panel);
  sync();
  try {
    build();
  } catch (error) {
    stack.pop();
    sync();
    throw error;
  }
}
