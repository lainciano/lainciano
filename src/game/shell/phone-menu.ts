import type { Settings } from "../save/schema";

/**
 * Menu do celular de 2005 (T11), lógica pura: telas, linhas, navegação (cima, baixo, ok, voltar, escolher por clique)
 * e o efeito de cada escolha. Sem DOM nem three: a sessão guarda o estado e aplica o efeito (gravar os ajustes,
 * abrir o documento, ir a um lugar, sair do jogo); a casca desenha as linhas com os rótulos que descem por props.
 *
 * - `menu`: mensagens, itens, mapa (desabilitado sem o item `mapa`), arquivo, ajustes. Voltar no menu fecha.
 * - Listas (mensagens, itens, mapa, arquivo): ok numa mensagem ou num item mostra o detalhe (voltar devolve à lista
 *   no mesmo item); ok num documento pede a leitura (o leitor abre por cima e, ao fechar, o celular está aqui de
 *   novo, na mesma tela e item); ok num lugar do mapa leva até ele e fecha.
 * - `ajustes`: ok gira o valor e devolve os ajustes inteiros (o save funde `settings` por substituição); "sair do
 *   jogo" fecha.
 * - Cima/baixo dão a volta. O efeito vale só para o passo que o criou.
 */

export type PhoneScreen = "menu" | "mensagens" | "itens" | "mapa" | "arquivo" | "ajustes";

export type PhoneMessage = { id: string; from: string; at: string; text: string; read: boolean };
export type PhoneItem = { id: string; name: string; desc: string };
export type PhoneDoc = { id: string; title: string };
export type PhonePlace = { id: string; name: string; here: boolean };

export type PhoneData = {
  messages: PhoneMessage[];
  items: PhoneItem[];
  docs: PhoneDoc[];
  places: PhonePlace[];
  hasMap: boolean;
  settings: Settings;
};

export type SettingKey = "volume" | "fov" | "bob" | "scares" | "subtitles" | "quality" | "sensitivity";

export type PhoneEffect =
  | { kind: "settings"; settings: Settings }
  | { kind: "read"; doc: string }
  | { kind: "readMessage"; id: string }
  | { kind: "goTo"; place: string }
  | { kind: "exit" };

export type PhoneState = {
  screen: PhoneScreen;
  index: number;
  /** Mensagem ou item aberto (detalhe) dentro de `mensagens`/`itens`. */
  detail: string | null;
  closed: boolean;
  data: PhoneData;
  effect: PhoneEffect | null;
};

export type PhoneAction = { type: "up" | "down" | "ok" | "back" } | { type: "select"; index: number };

export type PhoneRow =
  | { id: Exclude<PhoneScreen, "menu">; kind: "screen"; disabled?: boolean; count?: number }
  | { id: `msg:${string}`; kind: "message"; target: string }
  | { id: `item:${string}`; kind: "item"; target: string }
  | { id: `doc:${string}`; kind: "doc"; target: string }
  | { id: `place:${string}`; kind: "place"; target: string }
  | { id: SettingKey; kind: "setting"; value: Settings[SettingKey] }
  | { id: "exit"; kind: "exit" };

const MENU: Exclude<PhoneScreen, "menu">[] = ["mensagens", "itens", "mapa", "arquivo", "ajustes"];
const SETTINGS: SettingKey[] = ["volume", "fov", "bob", "scares", "subtitles", "quality", "sensitivity"];

/** Degraus de cada ajuste que gira (o FOV fica no intervalo do contrato, 55–80). */
export const SETTING_STEPS = {
  volume: [0, 0.25, 0.5, 0.75, 1],
  fov: [55, 62, 70, 75, 80],
  quality: ["auto", 480, 360, 240],
  sensitivity: [0.5, 0.75, 1, 1.25, 1.5, 2],
} as const;

/** Próximo degrau de uma lista: o seguinte ao atual; fora da lista, o primeiro maior (ou o primeiro). */
function nextStep<T extends number | string>(steps: readonly T[], current: T): T {
  const i = steps.indexOf(current);
  if (i >= 0) return steps[(i + 1) % steps.length];
  if (typeof current === "number") return steps.find((v) => typeof v === "number" && v > current) ?? steps[0];
  return steps[0];
}

/** Gira um ajuste e devolve os ajustes inteiros (valor completo para o `save.patch`). */
export function cycleSetting(s: Settings, key: SettingKey): Settings {
  switch (key) {
    case "bob":
    case "scares":
    case "subtitles":
      return { ...s, [key]: !s[key] };
    case "volume":
      return { ...s, volume: nextStep(SETTING_STEPS.volume as readonly number[], s.volume) };
    case "fov":
      return { ...s, fov: nextStep(SETTING_STEPS.fov as readonly number[], s.fov) };
    case "sensitivity":
      return { ...s, sensitivity: nextStep(SETTING_STEPS.sensitivity as readonly number[], s.sensitivity) };
    case "quality":
      return { ...s, quality: nextStep(SETTING_STEPS.quality as readonly Settings["quality"][], s.quality) };
  }
}

export function openPhone(data: PhoneData): PhoneState {
  return { screen: "menu", index: 0, detail: null, closed: false, data, effect: null };
}

/** Linhas da tela em vigor (vazio num detalhe). */
export function phoneRows(s: PhoneState): PhoneRow[] {
  const d = s.data;
  if (s.detail) return [];
  switch (s.screen) {
    case "menu":
      return MENU.map((id) => {
        const count = id === "mensagens" ? d.messages.filter((m) => !m.read).length : id === "itens" ? d.items.length : id === "arquivo" ? d.docs.length : undefined;
        return { id, kind: "screen", ...(id === "mapa" && !d.hasMap ? { disabled: true } : {}), ...(count !== undefined ? { count } : {}) };
      });
    case "mensagens":
      return d.messages.map((m) => ({ id: `msg:${m.id}`, kind: "message", target: m.id }));
    case "itens":
      return d.items.map((i) => ({ id: `item:${i.id}`, kind: "item", target: i.id }));
    case "arquivo":
      return d.docs.map((doc) => ({ id: `doc:${doc.id}`, kind: "doc", target: doc.id }));
    case "mapa":
      return d.places.filter((p) => !p.here).map((p) => ({ id: `place:${p.id}`, kind: "place", target: p.id }));
    case "ajustes":
      return [...SETTINGS.map((id): PhoneRow => ({ id, kind: "setting", value: d.settings[id] })), { id: "exit", kind: "exit" }];
  }
}

const wrap = (i: number, n: number) => (n === 0 ? 0 : ((i % n) + n) % n);

function ok(s: PhoneState): PhoneState {
  const rows = phoneRows(s);
  const row = rows[s.index];
  if (!row) return s;
  switch (row.kind) {
    case "screen":
      return row.disabled ? s : { ...s, screen: row.id, index: 0, detail: null };
    case "message":
      return { ...s, detail: row.target, effect: { kind: "readMessage", id: row.target } };
    case "item":
      return { ...s, detail: row.target };
    case "doc":
      return { ...s, effect: { kind: "read", doc: row.target } };
    case "place":
      return { ...s, closed: true, effect: { kind: "goTo", place: row.target } };
    case "setting": {
      const settings = cycleSetting(s.data.settings, row.id);
      return { ...s, data: { ...s.data, settings }, effect: { kind: "settings", settings } };
    }
    case "exit":
      return { ...s, closed: true, effect: { kind: "exit" } };
  }
}

export function phoneReducer(state: PhoneState, a: PhoneAction): PhoneState {
  const s: PhoneState = state.effect ? { ...state, effect: null } : state;
  if (s.closed) return s;
  const n = phoneRows(s).length;
  switch (a.type) {
    case "up":
      return n ? { ...s, index: wrap(s.index - 1, n) } : s;
    case "down":
      return n ? { ...s, index: wrap(s.index + 1, n) } : s;
    case "ok":
      return ok(s);
    case "select":
      return a.index >= 0 && a.index < n ? ok({ ...s, index: a.index }) : s;
    case "back":
      if (s.detail) return { ...s, detail: null };
      if (s.screen === "menu") return { ...s, closed: true };
      return { ...s, screen: "menu", index: MENU.indexOf(s.screen), detail: null };
  }
}

/** Dados novos com o celular aberto (um documento lido, um item pego): mesma tela, índice dentro da lista. */
export function withData(s: PhoneState, data: PhoneData): PhoneState {
  let next: PhoneState = { ...s, data };
  if (next.detail) {
    const gone = next.screen === "mensagens" ? !data.messages.some((m) => m.id === next.detail) : next.screen === "itens" ? !data.items.some((i) => i.id === next.detail) : true;
    if (gone) next = { ...next, detail: null };
  }
  const n = phoneRows(next).length;
  return { ...next, index: n === 0 ? 0 : Math.min(next.index, n - 1) };
}
