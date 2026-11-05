import { describe, expect, it } from "vitest";
import { initialMemory } from "./schema";
import { addToMap, addUnique, createHesitationTracker, createPlaceClock, formatArrival, HESITATE_MS, isNewVisit, isNight, pushLast, VISIT_GAP_MS } from "./track";

const T0 = new Date(2026, 10, 4, 14, 30).getTime();
const seen = (over: Partial<ReturnType<typeof initialMemory>> = {}) => ({ ...initialMemory(T0), visits: 1, lastAt: T0, ...over });

describe("isNewVisit", () => {
  it("memória vazia é sempre visita nova", () => {
    expect(isNewVisit(initialMemory(T0), T0, true)).toBe(true);
  });
  it("recarregar (marca de sessão presente, pouco tempo) não conta", () => {
    expect(isNewVisit(seen(), T0 + 5 * 60_000, true)).toBe(false);
  });
  it("reabrir depois de fechar a aba (sem marca de sessão) conta", () => {
    expect(isNewVisit(seen(), T0 + 1000, false)).toBe(true);
  });
  it("≥ 30 min parado conta, mesmo na mesma aba", () => {
    expect(isNewVisit(seen(), T0 + VISIT_GAP_MS - 1, true)).toBe(false);
    expect(isNewVisit(seen(), T0 + VISIT_GAP_MS, true)).toBe(true);
  });
});

describe("hora local", () => {
  it("formata HH:MM com zero à esquerda e nunca expõe fuso", () => {
    expect(formatArrival(new Date(2026, 0, 2, 3, 7))).toBe("03:07");
    expect(formatArrival(new Date(2026, 0, 2, 23, 59))).toBe("23:59");
  });
  it("madrugada vai de 00:00 até antes das 05:00", () => {
    expect(isNight(new Date(2026, 0, 2, 0, 0))).toBe(true);
    expect(isNight(new Date(2026, 0, 2, 4, 59))).toBe(true);
    expect(isNight(new Date(2026, 0, 2, 5, 0))).toBe(false);
    expect(isNight(new Date(2026, 0, 2, 23, 0))).toBe(false);
  });
});

describe("listas com teto", () => {
  it("addUnique não repete nem passa do teto", () => {
    expect(addUnique(["a"], "a", 3)).toEqual(["a"]);
    expect(addUnique(["a", "b"], "c", 2)).toEqual(["a", "b"]);
  });
  it("pushLast mantém as últimas", () => {
    expect(pushLast([1, 2, 3], 4, 3)).toEqual([2, 3, 4]);
  });
  it("addToMap soma e ignora chave nova além do teto", () => {
    expect(addToMap({ a: 5 }, "a", 2, 1)).toEqual({ a: 7 });
    expect(addToMap({ a: 5 }, "b", 2, 1)).toEqual({ a: 5 });
  });
});

describe("hesitação", () => {
  const pos = { x: 1, z: 1 };
  /** Roda `seconds` de quadros de 100 ms. */
  const run = (t: ReturnType<typeof createHesitationTracker>, seconds: number, id: string | null, at = pos, active = true) => {
    let out = null;
    for (let i = 0; i < seconds * 10; i++) out = t.update(100, id, at, active) ?? out;
    return out;
  };

  it("até 8 s parado não é hesitação", () => {
    const t = createHesitationTracker();
    run(t, 8, "bilhete");
    expect(t.update(100, null, pos, true)).toBeNull();
  });
  it("acima de 8 s vira hesitação quando a espera termina", () => {
    const t = createHesitationTracker();
    run(t, 12, "bilhete");
    const h = t.update(100, "porta", pos, true);
    expect(h?.id).toBe("bilhete");
    expect(h!.ms).toBeGreaterThan(HESITATE_MS);
  });
  it("andar zera a espera", () => {
    const t = createHesitationTracker();
    run(t, 6, "bilhete");
    expect(t.update(100, "bilhete", { x: 2, z: 1 }, true)).toBeNull();
    run(t, 6, "bilhete", { x: 2, z: 1 });
    expect(t.flush()).toBeNull();
  });
  it("painel aberto (inativo) encerra a espera", () => {
    const t = createHesitationTracker();
    run(t, 10, "mesa");
    expect(t.update(100, "mesa", pos, false)?.id).toBe("mesa");
  });
  it("flush fecha a espera em curso", () => {
    const t = createHesitationTracker();
    run(t, 10, "mesa");
    expect(t.flush()?.id).toBe("mesa");
    expect(t.flush()).toBeNull();
  });
});

describe("relógio por lugar", () => {
  it("entrega ao mudar de lugar e a cada bloco", () => {
    const c = createPlaceClock(5000);
    expect(c.tick(2000, "entrada")).toBeNull();
    expect(c.tick(2000, "entrada")).toBeNull();
    expect(c.tick(2000, "entrada")).toEqual({ id: "entrada", ms: 6000 });
    c.tick(1500, "entrada");
    expect(c.tick(100, "mesa")).toEqual({ id: "entrada", ms: 1500 });
    expect(c.flush()).toBeNull(); // 100 ms: menos de 1 s não vale
  });
  it("sem lugar (viagem) não acumula", () => {
    const c = createPlaceClock();
    c.tick(5000, null);
    expect(c.flush()).toBeNull();
  });
});
