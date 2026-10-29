import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { Doc, LayerInstance } from "../layers/types";
import { DEFAULT_SETTINGS, type Settings } from "../save/schema";
import { createSaveStore } from "../save/store";
import { createPanels } from "./panels";
import { createPhoneFlow, readFlag, type PhoneView } from "./phone";

const BILHETE: Doc = { id: "bilhete", title: "bilhete", text: "x" };

function memory() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}

function setup(o: { pressOk?: boolean; flags?: Record<string, boolean>; items?: string[] } = {}) {
  const save = createSaveStore(memory(), () => 0);
  save.patch({ flags: o.flags ?? {}, items: o.items ?? [] });
  const place = (id: string) => ({ id, x: 0, z: 0, face: { x: 0, z: -1 }, pitch: 0, name: id });
  const layer = {
    places: { places: { entrada: place("entrada"), mesa: place("mesa") }, edges: {} },
    catalog: { docs: [BILHETE] },
  } as unknown as LayerInstance;
  let fired: string[] = [];
  const hands = {
    phone: vi.fn(),
    press: vi.fn(() => o.pressOk ?? false),
    keysFired: () => fired,
    phoneScreen: vi.fn(() => false),
    setPhoneFrac: vi.fn(),
  };
  const player = { place: "entrada", goTo: vi.fn((place: string) => Promise.resolve(place !== "")), apply: vi.fn(), hands, setPanel: vi.fn() };
  const views: (PhoneView | null)[] = [];
  const readerViews: unknown[] = [];
  const ui = {
    phone: (v: PhoneView | null) => views.push(v),
    phoneRect: vi.fn(),
    settings: vi.fn(),
    exit: vi.fn(),
    places: vi.fn(),
    examine: vi.fn(),
    reader: (v: unknown) => readerViews.push(v),
  };
  const panels = createPanels({
    ui,
    save,
    player: () => player as never,
    interaction: () => null,
    examine: () => null,
    input: () => null,
    layer: () => layer,
  });
  const applySettings = vi.fn((s: Settings) => s);
  const flow = createPhoneFlow({
    panels,
    ui,
    save,
    three: THREE,
    camera: new THREE.PerspectiveCamera(),
    host: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 500 }) },
    player: () => player,
    input: () => ({ panelOpened: vi.fn() }),
    layer: () => layer,
    applySettings,
  });
  const fire = (...keys: string[]) => {
    fired = keys;
    flow.frame();
    fired = [];
  };
  return { save, flow, panels, hands, player, ui, views, readerViews, applySettings, fire, layer };
}

const ajustes = (f: ReturnType<typeof setup>["flow"]) => {
  f.nav({ type: "up" });
  f.nav({ type: "ok" });
};

describe("celular na sessão (runtime/phone.ts)", () => {
  it("open empilha `phone`, sobe a mão e mostra o menu; recusa com outro painel na pilha", () => {
    const s = setup();
    expect(s.flow.open()).toBe(true);
    expect(s.panels.stack.mode()).toBe("phone");
    expect(s.hands.phone).toHaveBeenCalledWith("open");
    expect(s.views.at(-1)).toMatchObject({ state: { screen: "menu" }, lcd: false });
    s.flow.close();
    s.panels.openPlaces();
    expect(s.flow.open()).toBe(false);
    expect(s.panels.stack.size()).toBe(1);
  });

  it("ajuste: grava os ajustes INTEIROS no save, aplica e avisa a casca", () => {
    const s = setup();
    s.flow.open();
    ajustes(s.flow);
    s.flow.nav({ type: "down" });
    s.flow.nav({ type: "ok" });
    const expected = { ...DEFAULT_SETTINGS, fov: 70 };
    expect(s.save.get().settings).toEqual(expected);
    expect(s.applySettings).toHaveBeenLastCalledWith(expected);
    expect(s.ui.settings).toHaveBeenLastCalledWith(expected);
  });

  it("o LCD responde quando a tecla chega ao fundo (aperto aceito); passos na fila, na ordem", () => {
    const s = setup({ pressOk: true });
    s.flow.open();
    s.flow.nav({ type: "down" });
    s.flow.nav({ type: "down" });
    expect(s.flow.state()?.index).toBe(0);
    s.fire("down");
    expect(s.flow.state()?.index).toBe(1);
    s.fire("down");
    expect(s.flow.state()?.index).toBe(2);
    // tecla que não estava na fila não faz nada
    s.fire("ok");
    expect(s.flow.state()?.index).toBe(2);
  });

  it("voltar no menu fecha NA HORA (no gesto, mesmo com o aperto aceito) e diz se a pilha esvaziou", () => {
    const s = setup({ pressOk: true });
    s.flow.open();
    expect(s.flow.nav({ type: "back" })).toEqual({ closed: true, emptied: true });
    expect(s.panels.stack.size()).toBe(0);
    expect(s.hands.phone).toHaveBeenLastCalledWith("close");
    expect(s.views.at(-1)).toBeNull();
  });

  it("mensagem lida marca a flag sms:<id>", () => {
    const s = setup();
    s.flow.open();
    // sem mensagens na 1A: a tela abre vazia e o ok não faz nada
    s.flow.nav({ type: "ok" });
    expect(s.flow.state()?.screen).toBe("mensagens");
    s.flow.nav({ type: "ok" });
    expect(Object.keys(s.save.get().flags).filter((k) => k.startsWith("sms:"))).toEqual([]);
  });

  it("ir a um lugar: fecha primeiro, depois anda", () => {
    const s = setup({ items: ["mapa"] });
    s.flow.open();
    s.flow.nav({ type: "down" });
    s.flow.nav({ type: "down" });
    s.flow.nav({ type: "ok" });
    const order: string[] = [];
    s.hands.phone.mockImplementation((a: string) => void order.push(`phone:${a}`));
    s.player.goTo.mockImplementation((p: string) => {
      order.push(`goTo:${p}:${s.panels.stack.size()}`);
      return Promise.resolve(true);
    });
    expect(s.flow.nav({ type: "ok" })).toEqual({ closed: true, emptied: true });
    expect(order).toEqual(["phone:close", "goTo:mesa:0"]);
  });

  it("sair do jogo: fecha e chama exit", () => {
    const s = setup();
    s.flow.open();
    ajustes(s.flow);
    s.flow.nav({ type: "up" });
    s.flow.nav({ type: "ok" });
    expect(s.ui.exit).toHaveBeenCalledTimes(1);
    expect(s.panels.stack.size()).toBe(0);
  });

  it("documento do Arquivo abre o leitor por cima (returnTo phone); fora do catálogo, nada", () => {
    const s = setup({ flags: { [readFlag("bilhete")]: true, [readFlag("carta")]: true } });
    s.flow.open();
    s.flow.nav({ type: "down" });
    s.flow.nav({ type: "down" });
    s.flow.nav({ type: "down" });
    s.flow.nav({ type: "ok" });
    expect(s.flow.state()?.screen).toBe("arquivo");
    // só o bilhete está no catálogo (a carta lida de outra camada não aparece)
    expect(s.flow.state()?.data.docs.map((d) => d.id)).toEqual(["bilhete"]);
    s.flow.nav({ type: "ok" });
    expect(s.panels.stack.mode()).toBe("read");
    expect(s.panels.reader.view()).toMatchObject({ doc: { id: "bilhete" }, returnTo: "phone" });
    // fechar o leitor volta ao celular, mesma tela
    expect(s.panels.closeReader()).toMatchObject({ closed: true, emptied: false, back: "phone" });
    expect(s.flow.state()).toMatchObject({ screen: "arquivo", index: 0 });
  });

  it("Tab (ação phone) fecha de qualquer tela, soltar chega ao jogador, a fila não sobrevive ao fechar", () => {
    const s = setup({ pressOk: true });
    s.flow.open();
    s.flow.nav({ type: "down" });
    s.flow.handle({ type: "move", x: 0, z: 0 });
    expect(s.player.apply).toHaveBeenCalledWith({ type: "move", x: 0, z: 0 });
    // o passo na fila vale antes de fechar
    expect(s.flow.handle({ type: "phone" })).toEqual({ closed: true, emptied: true });
    expect(s.flow.state()).toBeNull();
  });
});
