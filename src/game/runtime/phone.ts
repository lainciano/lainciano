import type * as THREE from "three";
import { isRelease, type Action } from "../input/actions";
import type { InputBinding } from "../input/adapters";
import type { Doc, LayerInstance } from "../layers/types";
import type { Player } from "../player/controller";
import type { PhoneKey } from "../player/phone";
import type { SaveV1, Settings } from "../save/schema";
import type { SaveApi } from "../save/store";
import { openPhone, phoneReducer, type PhoneAction, type PhoneData, type PhoneState } from "../shell/phone-menu";
import { openPanel } from "../shell/panelStack";
import type { Panels } from "./panels";

/**
 * Celular na sessão (T11): abre e fecha pela pilha de painéis, guarda o estado do menu (`phone-menu.ts`), faz o
 * polegar apertar a tecla de cada passo, aplica o efeito (ajustes gravados e aplicados na hora, documento aberto
 * por cima com `returnTo: "phone"`, ir a um lugar, sair do jogo) e diz à casca onde a tela do aparelho está, em
 * pixels, para o LCD de DOM cobrir a tela 3D.
 *
 * - O LCD responde quando a tecla chega ao fundo (evento `key:` das mãos), não antes: o passo fica numa fila curta até
 *   lá. Se o aperto não foi aceito (aparelho abrindo, fila cheia) o passo vale na hora. Passos que FECHAM o celular
 *   (voltar no menu, sair, ir a um lugar) valem na hora: estão dentro do gesto, e o mouse pode travar de novo nele.
 * - A tela medida (`rect`) vai direto ao elemento do LCD (`ui.phoneRect`, sem React); o conteúdo (`ui.phone`) só muda
 *   com o menu ou quando o LCD aparece/some (tampa aberta ou não).
 * - Fechar desempilha na hora (o jogo volta a andar) enquanto a tampa fecha; a lanterna só volta depois.
 */

export type PhoneRect = { x: number; y: number; w: number; h: number; angle: number };
/** Conteúdo do LCD: o estado do menu e se a tela do aparelho já está à vista (tampa aberta). */
export type PhoneView = { state: PhoneState; lcd: boolean };

export type PhoneUi = {
  phone(view: PhoneView | null): void;
  /** Onde a tela do aparelho está agora (px); vai direto ao elemento do LCD, quadro a quadro, sem renderizar. */
  phoneRect(rect: PhoneRect | null): void;
  /** Ajustes mudaram (legendas, por exemplo, são da casca). */
  settings(s: Settings): void;
  exit(): void;
};

/** O pedaço das mãos que o celular usa (testável sem three). */
export type PhoneHands = {
  phone(action: "open" | "close"): void;
  press(key: PhoneKey): boolean;
  keysFired(): readonly string[];
  phoneScreen(out: THREE.Vector3[]): boolean;
  setPhoneFrac(f: number): void;
};

export type PhoneDeps = {
  panels: Panels;
  ui: PhoneUi;
  save: SaveApi;
  three: Pick<typeof THREE, "Vector3">;
  camera: THREE.Camera;
  host: { getBoundingClientRect(): { left: number; top: number; width: number; height: number } };
  player(): (Pick<Player, "place" | "goTo" | "apply"> & { hands: PhoneHands }) | null;
  input(): Pick<InputBinding, "panelOpened"> | null;
  layer(): LayerInstance | null;
  applySettings(s: Settings): void;
};

export type PhoneFlow = {
  /** Tab andando: abre (só sem outro painel). */
  open(): boolean;
  /** Fecha (Tab, botão). Devolve se a pilha esvaziou. */
  close(): { closed: boolean; emptied: boolean };
  /** Um passo do menu (teclas da casca, clique numa linha). */
  nav(a: PhoneAction): { closed: boolean; emptied: boolean };
  /** Ação do adaptador com o celular no topo (E/⌫ voltam, Tab fecha, soltar chega ao jogador). */
  handle(a: Action): { closed: boolean; emptied: boolean };
  /** Quadro (depois das mãos): aplica os passos cujas teclas chegaram ao fundo e acompanha a tela do aparelho. */
  frame(): void;
  state(): PhoneState | null;
  rect(): PhoneRect | null;
};

/** Tecla que o polegar aperta em cada passo. */
const KEY_FOR: Record<PhoneAction["type"], PhoneKey> = { up: "up", down: "down", ok: "ok", select: "ok", back: "softR" };
/** O LCD não cai abaixo disto (px de altura): em janela baixa a tela sobe na fração do quadro. */
const LCD_MIN_PX = 200;

export const readFlag = (id: string) => `lido:${id}`;
export const smsFlag = (id: string) => `sms:${id}`;

/** Dados do celular a partir do save e do catálogo da camada (mensagens: nenhuma camada da 1A manda ainda). */
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

const NOTHING = { closed: false, emptied: false } as const;

export function createPhoneFlow(d: PhoneDeps): PhoneFlow {
  const { panels } = d;
  let state: PhoneState | null = null;
  let rect: PhoneRect | null = null;
  let pending: { key: PhoneKey; action: PhoneAction }[] = [];
  const corners = [0, 1, 2, 3].map(() => new d.three.Vector3());
  const data = () => phoneData(d.save.get(), d.layer(), d.player()?.place ?? null);
  const show = () => {
    if (state) d.ui.phone({ state, lcd: rect !== null });
  };
  const onTop = () => panels.stack.top()?.mode === "phone";

  const close = () => {
    if (!onTop()) return { ...NOTHING };
    d.player()?.hands.phone("close");
    panels.stack.pop();
    panels.sync();
    state = null;
    rect = null;
    pending = [];
    d.ui.phoneRect(null);
    d.ui.phone(null);
    return { closed: true, emptied: panels.stack.size() === 0 };
  };

  const docById = (id: string): Doc | undefined => d.layer()?.catalog?.docs?.find((doc) => doc.id === id);

  /** Aplica um passo (reducer + efeito). */
  const step = (a: PhoneAction) => {
    if (!state || !onTop()) return { ...NOTHING };
    state = phoneReducer(state, a);
    const effect = state.effect;
    if (effect?.kind === "settings") {
      d.save.patch({ settings: effect.settings });
      d.applySettings(effect.settings);
      d.ui.settings(effect.settings);
    } else if (effect?.kind === "readMessage") {
      d.save.patch({ flags: { [smsFlag(effect.id)]: true } });
    }
    if (state.closed) {
      const out = close();
      if (effect?.kind === "goTo") void d.player()?.goTo(effect.place);
      if (effect?.kind === "exit") d.ui.exit();
      return out;
    }
    show();
    if (effect?.kind === "read") {
      const doc = docById(effect.doc);
      if (doc) panels.openReader(doc, { returnTo: "phone" });
    }
    return { ...NOTHING };
  };

  const flush = () => {
    const queued = pending;
    pending = [];
    for (const p of queued) step(p.action);
  };

  const nav = (a: PhoneAction) => {
    if (!state || !onTop()) return { ...NOTHING };
    const key = KEY_FOR[a.type];
    const pressed = d.player()?.hands.press(key) ?? false;
    // passo que fecha: na hora (no gesto), depois dos que estavam na fila
    if (phoneReducer(state, a).closed || !pressed) {
      flush();
      return step(a);
    }
    pending.push({ key, action: a });
    return { ...NOTHING };
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
        pending = [];
        show();
      });
      d.input()?.panelOpened();
      return true;
    },
    close() {
      flush();
      return close();
    },
    nav,
    handle(a) {
      if (a.type === "back") return nav({ type: "back" });
      if (a.type === "phone") {
        flush();
        return close();
      }
      if (isRelease(a)) d.player()?.apply(a);
      return { ...NOTHING };
    },
    frame() {
      if (!state) return;
      const hands = d.player()?.hands;
      if (!hands) return;
      for (const k of hands.keysFired()) {
        const i = pending.findIndex((p) => p.key === k);
        if (i < 0) continue;
        const [p] = pending.splice(i, 1);
        step(p.action);
        if (!state) return;
      }
      const box = d.host.getBoundingClientRect();
      hands.setPhoneFrac(LCD_MIN_PX / Math.max(1, box.height));
      if (!hands.phoneScreen(corners)) {
        if (rect) {
          rect = null;
          d.ui.phoneRect(null);
          show();
        }
        return;
      }
      d.camera.updateMatrixWorld();
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
      const appeared = !rect;
      const moved =
        appeared ||
        Math.abs(next.x - rect!.x) > 0.25 ||
        Math.abs(next.y - rect!.y) > 0.25 ||
        Math.abs(next.w - rect!.w) > 0.25 ||
        Math.abs(next.h - rect!.h) > 0.25 ||
        Math.abs(next.angle - rect!.angle) > 0.001;
      if (!moved) return;
      rect = next;
      d.ui.phoneRect(rect);
      if (appeared) show();
    },
    state: () => state,
    rect: () => rect,
  };
}
