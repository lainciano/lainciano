import { isRelease, type Action, type InputMode } from "../input/actions";
import type { InputBinding } from "../input/adapters";
import type { Examine } from "../interaction/examine";
import type { Interaction } from "../interaction/interaction";
import type { ActApi, Doc, LayerInstance } from "../layers/types";
import type { Player } from "../player/controller";
import type { SaveApi } from "../save/store";
import { createPanelStack, openPanel, type PanelStack } from "../shell/panelStack";
import { createReaderFlow, type ReaderClose, type ReaderFlow, type ReaderView } from "../shell/readerFlow";

/**
 * Painéis da sessão (extraído do `session.ts` na T11, sem mudar comportamento): a pilha, o que acontece ao abrir e
 * fechar cada painel (lista de lugares, exame, leitor) e o roteamento das ações enquanto um painel está no topo.
 *
 * - Com algum painel aberto a lanterna guarda, a mira e o aviso se apagam (`sync`); pilha vazia, tudo volta.
 * - Abrir empilha ANTES de construir (a cópia do exame lê o emissivo já sem o brilho da mira): `openPanel` desfaz
 *   se construir lançar.
 * - Fechar um documento aberto a partir do celular volta ao celular (`ReaderClose.emptied` diz se a pilha esvaziou:
 *   só então o mouse pode travar de novo).
 * O celular (T11) entra pela mesma pilha: ver `runtime/phone.ts`.
 */

export type PlaceItem = { id: string; name: string; here: boolean };
export type ExamineInfo = { title: string; text: string };

export type PanelsUi = {
  /** Lista de lugares aberta (`L`) ou fechada (`null`). */
  places(list: PlaceItem[] | null): void;
  /** Exame aberto (título e texto) ou fechado (`null`). */
  examine(info: ExamineInfo | null): void;
  /** Leitor aberto (documento e nível: papel ou texto limpo) ou fechado (`null`). */
  reader(view: ReaderView | null): void;
};

export type PanelsDeps = {
  ui: PanelsUi;
  save: SaveApi;
  player(): Player | null;
  interaction(): Interaction | null;
  examine(): Examine | null;
  input(): InputBinding | null;
  layer(): LayerInstance | null;
};

export type Panels = {
  stack: PanelStack;
  reader: ReaderFlow;
  mode(): InputMode;
  /** Lanterna, mira e aviso seguem a pilha. */
  sync(): void;
  openReader(doc: Doc, opts?: { returnTo?: "phone" }): void;
  closeReader(): ReaderClose;
  openExamine(o: Parameters<ActApi["examine"]>[0]): void;
  closeExamine(): void;
  openPlaces(): void;
  closePlaces(): void;
  /**
   * Ação com um painel no topo (lista, exame, leitor). Devolve `true` se o painel tratou; `false` para os modos que
   * não são daqui (`walk` e `phone`). Soltar (parar de andar, de correr…) chega sempre ao jogador.
   */
  handle(a: Action): boolean;
};

export function createPanels(d: PanelsDeps): Panels {
  const stack = createPanelStack();
  const mode = (): InputMode => stack.mode();

  const sync = () => {
    const open = stack.size() > 0;
    d.player()?.setPanel(open);
    d.interaction()?.setPanel(open);
  };

  /** Leitor em dois níveis (T10): painel `read` na pilha; fechar volta ao que estava embaixo (o celular, na T11). */
  const reader = createReaderFlow(stack, sync, { reader: (view) => d.ui.reader(view) });

  function openReader(doc: Doc, opts?: { returnTo?: "phone" }) {
    // Primeiro o painel (a lanterna guarda, a mira apaga), depois o diálogo. Aberto por um aperto ou por um segurar
    // que completou no quadro: solta o mouse (idempotente quando o adaptador já viu).
    if (reader.open(doc, opts)) d.input()?.panelOpened();
  }
  const closeReader = () => reader.close();

  const closePlaces = () => {
    if (stack.top()?.mode !== "menu") return;
    stack.pop();
    sync();
    d.ui.places(null);
  };

  function openExamine(o: Parameters<ActApi["examine"]>[0]) {
    const examine = d.examine();
    if (!examine || stack.has("examine")) return;
    // Primeiro o painel (apaga o brilho do alvo e baixa a mira): a cópia lê o emissivo dos materiais, que não pode
    // estar na fase do pulso. Vale também para o segurar que conclui dentro do quadro.
    openPanel(stack, { mode: "examine", id: o.title }, sync, () => examine.open(o.root, { distance: o.distance, title: o.title, text: o.text }));
    d.ui.examine({ title: o.title, text: o.text });
    // Aberto por um aperto (adaptador já viu) ou por um segurar que completou no quadro (não viu): solta o mouse.
    d.input()?.panelOpened();
  }

  const closeExamine = () => {
    if (stack.top()?.mode !== "examine") return;
    d.examine()?.close();
    stack.pop();
    sync();
    d.ui.examine(null);
  };

  const openPlaces = () => {
    const player = d.player();
    const inst = d.layer();
    if (!player || !inst) return;
    const state = d.save.get();
    const here = player.place;
    const list = Object.values(inst.places.places)
      .filter((p) => !p.hidden && !(p.locked && p.locked(state)))
      .map((p) => ({ id: p.id, name: p.name, here: p.id === here }));
    stack.push({ mode: "menu" });
    sync();
    d.ui.places(list);
  };

  const handle = (a: Action): boolean => {
    const player = d.player();
    const m = mode();
    if (m === "menu") {
      if (a.type === "places" || a.type === "back") closePlaces();
      // Soltar (parar, deixar de correr/agachar/espiar) chega sempre ao jogador: abrir a lista com W segurado
      // não deixa o jogador andando sozinho depois.
      else if (isRelease(a)) player?.apply(a);
      return true;
    }
    if (m === "examine") {
      if (a.type === "back") closeExamine();
      else if (a.type === "rotate") d.examine()?.rotate(a.dx, a.dy);
      else if (a.type === "zoom") d.examine()?.zoom(a.delta);
      else if (isRelease(a)) player?.apply(a);
      return true;
    }
    if (m === "read") {
      if (a.type === "back") closeReader();
      else if (a.type === "read") reader.toggle();
      else if (isRelease(a)) player?.apply(a);
      return true;
    }
    return false;
  };

  return { stack, reader, mode, sync, openReader, closeReader, openExamine, closeExamine, openPlaces, closePlaces, handle };
}
