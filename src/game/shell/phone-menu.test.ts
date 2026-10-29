import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../save/schema";
import { cycleSetting, openPhone, phoneReducer, phoneRows, withData, type PhoneData, type PhoneState } from "./phone-menu";

const DATA: PhoneData = {
  messages: [{ id: "boas-vindas", from: "rede", at: "16:44", text: "bem-vindo à rede.", read: false }],
  items: [{ id: "chave", name: "chave pequena", desc: "cabe num relógio." }],
  docs: [{ id: "bilhete", title: "bilhete" }],
  places: [
    { id: "entrada", name: "entrada", here: true },
    { id: "mesa", name: "mesa", here: false },
  ],
  hasMap: false,
  settings: DEFAULT_SETTINGS,
};

const run = (s: PhoneState, ...types: ("up" | "down" | "ok" | "back")[]) => types.reduce((st, type) => phoneReducer(st, { type }), s);
const rowIds = (s: PhoneState) => phoneRows(s).map((r) => r.id);

describe("celular · menu", () => {
  it("abre no menu, no primeiro item, sem efeito", () => {
    const s = openPhone(DATA);
    expect(s).toMatchObject({ screen: "menu", index: 0, detail: null, closed: false, effect: null });
    expect(rowIds(s)).toEqual(["mensagens", "itens", "mapa", "arquivo", "ajustes"]);
  });

  it("down no último item volta ao primeiro; up no primeiro vai ao último", () => {
    const s = openPhone(DATA);
    expect(run(s, "down", "down", "down", "down").index).toBe(4);
    expect(run(s, "down", "down", "down", "down", "down").index).toBe(0);
    expect(run(s, "up").index).toBe(4);
  });

  it("back em itens volta a menu (com o item de onde veio marcado); back em menu fecha (closed: true)", () => {
    const itens = run(openPhone(DATA), "down", "ok");
    expect(itens.screen).toBe("itens");
    const back = run(itens, "back");
    expect(back).toMatchObject({ screen: "menu", index: 1, closed: false });
    expect(run(back, "back").closed).toBe(true);
  });

  it("mapa desabilitado quando o save não tem o item mapa: ok não entra; com o mapa, entra", () => {
    const s = run(openPhone(DATA), "down", "down");
    expect(phoneRows(s)[2]).toMatchObject({ id: "mapa", disabled: true });
    expect(run(s, "ok").screen).toBe("menu");
    const withMap = run(openPhone({ ...DATA, hasMap: true }), "down", "down");
    expect(phoneRows(withMap)[2]).not.toHaveProperty("disabled");
    expect(run(withMap, "ok").screen).toBe("mapa");
  });

  it("select(i) marca a linha e age como ok (clique ou toque)", () => {
    const s = phoneReducer(openPhone(DATA), { type: "select", index: 3 });
    expect(s).toMatchObject({ screen: "arquivo", index: 0 });
    // fora da lista: nada
    expect(phoneReducer(openPhone(DATA), { type: "select", index: 9 })).toMatchObject({ screen: "menu", index: 0 });
  });

  it("o efeito vale só para o passo que o criou", () => {
    const s = run(openPhone(DATA), "down", "down", "down", "ok", "ok");
    expect(s.effect).toEqual({ kind: "read", doc: "bilhete" });
    expect(run(s, "down").effect).toBeNull();
  });
});

describe("celular · telas", () => {
  it("mensagens: ok abre a mensagem (efeito de lida), back volta à lista no mesmo item", () => {
    const list = run(openPhone(DATA), "ok");
    expect(list.screen).toBe("mensagens");
    expect(rowIds(list)).toEqual(["msg:boas-vindas"]);
    const open = run(list, "ok");
    expect(open).toMatchObject({ screen: "mensagens", detail: "boas-vindas", effect: { kind: "readMessage", id: "boas-vindas" } });
    expect(phoneRows(open)).toEqual([]);
    expect(run(open, "back")).toMatchObject({ screen: "mensagens", detail: null, index: 0 });
  });

  it("itens: ok mostra o item (detalhe); listas vazias não quebram (sem linhas, up/down/ok sem efeito)", () => {
    const item = run(openPhone(DATA), "down", "ok", "ok");
    expect(item).toMatchObject({ screen: "itens", detail: "chave" });
    const empty = run(openPhone({ ...DATA, items: [] }), "down", "ok");
    expect(phoneRows(empty)).toEqual([]);
    expect(run(empty, "down", "up", "ok")).toMatchObject({ screen: "itens", index: 0, detail: null, effect: null });
  });

  it("arquivo: ok num documento pede a leitura e o celular continua aberto na mesma tela e item", () => {
    const s = run(openPhone({ ...DATA, docs: [...DATA.docs, { id: "carta", title: "carta" }] }), "down", "down", "down", "ok", "down", "ok");
    expect(s).toMatchObject({ screen: "arquivo", index: 1, closed: false, effect: { kind: "read", doc: "carta" } });
  });

  it("mapa: ok num lugar leva até ele e fecha; o lugar de agora não está na lista", () => {
    const s = run(openPhone({ ...DATA, hasMap: true }), "down", "down", "ok");
    expect(rowIds(s)).toEqual(["place:mesa"]);
    expect(run(s, "ok")).toMatchObject({ closed: true, effect: { kind: "goTo", place: "mesa" } });
  });
});

describe("celular · ajustes", () => {
  const ajustes = () => run(openPhone(DATA), "up", "ok");

  it("lista os ajustes e o sair do jogo", () => {
    expect(rowIds(ajustes())).toEqual(["volume", "fov", "bob", "scares", "subtitles", "quality", "sensitivity", "exit"]);
  });

  it("ok gira o valor e devolve os ajustes inteiros (save.patch com o valor completo); o celular segue no mesmo item", () => {
    const s = run(ajustes(), "down", "ok");
    expect(s.effect).toEqual({ kind: "settings", settings: { ...DEFAULT_SETTINGS, fov: 70 } });
    expect(s.index).toBe(1);
    expect(s.data.settings.fov).toBe(70);
    expect(phoneRows(s)[1]).toMatchObject({ value: 70 });
  });

  it("FOV fica entre 55 e 80 e dá a volta; qualidade passa por auto, 480, 360, 240", () => {
    const fovs: number[] = [];
    let st = DEFAULT_SETTINGS;
    for (let i = 0; i < 6; i++) fovs.push((st = cycleSetting(st, "fov")).fov);
    expect(fovs).toEqual([70, 75, 80, 55, 62, 70]);
    const q: unknown[] = [];
    st = DEFAULT_SETTINGS;
    for (let i = 0; i < 4; i++) q.push((st = cycleSetting(st, "quality")).quality);
    expect(q).toEqual([480, 360, 240, "auto"]);
    // valor fora da lista (FOV 66 de um save à mão): vai para o próximo da lista
    expect(cycleSetting({ ...DEFAULT_SETTINGS, fov: 66 }, "fov").fov).toBe(70);
  });

  it("booleanos alternam; volume e sensibilidade giram em degraus", () => {
    expect(cycleSetting(DEFAULT_SETTINGS, "bob").bob).toBe(false);
    expect(cycleSetting(DEFAULT_SETTINGS, "subtitles").subtitles).toBe(false);
    expect(cycleSetting(DEFAULT_SETTINGS, "scares").scares).toBe(false);
    expect(cycleSetting(DEFAULT_SETTINGS, "volume").volume).toBe(0);
    expect(cycleSetting({ ...DEFAULT_SETTINGS, volume: 0 }, "volume").volume).toBe(0.25);
    expect(cycleSetting(DEFAULT_SETTINGS, "sensitivity").sensitivity).toBe(1.25);
  });

  it("sair do jogo: efeito de saída e o celular fecha", () => {
    const s = run(ajustes(), "up", "ok");
    expect(s).toMatchObject({ closed: true, effect: { kind: "exit" } });
  });
});

describe("celular · dados novos com o celular aberto", () => {
  it("withData troca os dados e mantém tela e item (o índice cabe na lista nova)", () => {
    const s = run(openPhone({ ...DATA, docs: [{ id: "a", title: "a" }, { id: "b", title: "b" }] }), "down", "down", "down", "ok", "down");
    const fewer = withData(s, { ...DATA, docs: [{ id: "a", title: "a" }] });
    expect(fewer).toMatchObject({ screen: "arquivo", index: 0 });
    // o detalhe que sumiu (mensagem apagada) volta à lista
    const msg = run(openPhone(DATA), "ok", "ok");
    expect(withData(msg, { ...DATA, messages: [] })).toMatchObject({ screen: "mensagens", detail: null });
  });
});
