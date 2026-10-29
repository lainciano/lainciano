import { describe, expect, it } from "vitest";
import type { Line, LayerPuzzle } from "../layers/types";
import { initialSave, type SaveV1 } from "../save/schema";
import { createHintDriver, HINT_GAP, hintClockRuns, hintGapFrom } from "./hints";

/** Puzzle de mentira: as pistas dadas e os passos moram no "save" (como na camada). */
function world(start: { given?: number; steps?: number; solved?: boolean } = {}) {
  const state = { given: start.given ?? 0, steps: start.steps ?? 0, solved: start.solved ?? false };
  const save = initialSave(0);
  const puzzle: LayerPuzzle = {
    hints: ["p1", "p2", "p3"],
    given: () => state.given,
    steps: () => state.steps,
    solved: () => state.solved,
    hint: () => {
      state.given += 1;
    },
  };
  const said: Line[] = [];
  return { state, puzzle, said, save: (): SaveV1 => save };
}

const tick = (d: ReturnType<typeof createHintDriver>, seconds: number, active = true) => {
  for (let t = 0; t < seconds - 1e-9; t += 0.05) d.update(0.05, active);
};

describe("escada de pistas na sessão", () => {
  it("hintgap só vale com debug, e só número positivo; o padrão é 60 s", () => {
    expect(HINT_GAP).toBe(60);
    expect(hintGapFrom("?debug=1&hintgap=2", true)).toBe(2);
    expect(hintGapFrom("?hintgap=2", false)).toBe(60);
    expect(hintGapFrom("?debug=1&hintgap=abc", true)).toBe(60);
    expect(hintGapFrom("?debug=1&hintgap=-3", true)).toBe(60);
    expect(hintGapFrom("?debug=1&hintgap=0.5", true)).toBe(0.5);
  });

  it("as 3 pistas saem como falas de pista (hint: true) e o save conta cada uma", () => {
    const w = world();
    const d = createHintDriver(w.puzzle, w.save, 2, (l) => w.said.push(l));
    tick(d, 6.1);
    expect(w.said).toEqual([
      { text: "p1", kind: "speech", hint: true },
      { text: "p2", kind: "speech", hint: true },
      { text: "p3", kind: "speech", hint: true },
    ]);
    expect(w.state.given).toBe(3);
  });

  it("o relógio só corre ativo (andando, sem painel); um passo dado em qualquer modo zera", () => {
    const w = world();
    const d = createHintDriver(w.puzzle, w.save, 2, (l) => w.said.push(l));
    tick(d, 30, false);
    expect(w.said).toEqual([]);
    tick(d, 1.5);
    w.state.steps = 1; // leu o bilhete (painel aberto)
    tick(d, 0.5, false);
    tick(d, 1.5);
    expect(w.said).toEqual([]);
    tick(d, 0.6);
    expect(w.said.map((l) => l.text)).toEqual(["p1"]);
  });

  it("recarregar recomeça das pistas já dadas; resolvido, para", () => {
    const w = world({ given: 2 });
    const d = createHintDriver(w.puzzle, w.save, 2, (l) => w.said.push(l));
    tick(d, 2.1);
    expect(w.said.map((l) => l.text)).toEqual(["p3"]);
    const s = world({ solved: true });
    const done = createHintDriver(s.puzzle, s.save, 2, (l) => s.said.push(l));
    tick(done, 10);
    expect(s.said).toEqual([]);
  });

  it("pausado (mouse solto) não anda o relógio: nem andando, nem em painel", () => {
    expect(hintClockRuns("walk", false)).toBe(true);
    expect(hintClockRuns("walk", true)).toBe(false);
    expect(hintClockRuns("read", false)).toBe(false);
    const w = world();
    const d = createHintDriver(w.puzzle, w.save, 2, (l) => w.said.push(l));
    for (let t = 0; t < 20; t += 0.05) d.update(0.05, hintClockRuns("walk", true));
    expect(w.state.given).toBe(0);
    expect(w.said).toEqual([]);
  });
});
