import { describe, expect, it } from "vitest";
import { HOLD_SHAKE_FROM } from "@/interaction/limiar/hold";
import {
  IDLE_INPUT,
  SHAKE_MAX_PX,
  droneShouldStop,
  isAssistiveClick,
  holdOrigin,
  isHoldKey,
  isHolding,
  progressStep,
  reduceHoldInput,
  shakeAmplitude,
  type HoldEvent,
  type HoldInput,
} from "@/interaction/limiar/acts/hold-plan";

const run = (events: HoldEvent[], from: HoldInput = IDLE_INPUT) => events.reduce(reduceHoldInput, from);

describe("reduceHoldInput", () => {
  it("espaço segura e soltar o espaço solta", () => {
    expect(isHolding(run([{ type: "keydown", key: " " }]))).toBe(true);
    expect(isHolding(run([{ type: "keydown", key: " " }, { type: "keyup", key: " " }]))).toBe(false);
  });

  it("autorepetição do teclado não empilha a tecla", () => {
    const state = run([
      { type: "keydown", key: "Enter" },
      { type: "keydown", key: "Enter" },
      { type: "keydown", key: "Enter" },
      { type: "keyup", key: "Enter" },
    ]);
    expect(isHolding(state)).toBe(false);
  });

  it("autorrepetição sem keydown novo não começa a segurar", () => {
    expect(isHolding(run([{ type: "keydown", key: "Enter", repeat: true }]))).toBe(false);
  });

  it("outras teclas não seguram", () => {
    expect(isHolding(run([{ type: "keydown", key: "a" }]))).toBe(false);
    expect(isHoldKey("Tab")).toBe(false);
  });

  it("espaço e Enter juntos: só solta quando os dois sobem", () => {
    const both = run([
      { type: "keydown", key: " " },
      { type: "keydown", key: "Enter" },
      { type: "keyup", key: " " },
    ]);
    expect(isHolding(both)).toBe(true);
    expect(isHolding(reduceHoldInput(both, { type: "keyup", key: "Enter" }))).toBe(false);
  });

  it("ponteiro e teclado se somam", () => {
    const state = run([{ type: "pointerdown" }, { type: "keydown", key: " " }, { type: "pointerup" }]);
    expect(isHolding(state)).toBe(true);
  });

  it("perder o foco solta as teclas mas não o ponteiro", () => {
    const state = run([{ type: "pointerdown" }, { type: "keydown", key: " " }, { type: "blur" }]);
    expect(state.keys).toEqual([]);
    expect(state.pointer).toBe(true);
  });

  it("reset solta tudo", () => {
    expect(run([{ type: "pointerdown" }, { type: "keydown", key: " " }, { type: "reset" }])).toEqual(IDLE_INPUT);
  });

  it("clique assistivo segura até o fim: tecla, ponteiro e foco não soltam", () => {
    const state = run([
      { type: "assist" },
      { type: "keyup", key: " " },
      { type: "pointerup" },
      { type: "blur" },
    ]);
    expect(isHolding(state)).toBe(true);
    expect(state.pointer).toBe(false);
  });

  it("reset solta também o clique assistivo", () => {
    expect(run([{ type: "assist" }, { type: "reset" }])).toEqual(IDLE_INPUT);
  });

  it("evento sem efeito devolve o mesmo estado", () => {
    expect(reduceHoldInput(IDLE_INPUT, { type: "pointerup" })).toBe(IDLE_INPUT);
    expect(reduceHoldInput(IDLE_INPUT, { type: "keyup", key: " " })).toBe(IDLE_INPUT);
  });
});

describe("progressStep", () => {
  it("anuncia em degraus de 25 e 100 só no fim", () => {
    expect(progressStep(0)).toBe(0);
    expect(progressStep(0.24)).toBe(0);
    expect(progressStep(0.25)).toBe(25);
    expect(progressStep(0.6)).toBe(50);
    expect(progressStep(0.99)).toBe(75);
    expect(progressStep(1)).toBe(100);
    expect(progressStep(Number.NaN)).toBe(0);
  });
});

describe("shakeAmplitude", () => {
  it("não treme antes do limiar nem com movimento reduzido", () => {
    expect(shakeAmplitude(HOLD_SHAKE_FROM - 0.01, false)).toBe(0);
    expect(shakeAmplitude(1, true)).toBe(0);
  });

  it("cresce até o máximo no fim", () => {
    expect(shakeAmplitude(HOLD_SHAKE_FROM, false)).toBe(0);
    expect(shakeAmplitude(1, false)).toBe(SHAKE_MAX_PX);
    expect(shakeAmplitude(0.9, false)).toBeGreaterThan(0);
    expect(shakeAmplitude(0.9, false)).toBeLessThan(SHAKE_MAX_PX);
  });
});

describe("holdOrigin", () => {
  const ring = { left: 100, top: 200, width: 40, height: 60 };

  it("usa o ponto do ponteiro quando houver", () => {
    expect(holdOrigin({ x: 5, y: 7 }, ring)).toEqual({ x: 5, y: 7 });
  });

  it("pelo teclado, o centro do anel", () => {
    expect(holdOrigin(null, ring)).toEqual({ x: 120, y: 230 });
  });
});

describe("isAssistiveClick", () => {
  it("clique sem detalhe (leitor de tela) aciona", () => {
    expect(isAssistiveClick(0, false)).toBe(true);
  });

  it("clique de mouse ou toque (detail ≥ 1) nunca aciona", () => {
    expect(isAssistiveClick(1, false)).toBe(false);
    expect(isAssistiveClick(2, false)).toBe(false);
  });

  it("depois de acender não aciona de novo", () => {
    expect(isAssistiveClick(0, true)).toBe(false);
  });
});

describe("droneShouldStop", () => {
  it("toque mais curto que um quadro: soltou com a carga vazia, para", () => {
    expect(droneShouldStop(false, 0)).toBe(true);
  });

  it("segurando, ou ainda esvaziando, continua", () => {
    expect(droneShouldStop(true, 0)).toBe(false);
    expect(droneShouldStop(false, 0.3)).toBe(false);
  });
});
