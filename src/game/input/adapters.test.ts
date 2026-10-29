import { describe, expect, it, vi } from "vitest";
import { isRelease, type Action, type InputMode } from "./actions";
import { bindInput } from "./adapters";

// Sem DOM no Vitest (ambiente node): o adaptador roda sobre falsos feitos de EventTarget, com o mínimo que ele
// usa (documento com pointerLockElement/exitPointerLock, janela com rAF, alvo com requestPointerLock).

type Fake = {
  target: HTMLElement;
  doc: EventTarget & { pointerLockElement: unknown; fullscreenElement: unknown; exitPointerLock(): void; defaultView: unknown };
  win: EventTarget;
  actions: Action[];
  paused: boolean[];
  taps: number;
  requestLock: ReturnType<typeof vi.fn>;
  setMode(m: InputMode): void;
  /** Próximo `requestPointerLock`: trava, falha (evento `pointerlockerror`) ou não responde (resolve depois). */
  nextLock: "ok" | "error" | "silent";
  /** Completa um pedido "silent" (o navegador trava num quadro seguinte). */
  grantLock(): void;
  binding: ReturnType<typeof bindInput>;
};

function setup(coarse = false): Fake {
  let mode: InputMode = "walk";
  const win = Object.assign(new EventTarget(), {
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    navigator: {},
  });
  const doc = Object.assign(new EventTarget(), {
    pointerLockElement: null as unknown,
    fullscreenElement: null,
    defaultView: win,
    exitPointerLock() {
      doc.pointerLockElement = null;
      doc.dispatchEvent(new Event("pointerlockchange"));
    },
  });
  const fake = { nextLock: "ok" } as Fake;
  const requestLock = vi.fn(() => {
    if (fake.nextLock === "ok") {
      doc.pointerLockElement = target;
      doc.dispatchEvent(new Event("pointerlockchange"));
    } else if (fake.nextLock === "error") {
      doc.dispatchEvent(new Event("pointerlockerror"));
    }
    return Promise.resolve();
  });
  const target = Object.assign(new EventTarget(), {
    ownerDocument: doc,
    requestPointerLock: requestLock,
    setPointerCapture() {},
  }) as unknown as HTMLElement;
  const actions: Action[] = [];
  const paused: boolean[] = [];
  const grantLock = () => {
    doc.pointerLockElement = target;
    doc.dispatchEvent(new Event("pointerlockchange"));
  };
  Object.assign(fake, { target, doc, win, actions, paused, taps: 0, requestLock, grantLock, setMode: (m: InputMode) => (mode = m) });
  fake.binding = bindInput(target, (a) => actions.push(a), {
    coarse,
    mode: () => mode,
    onPause: (p) => paused.push(p),
    onTap: () => {
      fake.taps += 1;
    },
  });
  return fake;
}

function key(f: Fake, type: "keydown" | "keyup", code: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) {
  const e = Object.assign(new Event(type, { cancelable: true }), { code, repeat: false, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });
  f.win.dispatchEvent(e);
  return e;
}

function pointer(f: Fake, type: string, o: Partial<{ button: number; pointerType: string; clientX: number; clientY: number; movementX: number; movementY: number; pointerId: number }> = {}) {
  const e = Object.assign(new Event(type, { cancelable: true }), { button: 0, pointerType: "mouse", clientX: 0, clientY: 0, movementX: 0, movementY: 0, pointerId: 1, ...o });
  (type === "pointerdown" ? f.target : f.doc).dispatchEvent(e);
  return e;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("bindInput · travar de novo ao fechar painel (bíblia 12b.5)", () => {
  it("abrir a lista com o mouse travado solta; escolher um lugar (clique na lista) trava de novo no mesmo gesto", () => {
    const g = setup();
    pointer(g, "pointerdown");
    expect(g.requestLock).toHaveBeenCalledTimes(1);
    expect(g.doc.pointerLockElement).toBe(g.target);
    // L abre a lista: o shell muda o modo dentro do onAction
    const open = setupMenuOnPlaces(g);
    key(g, "keydown", "KeyL");
    expect(open()).toBe(true);
    expect(g.doc.pointerLockElement).toBeNull();
    // nenhum "pausado": a soltura foi pedida pelo jogo
    expect(g.paused).not.toContain(true);
    // o clique em "a mesa" é do React (fora do adaptador): o shell muda o modo e avisa o adaptador
    g.setMode("walk");
    g.binding.panelClosed();
    expect(g.requestLock).toHaveBeenCalledTimes(2);
    expect(g.doc.pointerLockElement).toBe(g.target);
  });

  it("fechar com L também trava de novo; um relock velho não sobrevive a uma troca de modo por fora", () => {
    const f = setup();
    pointer(f, "pointerdown");
    setupMenuOnPlaces(f);
    key(f, "keydown", "KeyL");
    expect(f.doc.pointerLockElement).toBeNull();
    key(f, "keydown", "KeyL");
    expect(f.requestLock).toHaveBeenCalledTimes(2);
    // agora: abre travado, o modo volta a walk por fora (sem panelClosed), e um ciclo destravado depois não trava
    key(f, "keydown", "KeyL");
    expect(f.doc.pointerLockElement).toBeNull();
    f.setMode("walk");
    key(f, "keydown", "KeyW");
    key(f, "keyup", "KeyW");
    key(f, "keydown", "KeyL");
    key(f, "keydown", "KeyL");
    expect(f.requestLock).toHaveBeenCalledTimes(2);
  });

  it("panelClosed sem relock pendente não trava (o mouse estava solto quando a lista abriu)", () => {
    const f = setup();
    setupMenuOnPlaces(f);
    key(f, "keydown", "KeyL");
    f.setMode("walk");
    f.binding.panelClosed();
    expect(f.requestLock).not.toHaveBeenCalled();
  });
});

describe("bindInput · falha ao travar não é para sempre", () => {
  it("depois de já ter travado, só cai para arrastar-olha após 3 falhas seguidas; cada clique tenta de novo", async () => {
    const f = setup();
    pointer(f, "pointerdown");
    // Esc do navegador solta
    f.doc.pointerLockElement = null;
    f.doc.dispatchEvent(new Event("pointerlockchange"));
    expect(f.paused.at(-1)).toBe(true);
    f.nextLock = "error";
    for (let i = 0; i < 2; i++) {
      pointer(f, "pointerdown");
      await tick();
      pointer(f, "pointerup");
    }
    expect(f.requestLock).toHaveBeenCalledTimes(3);
    // ainda não arrasta para olhar
    pointer(f, "pointerdown");
    await tick();
    expect(f.requestLock).toHaveBeenCalledTimes(4);
    // 3ª falha seguida: modo arrastar, e o "pausado" sai da tela
    expect(f.paused.at(-1)).toBe(false);
    pointer(f, "pointerup");
    f.actions.length = 0;
    pointer(f, "pointerdown", { clientX: 100, clientY: 100 });
    pointer(f, "pointermove", { clientX: 130, clientY: 100 });
    expect(f.actions.some((a) => a.type === "look")).toBe(true);
    // e o próximo gesto ainda tenta travar; se travar, volta ao normal
    expect(f.requestLock).toHaveBeenCalledTimes(5);
    f.nextLock = "ok";
    pointer(f, "pointerup");
    pointer(f, "pointerdown");
    expect(f.doc.pointerLockElement).toBe(f.target);
  });

  it("erro sem nunca ter travado (navegador sem pointer lock): arrastar-olha já no primeiro gesto", async () => {
    const f = setup();
    f.nextLock = "error";
    pointer(f, "pointerdown");
    await tick();
    pointer(f, "pointerup");
    expect(f.paused).toContain(false);
    f.actions.length = 0;
    pointer(f, "pointerdown", { clientX: 10, clientY: 10 });
    pointer(f, "pointermove", { clientX: 40, clientY: 10 });
    expect(f.actions.find((a) => a.type === "look")).toEqual({ type: "look", dx: 30, dy: 0 });
  });
});

describe("bindInput · teclado", () => {
  it("atalhos com Ctrl, ⌘ ou Alt passam direto (sem ação, sem preventDefault)", () => {
    const f = setup();
    for (const mods of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      for (const code of ["KeyW", "KeyL", "KeyF"]) {
        const e = key(f, "keydown", code, mods);
        expect(e.defaultPrevented, `${code} ${JSON.stringify(mods)}`).toBe(false);
      }
    }
    expect(f.actions).toEqual([]);
  });

  it("C agacha enquanto segura; Shift continua segurado e a corrida volta ao soltar o C", () => {
    const f = setup();
    key(f, "keydown", "ShiftLeft", { shiftKey: true });
    key(f, "keydown", "KeyC", { shiftKey: true });
    key(f, "keyup", "KeyC", { shiftKey: true });
    expect(f.actions).toEqual([
      { type: "run", on: true },
      { type: "crouch", on: true },
      { type: "crouch", on: false },
    ]);
  });
});

describe("bindInput · revisão 2", () => {
  it("abrir a lista com W, Shift e C segurados solta tudo (e soltar as teclas no menu não deixa nada preso)", () => {
    const f = setup();
    setupMenuOnPlaces(f);
    key(f, "keydown", "KeyW");
    key(f, "keydown", "ShiftLeft", { shiftKey: true });
    key(f, "keydown", "KeyC", { shiftKey: true });
    key(f, "keydown", "KeyZ", { shiftKey: true });
    f.actions.length = 0;
    key(f, "keydown", "KeyL", { shiftKey: true });
    // as solturas vêm depois do places (já com o modo em menu): quem recebe deve aplicá-las mesmo assim
    expect(f.actions[0]).toEqual({ type: "places" });
    expect(f.actions).toContainEqual({ type: "move", x: 0, z: 0 });
    expect(f.actions).toContainEqual({ type: "run", on: false });
    expect(f.actions).toContainEqual({ type: "crouch", on: false });
    expect(f.actions).toContainEqual({ type: "peek", dir: 0 });
    f.actions.length = 0;
    for (const code of ["KeyW", "ShiftLeft", "KeyC", "KeyZ"]) key(f, "keyup", code);
    // nada pendente: nenhuma ação que ligue algo de volta
    expect(f.actions.every((a) => isRelease(a))).toBe(true);
  });

  it("no menu, soltar uma tecla segurada desde antes solta (keyup não volta cedo)", () => {
    const f = setup();
    key(f, "keydown", "ShiftLeft", { shiftKey: true });
    // o modo vira menu por fora (sem o adaptador ver o L): o keyup do Shift ainda solta a corrida
    f.setMode("menu");
    f.actions.length = 0;
    key(f, "keyup", "ShiftLeft");
    expect(f.actions).toContainEqual({ type: "run", on: false });
  });

  it("no arrastar-olha, o clique que consegue travar não vira toque (não anda)", async () => {
    const f = setup();
    f.nextLock = "error";
    pointer(f, "pointerdown");
    await tick();
    pointer(f, "pointerup");
    // modo arrastar ligado (no arrastar, clicar no chão anda: esse toque de preparo não conta)
    f.taps = 0;
    // o próximo clique pede o lock, que chega depois (assíncrono)
    f.nextLock = "silent";
    pointer(f, "pointerdown", { clientX: 50, clientY: 50 });
    f.grantLock();
    pointer(f, "pointerup", { clientX: 50, clientY: 50 });
    expect(f.taps).toBe(0);
  });

  it("travar de novo ao fechar a lista e falhar (Esc não dá gesto) mostra o pausado", async () => {
    const f = setup();
    pointer(f, "pointerdown");
    setupMenuOnPlaces(f);
    key(f, "keydown", "KeyL");
    expect(f.doc.pointerLockElement).toBeNull();
    f.nextLock = "error";
    key(f, "keydown", "Escape");
    await tick();
    expect(f.requestLock).toHaveBeenCalledTimes(2);
    expect(f.paused.at(-1)).toBe(true);
  });

  it("o mesmo pelo panelClosed (clique na lista) quando o navegador recusa", async () => {
    const f = setup();
    pointer(f, "pointerdown");
    setupMenuOnPlaces(f);
    key(f, "keydown", "KeyL");
    f.nextLock = "error";
    f.setMode("walk");
    f.binding.panelClosed();
    await tick();
    expect(f.paused.at(-1)).toBe(true);
  });
});

/** O shell de verdade: L/back alternam walk ↔ menu dentro do onAction. Devolve "a lista está aberta?". */
function setupMenuOnPlaces(f: Fake) {
  let open = false;
  const original = f.actions.push.bind(f.actions);
  f.actions.push = (...items: Action[]) => {
    for (const a of items) {
      if (a.type === "places" || a.type === "back") {
        open = a.type === "places" ? !open : false;
        f.setMode(open ? "menu" : "walk");
      }
    }
    return original(...items);
  };
  return () => open;
}

describe("bindInput · celular (T11)", () => {
  it("Tab abre e fecha o celular e não move o foco do navegador (o celular é o dono do Tab)", () => {
    const f = setup();
    const open = key(f, "keydown", "Tab");
    expect(f.actions).toContainEqual({ type: "phone" });
    expect(open.defaultPrevented).toBe(true);
    f.setMode("phone");
    const close = key(f, "keydown", "Tab");
    expect(f.actions.filter((a) => a.type === "phone")).toHaveLength(2);
    expect(close.defaultPrevented).toBe(true);
  });
});

describe("bindInput · exame (T9)", () => {
  it("setas giram e repetem enquanto seguradas (a repetição do teclado não é ignorada)", () => {
    const f = setup();
    f.setMode("examine");
    const e1 = key(f, "keydown", "ArrowLeft");
    const e2 = Object.assign(new Event("keydown", { cancelable: true }), { code: "ArrowLeft", repeat: true, ctrlKey: false, metaKey: false, altKey: false });
    f.win.dispatchEvent(e2);
    expect(f.actions.filter((a) => a.type === "rotate")).toHaveLength(2);
    expect(e1.defaultPrevented).toBe(true);
  });

  it("arrastar com o botão esquerdo gira (delta em pixels); sem arrastar nada gira e não vira toque", () => {
    const f = setup();
    f.setMode("examine");
    pointer(f, "pointerdown", { clientX: 100, clientY: 100 });
    pointer(f, "pointermove", { clientX: 130, clientY: 90 });
    pointer(f, "pointermove", { clientX: 160, clientY: 90 });
    pointer(f, "pointerup", { clientX: 160, clientY: 90 });
    const rotates = f.actions.filter((a): a is Extract<Action, { type: "rotate" }> => a.type === "rotate");
    expect(rotates.length).toBeGreaterThanOrEqual(2);
    expect(rotates.reduce((s, a) => s + a.dx, 0)).toBe(60);
    expect(rotates.reduce((s, a) => s + a.dy, 0)).toBe(-10);
    expect(f.taps).toBe(0);
    // olhar (walk) não vaza para o exame
    expect(f.actions.some((a) => a.type === "look")).toBe(false);
  });

  it("a roda amplia (e a página não rola); só no exame", () => {
    const f = setup();
    const wheel = (deltaY: number) => {
      const e = Object.assign(new Event("wheel", { cancelable: true }), { deltaY });
      f.target.dispatchEvent(e);
      return e;
    };
    wheel(100);
    expect(f.actions.filter((a) => a.type === "zoom")).toHaveLength(0);
    f.setMode("examine");
    const e = wheel(-120);
    expect(f.actions).toContainEqual({ type: "zoom", delta: -1 });
    expect(e.defaultPrevented).toBe(true);
    wheel(120);
    expect(f.actions).toContainEqual({ type: "zoom", delta: 1 });
  });

  it("botão direito fecha o exame e o mouse volta travado no mesmo gesto", () => {
    const f = setup();
    pointer(f, "pointerdown");
    expect(f.doc.pointerLockElement).toBe(f.target);
    // painel aberto por fora do adaptador (o ato do objeto abre o exame): o shell avisa
    f.setMode("examine");
    f.binding.panelOpened();
    expect(f.doc.pointerLockElement, "abrir solta o mouse").toBeNull();
    expect(f.paused).not.toContain(true);
    const origPush = f.actions.push.bind(f.actions);
    f.actions.push = (...items: Action[]) => {
      if (items.some((a) => a.type === "back")) f.setMode("walk");
      return origPush(...items);
    };
    pointer(f, "pointerdown", { button: 2 });
    expect(f.actions).toContainEqual({ type: "back" });
    expect(f.requestLock).toHaveBeenCalledTimes(2);
    expect(f.doc.pointerLockElement).toBe(f.target);
  });
});

describe("bindInput · painel aberto fora do adaptador (hold concluído no quadro)", () => {
  it("panelOpened solta o mouse e lembra; fechar com E trava de novo", () => {
    const f = setup();
    pointer(f, "pointerdown");
    f.setMode("examine");
    f.binding.panelOpened();
    expect(f.doc.pointerLockElement).toBeNull();
    expect(f.paused).not.toContain(true);
    f.setMode("walk");
    f.binding.panelClosed();
    expect(f.requestLock).toHaveBeenCalledTimes(2);
  });

  it("panelOpened com o mouse solto não trava nem pausa", () => {
    const f = setup();
    f.setMode("examine");
    f.binding.panelOpened();
    f.setMode("walk");
    f.binding.panelClosed();
    expect(f.requestLock).not.toHaveBeenCalled();
    expect(f.paused).not.toContain(true);
  });

  it("panelOpened é idempotente com a abertura vista pelo adaptador", () => {
    const f = setup();
    pointer(f, "pointerdown");
    setupMenuOnPlaces(f);
    key(f, "keydown", "KeyL");
    f.binding.panelOpened();
    key(f, "keydown", "KeyL");
    expect(f.requestLock).toHaveBeenCalledTimes(2);
  });
});
