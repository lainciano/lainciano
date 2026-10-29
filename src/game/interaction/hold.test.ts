import { describe, expect, it } from "vitest";
import type { InteractiveObject } from "../layers/types";
import { initialSave } from "../save/schema";
import { createHold, HOLD_MIN, holdFor } from "./hold";

describe("segurar", () => {
  it("segurando além da duração, update conclui (uma vez)", () => {
    const h = createHold(1.4);
    h.press();
    const r = h.update(1.5);
    expect(r.done).toBe(true);
    expect(r.progress).toBe(1);
    expect(h.update(0.1).done).toBe(false);
  });

  it("sem apertar, o tempo não anda", () => {
    const h = createHold(1.4);
    expect(h.update(2)).toEqual({ progress: 0, done: false });
  });

  it("o progresso sobe com o tempo seguro", () => {
    const h = createHold(2);
    h.press();
    expect(h.update(0.5).progress).toBeCloseTo(0.25, 6);
    expect(h.update(0.5).progress).toBeCloseTo(0.5, 6);
  });

  it("soltar antes de 0,22 s é curto demais", () => {
    expect(HOLD_MIN).toBe(0.22);
    const h = createHold(1.4);
    h.press();
    h.update(0.1);
    expect(h.release()).toEqual({ done: false, tooShort: true });
  });

  it("soltar depois de 0,22 s sem completar não é 'curto', e o anel recua até zero", () => {
    const h = createHold(1.4);
    h.press();
    h.update(0.5);
    expect(h.release()).toEqual({ done: false, tooShort: false });
    const a = h.update(0.1).progress;
    expect(a).toBeLessThan(0.5 / 1.4);
    let p = a;
    for (let i = 0; i < 20; i++) p = h.update(0.1).progress;
    expect(p).toBe(0);
  });

  it("soltar depois de concluir informa done (o ato já saiu pelo update)", () => {
    const h = createHold(1);
    h.press();
    expect(h.update(1.2).done).toBe(true);
    expect(h.release()).toEqual({ done: true, tooShort: false });
    // a próxima vez começa do zero
    h.press();
    expect(h.update(0.5).progress).toBeCloseTo(0.5, 6);
  });

  it("cancelar (alvo perdido) zera sem acusar 'curto'", () => {
    const h = createHold(1.4);
    h.press();
    h.update(0.1);
    h.cancel();
    expect(h.update(0.1)).toEqual({ progress: 0, done: false });
    expect(h.release()).toEqual({ done: false, tooShort: false });
  });

  it("apertar de novo durante o recuo recomeça do zero", () => {
    const h = createHold(1);
    h.press();
    h.update(0.6);
    h.release();
    h.press();
    expect(h.update(0.1).progress).toBeCloseTo(0.1, 6);
  });

  it("o tempo exato fecha; dt zero não avança", () => {
    const h = createHold(1);
    h.press();
    expect(h.update(0).progress).toBe(0);
    expect(h.update(1).done).toBe(true);
  });
});

describe("holdFor: o segurar depende do estado (T12)", () => {
  const base: InteractiveObject = { id: "porta", place: "porta", roots: [], material: "madeira", verb: () => "abrir", enabled: () => true, act: () => {} };
  const save = initialSave(0);

  it("objeto sem hold não é de segurar", () => {
    expect(holdFor({ ...base }, save)).toBeUndefined();
  });

  it("literal continua valendo (compatível com a T9)", () => {
    const o: InteractiveObject = { ...base, hold: { seconds: 1.4, verb: "forçar a porta" } };
    expect(holdFor(o, save)).toEqual({ seconds: 1.4, verb: "forçar a porta" });
  });

  it("função lê o estado a cada chamada e pode devolver undefined (E age na hora)", () => {
    const o: InteractiveObject = { ...base, hold: (s) => (s.flags["pista3"] ? { seconds: 2, verb: "forçar" } : undefined) };
    expect(holdFor(o, save)).toBeUndefined();
    expect(holdFor(o, { ...save, flags: { pista3: true } })).toEqual({ seconds: 2, verb: "forçar" });
  });
});
