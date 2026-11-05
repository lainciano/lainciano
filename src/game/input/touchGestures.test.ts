import { describe, expect, it } from "vitest";
import type { Action, InputMode } from "./actions";
import { createTouchGestures, HOLD_SLOP, PINCH_STEP, type GesturePointer } from "./touchGestures";

// Sem DOM: os gestos recebem eventos simples e o mesmo roteiro do adaptador (`intercept` → `begin` no pointerdown,
// `move` no pointermove, `end` no pointerup/pointercancel). O que depende do `bindInput` (foco, travamento) fica em
// `adapters.test.ts`.

type Rig = {
  g: ReturnType<typeof createTouchGestures>;
  actions: Action[];
  log: string[];
  taps: { x: number; y: number; run: boolean }[];
  setMode(m: InputMode): void;
  /** Enquanto verdadeiro, o objeto de segurar continua sob o dedo. */
  onTarget: boolean;
  send(type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel", x: number, y: number, id?: number, o?: Partial<GesturePointer>): void;
};

function rig(o: { coarse?: boolean; start?: boolean; hooks?: boolean } = {}): Rig {
  let mode: InputMode = "walk";
  const actions: Action[] = [];
  const log: string[] = [];
  const taps: Rig["taps"] = [];
  const r = { actions, log, taps, onTarget: true, setMode: (m: InputMode) => (mode = m) } as unknown as Rig;
  const hooks = o.hooks === false
    ? {}
    : {
        onHoldStart: (x: number, y: number) => {
          log.push(`start ${x},${y}`);
          return o.start ?? true;
        },
        onHoldMove: () => r.onTarget,
        onHoldEnd: (cancelled: boolean) => log.push(cancelled ? "cancel" : "release"),
      };
  r.g = createTouchGestures({
    target: { setPointerCapture() {} } as unknown as HTMLElement,
    coarse: o.coarse ?? true,
    mode: () => mode,
    onAction: (a) => actions.push(a),
    onTap: (x, y, run) => taps.push({ x, y, run }),
    ...hooks,
  });
  r.send = (type, x, y, id = 1, extra = {}) => {
    const e: GesturePointer = { type, pointerId: id, pointerType: "touch", clientX: x, clientY: y, isPrimary: id === 1, ...extra };
    if (type === "pointerdown") {
      if (!r.g.intercept(e)) r.g.begin(e);
    } else if (type === "pointermove") r.g.move(e);
    else r.g.end(e);
  };
  return r;
}

describe("touchGestures · segurar por toque (T12)", () => {
  it("dedo parado num objeto de segurar: começa no pousar e solta no levantar; não vira toque nem olhar", () => {
    const r = rig();
    r.send("pointerdown", 100, 200);
    r.send("pointermove", 104, 203);
    r.send("pointermove", 112, 206);
    r.send("pointerup", 112, 206);
    expect(r.log).toEqual(["start 100,200", "release"]);
    expect(r.taps).toHaveLength(0);
    expect(r.actions.some((a) => a.type === "look")).toBe(false);
  });

  it(`o dedo sai muito do lugar (> ${HOLD_SLOP} px) cancela, e o resto do gesto vira olhar`, () => {
    const r = rig();
    r.send("pointerdown", 100, 200);
    r.send("pointermove", 140, 200);
    r.send("pointermove", 170, 200);
    r.send("pointerup", 170, 200);
    expect(r.log).toEqual(["start 100,200", "cancel"]);
    expect(r.actions.some((a) => a.type === "look")).toBe(true);
    expect(r.taps).toHaveLength(0);
  });

  it("o dedo pode tremer até HOLD_SLOP sem cancelar", () => {
    const r = rig();
    r.send("pointerdown", 100, 200);
    r.send("pointermove", 100 + HOLD_SLOP, 200);
    r.send("pointerup", 100 + HOLD_SLOP, 200);
    expect(r.log).toEqual(["start 100,200", "release"]);
  });

  it("o dedo sai do alvo (o objeto não está mais sob ele) cancela, mesmo perto", () => {
    const r = rig();
    r.send("pointerdown", 100, 200);
    r.onTarget = false;
    r.send("pointermove", 106, 200);
    r.send("pointerup", 106, 200);
    expect(r.log).toEqual(["start 100,200", "cancel"]);
  });

  it("pointercancel, perder o foco (reset) e um 2º dedo cancelam", () => {
    for (const how of ["pointercancel", "reset", "second"] as const) {
      const r = rig();
      r.send("pointerdown", 100, 200);
      if (how === "pointercancel") r.send("pointercancel", 100, 200);
      else if (how === "reset") r.g.reset();
      else r.send("pointerdown", 300, 200, 2);
      r.send("pointerup", 100, 200);
      expect(r.log, how).toEqual(["start 100,200", "cancel"]);
    }
  });

  it("dedo fantasma: um toque primário novo com o anterior sem fim substitui o velho (o segurar velho cai, o novo toque vale)", () => {
    const r = rig({ start: false });
    r.send("pointerdown", 100, 200, 1);
    // o pointerup do 1º se perdeu; vem um toque primário novo
    r.send("pointerdown", 300, 300, 7, { isPrimary: true });
    r.send("pointerup", 300, 300, 7, { isPrimary: true });
    expect(r.taps).toHaveLength(1);
    expect(r.log).toEqual(["start 100,200", "start 300,300"]);
    const h = rig();
    h.send("pointerdown", 100, 200, 1);
    h.send("pointerdown", 300, 300, 7, { isPrimary: true });
    expect(h.log).toEqual(["start 100,200", "cancel", "start 300,300"]);
  });

  it("sem objeto de segurar sob o dedo (onHoldStart falso), o toque segue normal", () => {
    const r = rig({ start: false });
    r.send("pointerdown", 100, 200);
    r.send("pointerup", 100, 200);
    expect(r.log).toEqual(["start 100,200"]);
    expect(r.taps).toEqual([{ x: 100, y: 200, run: false }]);
  });

  it("com painel aberto não começa a segurar; mouse (ponteiro fino) nunca", () => {
    const r = rig();
    r.setMode("examine");
    r.send("pointerdown", 100, 200);
    r.send("pointerup", 100, 200);
    expect(r.log).toEqual([]);
    const fine = rig({ coarse: false });
    fine.send("pointerdown", 10, 10, 1, { pointerType: "mouse" });
    expect(fine.log).toEqual([]);
  });

  it("dois toques seguidos no mesmo lugar correm; tocar e arrastar não vira toque", () => {
    const r = rig({ hooks: false });
    r.send("pointerdown", 50, 60);
    r.send("pointerup", 50, 60);
    r.send("pointerdown", 52, 61);
    r.send("pointerup", 52, 61);
    expect(r.taps.map((t) => t.run)).toEqual([false, true]);
    r.send("pointerdown", 50, 60);
    r.send("pointermove", 120, 60);
    r.send("pointerup", 120, 60);
    expect(r.taps).toHaveLength(2);
    expect(r.actions.some((a) => a.type === "look")).toBe(true);
  });
});

describe("touchGestures · pinça no exame (T12)", () => {
  const zooms = (r: Rig) => r.actions.filter((a): a is Extract<Action, { type: "zoom" }> => a.type === "zoom").map((a) => a.delta);

  it(`abrir os dedos aproxima (zoom −1 a cada ${PINCH_STEP} px), fechar afasta; dois dedos não giram`, () => {
    const r = rig({ hooks: false });
    r.setMode("examine");
    r.send("pointerdown", 100, 300, 1);
    r.send("pointerdown", 200, 300, 2);
    r.send("pointermove", 240, 300, 2); // 100 → 140 px
    expect(zooms(r)).toEqual([-1, -1]);
    r.send("pointermove", 160, 300, 2); // 140 → 60 px
    expect(zooms(r)).toEqual([-1, -1, 1, 1, 1, 1]);
    expect(r.actions.some((a) => a.type === "rotate")).toBe(false);
    r.send("pointerup", 160, 300, 2);
    r.send("pointerup", 100, 300, 1);
    expect(r.taps).toHaveLength(0);
  });

  it("pinça só no exame: andando, dois dedos não ampliam", () => {
    const r = rig({ hooks: false });
    r.send("pointerdown", 100, 300, 1);
    r.send("pointerdown", 200, 300, 2);
    r.send("pointermove", 300, 300, 2);
    expect(zooms(r)).toEqual([]);
  });

  it("reset (perder o foco no meio da pinça) limpa os dedos: a próxima pinça recomeça do zero", () => {
    const r = rig({ hooks: false });
    r.setMode("examine");
    r.send("pointerdown", 100, 300, 1);
    r.send("pointerdown", 200, 300, 2);
    r.g.reset();
    r.send("pointermove", 400, 300, 2);
    expect(zooms(r)).toEqual([]);
    // e o toque não fica morto: um dedo novo abre gesto de novo (arrastar gira o exame)
    r.send("pointerdown", 50, 50, 3);
    r.send("pointermove", 90, 50, 3);
    expect(r.actions.some((a) => a.type === "rotate")).toBe(true);
  });

  it("o 1º dedo para de girar quando o 2º chega", () => {
    const r = rig({ hooks: false });
    r.setMode("examine");
    r.send("pointerdown", 100, 300, 1);
    r.send("pointermove", 130, 300, 1);
    const rotations = r.actions.filter((a) => a.type === "rotate").length;
    r.send("pointerdown", 200, 300, 2);
    r.send("pointermove", 150, 300, 1);
    expect(r.actions.filter((a) => a.type === "rotate")).toHaveLength(rotations);
  });
});
