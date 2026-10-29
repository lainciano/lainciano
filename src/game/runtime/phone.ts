import type * as THREE from "three";
import { isRelease, type Action } from "../input/actions";
import type { InputBinding } from "../input/adapters";
import type { Doc, LayerInstance } from "../layers/types";
import type { Player } from "../player/controller";
import type { PhoneKey } from "../player/phone";
import type { SaveV1, Settings } from "../save/schema";
import type { SaveApi } from "../save/store";
import { openPhone, phoneReducer, withData, type PhoneAction, type PhoneData, type PhoneState } from "../shell/phone-menu";
import { openPanel } from "../shell/panelStack";
import type { Panels } from "./panels";

/**
 * Celular na sessão (T11): abre e fecha pela pilha de painéis, guarda o estado do menu (`phone-menu.ts`), faz o
 * polegar apertar a tecla de cada passo, aplica o efeito (ajustes gravados e aplicados na hora, documento aberto
 * por cima com `returnTo: "phone"`, ir a um lugar, sair do jogo) e diz à casca onde a tela do aparelho está, em
 * pixels, para o LCD de DOM cobrir a tela 3D (só com a tampa aberta; `rect: null` abrindo e fechando).
 *
 * - Abrir: empilha `phone` (a lanterna guarda) e sobe a mão; o LCD aparece quando a tampa termina de abrir.
 * - Fechar (Tab de novo, voltar no menu, sair, ir a um lugar): desempilha na hora (o jogo volta a andar) enquanto a
 *   tampa fecha e a mão desce; a lanterna só volta depois (as mãos esperam o aparelho descer).
 * - Um documento aberto do Arquivo fica por cima (`read`); fechá-lo volta ao celular na mesma tela e item.
 */

export type PhoneRect = { x: number; y: number; w: number; h: number; angle: number };
export type PhoneView = { state: PhoneState; rect: PhoneRect | null };

export type PhoneUi = {
  phone(view: PhoneView | null): void;
  /** Ajustes mudaram (legendas, por exemplo, são da casca). */
  settings(s: Settings): void;
  exit(): void;
};

export type PhoneDeps = {
  panels: Panels;
  ui: PhoneUi;
  save: SaveApi;
  three: typeof THREE;
  camera: THREE.PerspectiveCamera;
  host: HTMLElement;
  player(): Player | null;
  input(): InputBinding | null;
  layer(): LayerInstance | null;
  applySettings(s: Settings): void;
};

export type PhoneFlow = {
  /** Tab andando: abre (só sem outro painel). */
  open(): boolean;
  /** Fecha (Tab, voltar no menu, sair). Devolve se a pilha esvaziou. */
  close(): { closed: boolean; emptied: boolean };
  /** Um passo do menu (teclas da casca, clique numa linha). */
  nav(a: PhoneAction): { closed: boolean; emptied: boolean };
  /** Ação do adaptador com o celular no topo. */
  handle(a: Action): void;
  /** Quadro: acompanha a tela do aparelho (o LCD só muda quando ela anda meio pixel). */
  frame(): void;
  state(): PhoneState | null;
  rect(): PhoneRect | null;
  /** Os dados mudaram com o celular aberto (um documento lido). */
  refresh(): void;
};

/** Tecla que o polegar aperta em cada passo. */
const KEY_FOR: Record<PhoneAction["type"], PhoneKey> = { up: "up", down: "down", ok: "ok", select: "ok", back: "softR" };

export const readFlag = (id: string) => `lido:${id}`;

/** Dados do celular a partir do save e do catálogo da camada. */
export function phoneData(save: SaveV1, layer: LayerInstance | null, here: string | null): PhoneData {
  const docs = layer?.catalog?.docs ?? [];
  const items = layer?.catalog?.items ?? {};
  const places = layer
    ? Object.values(layer.places.places)
        .filter((p) => !p.hidden && !(p.locked && p.locked(save)))
        .map((p) => ({ id: p.id, name: p.name, here: p.id === here }))
    : [];
  return {
    messages: [],
    items: save.items.map((id) => ({ id, name: items[id]?.name ?? id, desc: items[id]?.desc ?? "" })),
    docs: docs.filter((d) => save.flags[readFlag(d.id)] === true).map((d) => ({ id: d.id, title: d.title })),
    places,
    hasMap: save.items.includes("mapa"),
    settings: save.settings,
  };
}

export function createPhoneFlow(d: PhoneDeps): PhoneFlow {
  const { panels } = d;
  let state: PhoneState | null = null;
  let rect: PhoneRect | null = null;
  const corners = [0, 1, 2, 3].map(() => new d.three.Vector3());
  const data = () => phoneData(d.save.get(), d.layer(), d.player()?.place ?? null);
  const show = () => {
    if (state) d.ui.phone({ state, rect });
  };
  const onTop = () => panels.stack.top()?.mode === "phone";

  const close = (key: PhoneKey = "end") => {
    if (!onTop()) return { closed: false, emptied: false };
    // a tampa fecha e a mão desce (os apertos em curso se soltam)
    void key;
    d.player()?.hands.phone("close");
    panels.stack.pop();
    panels.sync();
    state = null;
    rect = null;
    d.ui.phone(null);
    return { closed: true, emptied: panels.stack.size() === 0 };
  };

  const docById = (id: string): Doc | undefined => d.layer()?.catalog?.docs?.find((doc) => doc.id === id);

  const nav = (a: PhoneAction) => {
    if (!state || !onTop()) return { closed: false, emptied: false };
    d.player()?.hands.press(KEY_FOR[a.type]);
    state = phoneReducer(state, a);
    const effect = state.effect;
    if (effect?.kind === "settings") {
      d.save.patch({ settings: effect.settings });
      d.applySettings(effect.settings);
      d.ui.settings(effect.settings);
    } else if (effect?.kind === "readMessage") {
      d.save.patch({ flags: { [`sms:${effect.id}`]: true } });
    }
    if (state.closed) {
      const out = close(effect?.kind === "exit" ? "end" : "ok");
      if (effect?.kind === "goTo") void d.player()?.goTo(effect.place);
      if (effect?.kind === "exit") d.ui.exit();
      return out;
    }
    show();
    if (effect?.kind === "read") {
      const doc = docById(effect.doc);
      if (doc) panels.openReader(doc, { returnTo: "phone" });
    }
    return { closed: false, emptied: false };
  };

  return {
    open() {
      const player = d.player();
      if (!player || panels.stack.size() > 0) return false;
      const next = openPhone(data());
      openPanel(panels.stack, { mode: "phone" }, panels.sync, () => {
        player.hands.phone("open");
        state = next;
        rect = null;
        show();
      });
      d.input()?.panelOpened();
      return true;
    },
    close: () => close("end"),
    nav,
    handle(a) {
      if (a.type === "back") nav({ type: "back" });
      else if (a.type === "phone") close("end");
      else if (isRelease(a)) d.player()?.apply(a);
    },
    frame() {
      if (!state) return;
      const hands = d.player()?.hands;
      if (!hands || !hands.phoneScreen(corners)) {
        if (rect) {
          rect = null;
          show();
        }
        return;
      }
      const box = d.host.getBoundingClientRect();
      const px = corners.map((c) => {
        c.project(d.camera);
        return { x: box.left + ((c.x + 1) / 2) * box.width, y: box.top + ((1 - c.y) / 2) * box.height };
      });
      const [tl, tr, br, bl] = px;
      const next: PhoneRect = {
        x: (tl.x + tr.x + br.x + bl.x) / 4,
        y: (tl.y + tr.y + br.y + bl.y) / 4,
        w: (Math.hypot(tr.x - tl.x, tr.y - tl.y) + Math.hypot(br.x - bl.x, br.y - bl.y)) / 2,
        h: (Math.hypot(bl.x - tl.x, bl.y - tl.y) + Math.hypot(br.x - tr.x, br.y - tr.y)) / 2,
        angle: Math.atan2(tr.y - tl.y, tr.x - tl.x),
      };
      const moved =
        !rect ||
        Math.abs(next.x - rect.x) > 0.5 ||
        Math.abs(next.y - rect.y) > 0.5 ||
        Math.abs(next.w - rect.w) > 0.5 ||
        Math.abs(next.h - rect.h) > 0.5 ||
        Math.abs(next.angle - rect.angle) > 0.002;
      if (!moved) return;
      rect = next;
      show();
    },
    state: () => state,
    rect: () => rect,
    refresh() {
      if (!state) return;
      state = withData(state, data());
      show();
    },
  };
}
