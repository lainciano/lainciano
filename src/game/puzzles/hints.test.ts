import { describe, expect, it } from "vitest";
import { createHintLadder } from "./hints";

const HINTS = ["um", "dois", "três"] as const;

/** Avança o relógio em passos de quadro (como o loop) e devolve as pistas soltas. */
function run(ladder: ReturnType<typeof createHintLadder>, seconds: number, dt = 0.05): string[] {
  const out: string[] = [];
  for (let t = 0; t < seconds - 1e-9; t += dt) {
    const h = ladder.update(dt);
    if (h) out.push(h);
  }
  return out;
}

describe("escada de pistas", () => {
  it("sem progresso por 60 s solta a 1ª pista (nem um quadro antes)", () => {
    const ladder = createHintLadder(HINTS, 60);
    expect(run(ladder, 59.9)).toEqual([]);
    expect(ladder.given()).toBe(0);
    expect(run(ladder, 0.15)).toEqual(["um"]);
    expect(ladder.given()).toBe(1);
  });

  it("cada pista espera o seu intervalo inteiro depois da anterior", () => {
    const ladder = createHintLadder(HINTS, 60);
    expect(run(ladder, 60.05)).toEqual(["um"]);
    expect(run(ladder, 59.8)).toEqual([]);
    expect(run(ladder, 0.3)).toEqual(["dois"]);
  });

  it("progress() zera o relógio: avançar no puzzle adia a próxima pista", () => {
    const ladder = createHintLadder(HINTS, 60);
    run(ladder, 50);
    ladder.progress();
    expect(run(ladder, 50)).toEqual([]);
    expect(run(ladder, 10.1)).toEqual(["um"]);
  });

  it("depois da última, update devolve null para sempre", () => {
    const ladder = createHintLadder(HINTS, 2);
    expect(run(ladder, 6.1)).toEqual(["um", "dois", "três"]);
    expect(ladder.given()).toBe(3);
    expect(run(ladder, 600, 0.5)).toEqual([]);
    expect(ladder.update(1000)).toBeNull();
    expect(ladder.given()).toBe(3);
  });

  it("um quadro enorme solta no máximo uma pista (nada de rajada depois de uma pausa)", () => {
    const ladder = createHintLadder(HINTS, 2);
    expect(ladder.update(100)).toBe("um");
    expect(ladder.update(0)).toBeNull();
    expect(ladder.given()).toBe(1);
  });

  it("recomeça de onde o save parou (recarregar não repete pistas já dadas)", () => {
    const ladder = createHintLadder(HINTS, 2, 2);
    expect(ladder.given()).toBe(2);
    expect(run(ladder, 2.1)).toEqual(["três"]);
    const done = createHintLadder(HINTS, 2, 9);
    expect(done.given()).toBe(3);
    expect(done.update(10)).toBeNull();
  });

  it("dt negativo ou NaN não anda o relógio para trás nem trava", () => {
    const ladder = createHintLadder(HINTS, 2);
    ladder.update(-50);
    ladder.update(Number.NaN);
    expect(run(ladder, 2.05)).toEqual(["um"]);
  });
});
