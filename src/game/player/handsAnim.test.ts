import { describe, expect, it } from "vitest";
import { createHandsAnim, HANDS_TIMING, type HandsInput, type HandsPose } from "./handsAnim";

/** Profundidade do aperto de uma tecla na pose (0 se não está sendo apertada). */
const depthOf = (pose: HandsPose, key: string) => pose.phone.presses.find((p) => p.key === key)?.depth ?? 0;

const STILL: HandsInput = { moving: false, run: false, crouch: false, panel: false, aiming: false, bob: 0 };

/** Roda `seconds` em passos de `dt` e devolve as poses e os eventos. */
function play(anim: ReturnType<typeof createHandsAnim>, seconds: number, input: Partial<HandsInput> = {}, dt = 1 / 60) {
  const poses: HandsPose[] = [];
  const events: string[] = [];
  for (let t = 0; t < seconds - 1e-9; t += dt) {
    const out = anim.step(dt, { ...STILL, ...input });
    // a pose devolvida é reaproveitada a cada quadro: copiar para guardar
    poses.push(structuredClone(out.pose));
    events.push(...out.events);
  }
  return { poses, events, last: poses[poses.length - 1] };
}

describe("mãos · ligar e apagar a lanterna", () => {
  it("começa acesa e segurada; ligar/apagar: o polegar aperta, a luz segue com atraso e há um clique", () => {
    const anim = createHandsAnim({ seed: 1, reduced: false, still: false, flashOn: true });
    const first = anim.step(1 / 60, STILL);
    expect(first.pose.light).toBe(1);
    expect(anim.state().mode).toBe("held");
    anim.toggleFlash();
    const { poses, events } = play(anim, 0.5);
    // o polegar desce até apertar o botão e volta
    const thumb = poses.map((p) => p.thumb);
    expect(Math.max(...thumb)).toBeGreaterThan(0.9);
    expect(thumb[thumb.length - 1]).toBeLessThan(0.05);
    // a luz só apaga depois do aperto (atraso), não no primeiro quadro
    const offAt = poses.findIndex((p) => p.light === 0);
    const pressAt = thumb.findIndex((v) => v > 0.9);
    expect(offAt).toBeGreaterThan(pressAt);
    expect(offAt / 60).toBeLessThan(HANDS_TIMING.toggle);
    expect(events.filter((e) => e === "click")).toHaveLength(1);
    expect(anim.state().flashOn).toBe(false);
  });

  it("com movimento reduzido, ligar/apagar é quase instantâneo (≤ 120 ms)", () => {
    const anim = createHandsAnim({ seed: 1, reduced: true, still: false, flashOn: false });
    anim.toggleFlash();
    const { poses } = play(anim, 0.3);
    const onAt = poses.findIndex((p) => p.light === 1);
    expect(onAt).toBeGreaterThanOrEqual(0);
    expect((onAt + 1) / 60).toBeLessThanOrEqual(0.12);
  });
});

describe("mãos · guardar e sacar", () => {
  it("abrir painel guarda a lanterna (desce e sai do quadro); voltar a andar saca de novo", () => {
    const anim = createHandsAnim({ seed: 2, reduced: false, still: false, flashOn: true });
    play(anim, 0.2);
    const held = structuredClone(anim.step(1 / 60, STILL).pose);
    const down = play(anim, 0.8, { panel: true });
    expect(anim.state().mode).toBe("holstered");
    expect(down.last.holster).toBe(1);
    // fora do quadro: bem abaixo de onde estava
    expect(down.last.right.y).toBeLessThan(held.right.y - 0.25);
    const states: string[] = [];
    for (let i = 0; i < 60; i++) {
      anim.step(1 / 60, STILL);
      states.push(anim.state().mode);
    }
    expect(states).toContain("drawing");
    expect(anim.state().mode).toBe("held");
    expect(anim.step(1 / 60, STILL).pose.holster).toBe(0);
  });

  it("com movimento reduzido, guardar e sacar levam ≤ 120 ms", () => {
    const anim = createHandsAnim({ seed: 2, reduced: true, still: false, flashOn: true });
    const down = play(anim, 0.12, { panel: true });
    expect(down.last.holster).toBe(1);
    const up = play(anim, 0.12);
    expect(up.last.holster).toBe(0);
  });
});

describe("mãos · ociosas", () => {
  it("parado, a mão faz uma ociosa de tempos em tempos (troca de pegada, balanço ou ajeitar)", () => {
    const anim = createHandsAnim({ seed: 7, reduced: false, still: false, flashOn: true });
    const kinds = new Set<string>();
    for (let i = 0; i < 60 * 40; i++) {
      anim.step(1 / 60, STILL);
      kinds.add(anim.state().idle);
    }
    kinds.delete("none");
    expect(kinds.size).toBeGreaterThanOrEqual(2);
  });

  it("andando não há ociosa", () => {
    const anim = createHandsAnim({ seed: 7, reduced: false, still: false, flashOn: true });
    for (let i = 0; i < 60 * 30; i++) {
      anim.step(1 / 60, { ...STILL, moving: true, bob: i / 10 });
      expect(anim.state().idle).toBe("none");
    }
  });

  it("mesma semente, mesma sequência; outra semente, outra", () => {
    const seq = (seed: number) => {
      const anim = createHandsAnim({ seed, reduced: false, still: false, flashOn: true });
      return play(anim, 20).poses.map((p) => [p.grip, p.right.x, p.right.y, p.left.y].map((v) => v.toFixed(5)).join(",")).join("|");
    };
    expect(seq(11)).toBe(seq(11));
    expect(seq(11)).not.toBe(seq(12));
  });

  it("movimento reduzido: nenhuma ociosa, nenhum balanço nem respiração (pose constante parado)", () => {
    const anim = createHandsAnim({ seed: 3, reduced: true, still: false, flashOn: true });
    const { poses } = play(anim, 30);
    const first = JSON.stringify(poses[5]);
    expect(poses.slice(5).every((p) => JSON.stringify(p) === first)).toBe(true);
  });

  it("modo still (foto): pose congelada mesmo com o tempo andando", () => {
    const anim = createHandsAnim({ seed: 3, reduced: false, still: true, flashOn: true });
    const { poses } = play(anim, 30);
    const first = JSON.stringify(poses[0]);
    expect(poses.every((p) => JSON.stringify(p) === first)).toBe(true);
  });
});

describe("mãos · ações e corpo", () => {
  it("mirando um objeto ao alcance, a lanterna sobe e se aproxima", () => {
    const anim = createHandsAnim({ seed: 4, reduced: true, still: false, flashOn: true });
    const rest = play(anim, 0.6).last;
    const aim = play(anim, 0.6, { aiming: true }).last;
    expect(aim.right.y).toBeGreaterThan(rest.right.y);
    expect(aim.right.z).toBeGreaterThan(rest.right.z);
  });

  it("correndo, o balanço é maior que andando; agachado, a mão chega perto do corpo", () => {
    const swing = (run: boolean) => {
      const anim = createHandsAnim({ seed: 5, reduced: false, still: false, flashOn: true });
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = 0; i < 240; i++) {
        const p = anim.step(1 / 60, { ...STILL, moving: true, run, bob: i * 0.15 }).pose;
        if (i > 60) {
          lo = Math.min(lo, p.right.y);
          hi = Math.max(hi, p.right.y);
        }
      }
      return hi - lo;
    };
    expect(swing(true)).toBeGreaterThan(swing(false) * 1.5);
    const anim = createHandsAnim({ seed: 5, reduced: true, still: false, flashOn: true });
    const stand = play(anim, 0.5).last;
    const crouch = play(anim, 0.5, { crouch: true }).last;
    expect(crouch.right.z).toBeGreaterThan(stand.right.z);
    expect(Math.abs(crouch.right.x)).toBeLessThan(Math.abs(stand.right.x));
  });
});

describe("mãos · balanço ao andar (fase do passo)", () => {
  /** Amplitude pico a pico de um canal da mão direita durante um trecho andando com a fase do passo correndo. */
  function swing(input: Partial<HandsInput>, channel: "x" | "y" | "rz", o: { reduced?: boolean } = {}, rate = 8.5) {
    const anim = createHandsAnim({ seed: 9, reduced: o.reduced ?? false, still: false, flashOn: true });
    let lo = Infinity;
    let hi = -Infinity;
    let bob = 0;
    for (let i = 0; i < 300; i++) {
      bob += rate / 60;
      const p = anim.step(1 / 60, { ...STILL, ...input, bob }).pose;
      if (i > 120) {
        lo = Math.min(lo, p.right[channel]);
        hi = Math.max(hi, p.right[channel]);
      }
    }
    return hi - lo;
  }

  it("andando, a mão balança na vertical, na lateral e gira o pulso", () => {
    expect(swing({ moving: true }, "y")).toBeGreaterThan(0.006);
    expect(swing({ moving: true }, "x")).toBeGreaterThan(0.01);
    expect(swing({ moving: true }, "rz")).toBeGreaterThan(0.03);
  });
  it("correndo balança mais; agachado menos; parado quase nada (só respirar)", () => {
    const walk = swing({ moving: true }, "y");
    expect(swing({ moving: true, run: true }, "y", {}, 12)).toBeGreaterThan(walk * 1.5);
    expect(swing({ moving: true, crouch: true }, "y", {}, 6)).toBeLessThan(walk * 0.7);
    expect(swing({}, "y")).toBeLessThan(0.006);
  });
  it("movimento reduzido: nenhum balanço", () => {
    expect(swing({ moving: true, run: true }, "y", { reduced: true }, 12)).toBe(0);
    expect(swing({ moving: true }, "rz", { reduced: true })).toBe(0);
  });
  it("a amplitude entra e sai suave (não salta ao começar a andar)", () => {
    const anim = createHandsAnim({ seed: 9, reduced: false, still: false, flashOn: true });
    const y0 = anim.step(1 / 60, STILL).pose.right.y;
    // um quadro andando, na pior fase do passo: a mão mal se mexe
    const y1 = anim.step(1 / 60, { ...STILL, moving: true, bob: Math.PI / 2 }).pose.right.y;
    expect(Math.abs(y1 - y0)).toBeLessThan(0.002);
  });
  it("a mão esquerda balança mais discreta que a direita", () => {
    const anim = createHandsAnim({ seed: 9, reduced: false, still: false, flashOn: true });
    let rl = Infinity;
    let rh = -Infinity;
    let ll = Infinity;
    let lh = -Infinity;
    for (let i = 0; i < 300; i++) {
      const p = anim.step(1 / 60, { ...STILL, moving: true, bob: (i * 8.5) / 60 }).pose;
      if (i < 120) continue;
      rl = Math.min(rl, p.right.x);
      rh = Math.max(rh, p.right.x);
      ll = Math.min(ll, p.left.x);
      lh = Math.max(lh, p.left.x);
    }
    expect(lh - ll).toBeGreaterThan(0);
    expect(lh - ll).toBeLessThan((rh - rl) * 0.75);
  });
});

describe("mãos · celular (rig para a T11)", () => {
  it("phone-open: a mão esquerda sobe com o celular fechado, o polegar abre a tampa e o aparelho fica à frente do olho", () => {
    const anim = createHandsAnim({ seed: 21, reduced: false, still: false, flashOn: true });
    play(anim, 0.3);
    anim.phone("open");
    expect(anim.state().phone).toBe("opening");
    const seen: { lid: number; y: number }[] = [];
    for (let i = 0; i < 90; i++) {
      const p = anim.step(1 / 60, STILL).pose;
      seen.push({ lid: p.phone.lid, y: p.left.y });
    }
    // a tampa só abre depois que a mão subiu (a primeira metade sobe com a tampa fechada)
    const firstLid = seen.findIndex((s) => s.lid > 0.05);
    expect(seen[firstLid].y).toBeGreaterThan(-0.15);
    expect(anim.state().phone).toBe("holding");
    const held = anim.step(1 / 60, STILL).pose;
    expect(held.phone.visible).toBe(true);
    expect(held.phone.lid).toBe(1);
    expect(held.left.y).toBeGreaterThan(-0.12);
    expect(held.left.z).toBeGreaterThan(-0.4);
  });

  it("com o celular aberto, a lanterna vai para a mão direita baixa/guardada e volta ao fechar", () => {
    const anim = createHandsAnim({ seed: 21, reduced: false, still: false, flashOn: true });
    play(anim, 0.2);
    anim.phone("open");
    play(anim, 1.2);
    expect(anim.state().mode).toBe("holstered");
    anim.phone("close");
    expect(anim.state().phone).toBe("closing");
    const { last } = play(anim, 1.2);
    expect(anim.state().phone).toBe("none");
    expect(last.phone.visible).toBe(false);
    expect(anim.state().mode).toBe("held");
    expect(last.holster).toBe(0);
  });

  it("press(key): a tecla afunda e volta, com atraso pequeno e variação; um evento por tecla", () => {
    const anim = createHandsAnim({ seed: 21, reduced: false, still: false, flashOn: true });
    anim.phone("open");
    play(anim, 1.2);
    const timeline = (key: string) => {
      anim.press(key);
      const depth: number[] = [];
      const events: string[] = [];
      for (let i = 0; i < 30; i++) {
        const out = anim.step(1 / 60, STILL);
        depth.push(depthOf(out.pose, key));
        events.push(...out.events);
      }
      return { depth, events };
    };
    const a = timeline("5");
    expect(a.depth[0]).toBe(0);
    expect(Math.max(...a.depth)).toBe(1);
    expect(a.depth[a.depth.length - 1]).toBe(0);
    expect(a.events.filter((e) => e === "key:5")).toHaveLength(1);
    const b = timeline("5");
    // variação: o mesmo aperto não sai idêntico (atraso/duração sorteados)
    expect(b.depth.join(",")).not.toBe(a.depth.join(","));
  });

  it("press fora do celular aberto não faz nada; phone-close fecha a tampa antes de descer", () => {
    const anim = createHandsAnim({ seed: 21, reduced: false, still: false, flashOn: true });
    anim.press("1");
    expect(play(anim, 0.3).events).toEqual([]);
    anim.phone("open");
    play(anim, 1.2);
    anim.phone("close");
    const seen: { lid: number; y: number }[] = [];
    for (let i = 0; i < 60; i++) {
      const p = anim.step(1 / 60, STILL).pose;
      seen.push({ lid: p.phone.lid, y: p.left.y });
    }
    const closedAt = seen.findIndex((s) => s.lid === 0);
    expect(closedAt).toBeGreaterThan(0);
    // ao fechar a tampa a mão ainda está alta (desce depois)
    expect(seen[closedAt].y).toBeGreaterThan(-0.15);
  });

  it("com movimento reduzido, abrir e fechar o celular levam ≤ 120 ms cada", () => {
    const anim = createHandsAnim({ seed: 21, reduced: true, still: false, flashOn: true });
    anim.phone("open");
    play(anim, 0.12);
    expect(anim.state().phone).toBe("holding");
    anim.phone("close");
    play(anim, 0.12);
    expect(anim.state().phone).toBe("none");
  });

  it("determinístico: a mesma semente repete os mesmos apertos", () => {
    const run = () => {
      const anim = createHandsAnim({ seed: 33, reduced: false, still: false, flashOn: true });
      anim.phone("open");
      play(anim, 1.2);
      anim.press("7");
      return play(anim, 0.5).poses.map((p) => depthOf(p, "7").toFixed(4)).join(",");
    };
    expect(run()).toBe(run());
  });
});

describe("mãos · celular real (T11)", () => {
  it("press devolve se aceitou: só com o celular aberto e com vaga entre os 4 apertos", () => {
    const anim = createHandsAnim({ seed: 5, reduced: false, still: false, flashOn: true });
    expect(anim.press("ok")).toBe(false);
    anim.phone("open");
    play(anim, 1.2);
    expect([1, 2, 3, 4].map(() => anim.press("down"))).toEqual([true, true, true, true]);
    expect(anim.press("down")).toBe(false);
  });

  it("a pose expõe a subida (0..1, suave) e a mão esquerda sem o celular (para o rig girar por quatérnio)", () => {
    const anim = createHandsAnim({ seed: 5, reduced: false, still: false, flashOn: true });
    const rest = play(anim, 0.3).last;
    expect(rest.phone.raise).toBe(0);
    anim.phone("open");
    const raises = play(anim, 1.2).poses.map((p) => p.phone.raise);
    expect(raises[raises.length - 1]).toBe(1);
    for (let i = 1; i < raises.length; i++) expect(raises[i]).toBeGreaterThanOrEqual(raises[i - 1]);
    const held = anim.step(1 / 60, STILL).pose;
    // a base continua na pose de descanso (o celular se mistura por cima)
    expect(held.leftBase.y).toBeLessThan(-0.4);
  });

  it("setPhoneHold troca a pose de segurar (o rig encaixa a tela no campo de visão); null volta à nominal", () => {
    const anim = createHandsAnim({ seed: 5, reduced: false, still: false, flashOn: true });
    const hold = { x: -0.01, y: -0.05, z: -0.15, rx: 0.2, ry: 0.1, rz: -0.3, curl: 0.9 };
    anim.setPhoneHold(hold);
    anim.phone("open");
    const p = play(anim, 1.2).last;
    for (const k of ["x", "y", "z", "rx", "ry", "rz", "curl"] as const) expect(p.left[k]).toBeCloseTo(hold[k], 6);
    anim.setPhoneHold(null);
    expect(anim.step(1 / 60, STILL).pose.left.z).toBeCloseTo(-0.27, 6);
  });

  it("o polegar mira a última tecla apertada e, parado 1,2 s, volta ao descanso (aim vazio)", () => {
    const anim = createHandsAnim({ seed: 5, reduced: false, still: false, flashOn: true });
    anim.phone("open");
    play(anim, 1.2);
    expect(anim.step(1 / 60, STILL).pose.phone.aim).toBe("");
    anim.press("down");
    expect(anim.step(1 / 60, STILL).pose.phone.aim).toBe("down");
    play(anim, 0.6);
    expect(anim.step(1 / 60, STILL).pose.phone.aim).toBe("down");
    play(anim, 1.0);
    expect(anim.step(1 / 60, STILL).pose.phone.aim).toBe("");
  });

  it("flick: o polegar acompanha a tampa só enquanto ela abre (0 subindo e segurando)", () => {
    const anim = createHandsAnim({ seed: 5, reduced: false, still: false, flashOn: true });
    anim.phone("open");
    const flicks = play(anim, 1.2).poses.map((p) => ({ f: p.phone.flick, lid: p.phone.lid }));
    expect(flicks[0].f).toBe(0);
    const moving = flicks.filter((x) => x.lid > 0 && x.lid < 1);
    expect(moving.length).toBeGreaterThan(5);
    for (const x of moving) expect(x.f).toBeCloseTo(x.lid, 6);
    expect(flicks[flicks.length - 1].f).toBe(0);
  });
});

describe("mãos · celular, fila de apertos (T11, revisão M4)", () => {
  it("dois apertos em < 100 ms: o segundo só começa depois que o primeiro chega ao fundo; o polegar não salta antes", () => {
    const anim = createHandsAnim({ seed: 9, reduced: false, still: false, flashOn: true });
    anim.phone("open");
    play(anim, 1.2);
    anim.press("down");
    anim.step(1 / 60, STILL);
    anim.step(1 / 60, STILL);
    anim.press("ok");
    let firstFiredAt = -1;
    let secondStartedAt = -1;
    let aimSwitchedAt = -1;
    for (let i = 0; i < 60; i++) {
      const out = anim.step(1 / 60, STILL);
      if (firstFiredAt < 0 && out.events.includes("key:down")) firstFiredAt = i;
      if (secondStartedAt < 0 && depthOf(out.pose, "ok") > 0) secondStartedAt = i;
      if (aimSwitchedAt < 0 && out.pose.phone.aim === "ok") aimSwitchedAt = i;
    }
    expect(firstFiredAt).toBeGreaterThanOrEqual(0);
    expect(secondStartedAt).toBeGreaterThan(firstFiredAt);
    expect(aimSwitchedAt).toBeGreaterThanOrEqual(firstFiredAt);
  });

  it("cada aperto aceito dispara exatamente um key: na ordem em que foi pedido", () => {
    const anim = createHandsAnim({ seed: 9, reduced: false, still: false, flashOn: true });
    anim.phone("open");
    play(anim, 1.2);
    for (const k of ["down", "down", "ok"]) expect(anim.press(k)).toBe(true);
    const { events } = play(anim, 1.5);
    expect(events.filter((e) => e.startsWith("key:"))).toEqual(["key:down", "key:down", "key:ok"]);
  });
});

describe("mãos · revisão (rodada 4)", () => {
  /** Maior salto entre quadros consecutivos de um canal. */
  const maxJump = (poses: HandsPose[], f: (p: HandsPose) => number) => poses.slice(1).reduce((m, p, i) => Math.max(m, Math.abs(f(p) - f(poses[i]))), 0);

  for (const [name, interrupt] of [
    ["andar", { moving: true }],
    ["mirar", { aiming: true }],
    ["agachar", { crouch: true }],
    ["painel", { panel: true }],
  ] as const) {
    it(`interromper a ociosa (${name}) não dá estalo: nenhum salto além do da própria transição`, () => {
      // mesma sequência com e sem a ociosa em curso: a diferença de salto por quadro é o "estalo"
      const run = (kind: "regrip" | "sway" | "adjust" | null) => {
        const anim = createHandsAnim({ seed: 5, reduced: false, still: false, flashOn: true });
        play(anim, 0.2);
        if (kind) anim.forceIdle(kind);
        const before = play(anim, kind ? IDLE_PEAK[kind] : 0.4).poses;
        const after = play(anim, 0.3, interrupt).poses;
        expect(anim.state().idle).toBe("none");
        return [before[before.length - 1], ...after];
      };
      const plain = run(null);
      for (const kind of ["regrip", "sway", "adjust"] as const) {
        const seq = run(kind);
        expect(maxJump(seq, (p) => p.grip), `${kind}: pegada`).toBeLessThan(maxJump(plain, (p) => p.grip) + 0.2);
        // zerar de uma vez saltaria a amplitude inteira (pegada 0,9; giro ~0,045 rad; mão esquerda ~0,46 m): a
        // margem é bem menor que isso e cobre o decaimento suave em ~7 quadros
        expect(maxJump(seq, (p) => p.right.ry), `${kind}: giro`).toBeLessThan(maxJump(plain, (p) => p.right.ry) + 0.012);
        expect(maxJump(seq, (p) => p.right.rz), `${kind}: rolagem`).toBeLessThan(maxJump(plain, (p) => p.right.rz) + 0.012);
        expect(maxJump(seq, (p) => p.left.y), `${kind}: mão esquerda`).toBeLessThan(maxJump(plain, (p) => p.left.y) + 0.07);
      }
    });
  }

  it("F com a ociosa no meio também não dá estalo", () => {
    const anim = createHandsAnim({ seed: 5, reduced: false, still: false, flashOn: true });
    anim.forceIdle("regrip");
    const before = play(anim, 0.22).poses;
    anim.toggleFlash();
    const after = play(anim, 0.3).poses;
    expect(maxJump([before[before.length - 1], ...after], (p) => p.grip)).toBeLessThan(0.2);
  });

  it("movimento reduzido ligado em execução: o balanço e a respiração somem (suaves) e não voltam", () => {
    const anim = createHandsAnim({ seed: 9, reduced: false, still: false, flashOn: true });
    let bob = 0;
    const walk = () => anim.step(1 / 60, { ...STILL, moving: true, bob: (bob += 0.14) }).pose.right.y;
    for (let i = 0; i < 120; i++) walk();
    anim.setReduced(true);
    expect(anim.state().reduced).toBe(true);
    const ys: number[] = [];
    let prev = walk();
    let jump = 0;
    for (let i = 0; i < 240; i++) {
      const y = walk();
      jump = Math.max(jump, Math.abs(y - prev));
      prev = y;
      if (i > 120) ys.push(y);
    }
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1e-6);
    expect(jump).toBeLessThan(0.004);
  });

  it("ligar/apagar com painel ou celular aberto é barrado: sem animação nem clique", () => {
    const anim = createHandsAnim({ seed: 1, reduced: false, still: false, flashOn: true });
    anim.step(1 / 60, { ...STILL, panel: true });
    expect(anim.toggleFlash()).toBe(false);
    const a = play(anim, 0.5, { panel: true });
    expect(a.events).toEqual([]);
    expect(a.poses.every((p) => p.thumb === 0)).toBe(true);
    expect(anim.state().flashOn).toBe(true);
    play(anim, 0.6);
    anim.phone("open");
    play(anim, 0.2);
    expect(anim.toggleFlash()).toBe(false);
    anim.phone("close");
    play(anim, 1.2);
    expect(anim.toggleFlash()).toBe(true);
  });

  it("reverter no meio de guardar e de sacar continua de onde estava", () => {
    const anim = createHandsAnim({ seed: 2, reduced: false, still: false, flashOn: true });
    const down = play(anim, 0.15, { panel: true }).poses;
    const back = play(anim, 0.4).poses;
    const seq = [...down, ...back];
    expect(down[down.length - 1].holster).toBeGreaterThan(0.2);
    expect(down[down.length - 1].holster).toBeLessThan(0.8);
    // o fator anda no máximo dt/0,3 por quadro (≈ 0,056): sem volta ao começo nem salto
    expect(maxJump(seq, (p) => p.holster)).toBeLessThan(0.06);
    expect(maxJump(seq, (p) => p.right.y)).toBeLessThan(0.06);
    expect(anim.state().mode).toBe("held");
    const again = [...play(anim, 0.12, { panel: true }).poses, ...play(anim, 0.12).poses];
    expect(maxJump(again, (p) => p.holster)).toBeLessThan(0.06);
  });

  it("celular: fechar no meio da abertura (e abrir no meio do fechamento) continua de onde está", () => {
    const anim = createHandsAnim({ seed: 21, reduced: false, still: false, flashOn: true });
    anim.phone("open");
    const opening = play(anim, 0.2).poses;
    anim.phone("close");
    const closing = play(anim, 0.15).poses;
    let seq = [...opening, ...closing];
    // a subida anda no máximo ~0,04 m por quadro; reiniciar do zero pularia ~0,3 m
    expect(maxJump(seq, (p) => p.left.y)).toBeLessThan(0.05);
    expect(anim.state().phone).toBe("closing");
    anim.phone("open");
    const reopen = play(anim, 1.0).poses;
    seq = [...closing, ...reopen];
    expect(maxJump(seq, (p) => p.left.y)).toBeLessThan(0.05);
    expect(maxJump(seq, (p) => p.phone.lid)).toBeLessThan(0.08);
    expect(anim.state().phone).toBe("holding");
  });

  it("apertos sobrepostos: cada tecla afunda e volta sozinha, sem perder nem pular a anterior", () => {
    const anim = createHandsAnim({ seed: 21, reduced: false, still: false, flashOn: true });
    anim.phone("open");
    play(anim, 1.2);
    anim.press("1");
    const first = play(anim, 0.07).poses;
    anim.press("2");
    const rest = play(anim, 0.5);
    const seq = [...first, ...rest.poses];
    expect(Math.max(...seq.map((p) => depthOf(p, "1")))).toBe(1);
    expect(Math.max(...seq.map((p) => depthOf(p, "2")))).toBe(1);
    expect(maxJump(seq, (p) => depthOf(p, "1"))).toBeLessThan(0.5);
    expect(rest.events.filter((e) => e === "key:2")).toHaveLength(1);
    expect([...first, ...rest.poses].length).toBeGreaterThan(0);
  });
});

/** Instante de pico de cada ociosa (onde a interrupção mais estalaria). */
const IDLE_PEAK = { regrip: 0.22, sway: 0.4, adjust: 0.7 } as const;

describe("mãos · F enquanto saca (rodada 5)", () => {
  it("F durante o saque é aceito e o polegar clica assim que a lanterna volta à posição", () => {
    const anim = createHandsAnim({ seed: 1, reduced: false, still: false, flashOn: true });
    play(anim, 0.6, { panel: true });
    anim.step(1 / 60, STILL);
    expect(anim.state().mode).toBe("drawing");
    expect(anim.toggleFlash()).toBe(true);
    const { poses, events } = play(anim, 0.8);
    expect(events.filter((e) => e === "click")).toHaveLength(1);
    // o polegar só desce depois de a lanterna voltar (holster 0)
    const pressAt = poses.findIndex((p) => p.thumb > 0);
    expect(poses[pressAt].holster).toBe(0);
    expect(anim.state().flashOn).toBe(false);
  });
  it("um segundo F no meio do saque não clica duas vezes", () => {
    const anim = createHandsAnim({ seed: 1, reduced: false, still: false, flashOn: true });
    play(anim, 0.6, { panel: true });
    anim.step(1 / 60, STILL);
    anim.toggleFlash();
    expect(anim.toggleFlash()).toBe(false);
    expect(play(anim, 0.8).events.filter((e) => e === "click")).toHaveLength(1);
  });
});

describe("mãos · inércia ao virar (T14)", () => {
  const mk = (o: Partial<{ reduced: boolean; still: boolean }> = {}) => createHandsAnim({ seed: 3, reduced: false, still: false, flashOn: true, ...o });
  /** Mesma sequência com e sem giro; devolve a diferença da mão direita (a inércia pura) quadro a quadro. */
  function diff(spin: Partial<HandsInput>, o: Partial<{ reduced: boolean; still: boolean }> = {}, input: Partial<HandsInput> = {}, spinSeconds = 0.15, total = 1.2) {
    const a = mk(o);
    const b = mk(o);
    const out: { x: number; y: number; rx: number; ry: number; inertia: { yaw: number; pitch: number } }[] = [];
    for (let t = 0; t < total - 1e-9; t += 1 / 60) {
      const spinning = t < spinSeconds - 1e-9 ? spin : {};
      const pa = a.step(1 / 60, { ...STILL, ...input, ...spinning }).pose.right;
      const pb = b.step(1 / 60, { ...STILL, ...input }).pose.right;
      out.push({ x: pa.x - pb.x, y: pa.y - pb.y, rx: pa.rx - pb.rx, ry: pa.ry - pb.ry, inertia: { ...a.state().inertia } });
    }
    return out;
  }

  it("virar rápido para a esquerda: a mão e a lanterna atrasam (giram para a direita da tela), passam levemente e voltam ao centro", () => {
    const s = diff({ yawRate: 4 });
    const ry = s.map((v) => v.ry);
    const peak = Math.min(...ry);
    expect(peak).toBeLessThan(-0.03); // > 1,7°
    expect(peak).toBeGreaterThan(-0.14); // nunca sai do limite
    expect(Math.max(...s.map((v) => v.x))).toBeGreaterThan(0.008); // a mão desliza para a direita da tela
    expect(Math.max(...ry.slice(ry.indexOf(peak)))).toBeGreaterThan(0); // passa levemente do ponto
    expect(Math.abs(ry[ry.length - 1])).toBeLessThan(2e-3);
    expect(Math.abs(s[s.length - 1].x)).toBeLessThan(1e-3);
    // o estado de debug acompanha
    expect(Math.min(...s.map((v) => v.inertia.yaw))).toBeLessThan(-0.03);
  });

  it("pitch: olhar para cima rápido faz a mão cair (y e rx para baixo) e voltar", () => {
    const s = diff({ pitchRate: 4 });
    expect(Math.min(...s.map((v) => v.y))).toBeLessThan(-0.005);
    expect(Math.min(...s.map((v) => v.rx))).toBeLessThan(-0.02);
    expect(Math.abs(s[s.length - 1].rx)).toBeLessThan(2e-3);
  });

  it("sem giro não há inércia (parado, andando e correndo)", () => {
    for (const input of [{}, { moving: true, bob: 1 }, { moving: true, run: true, bob: 2 }]) {
      const s = diff({}, {}, input);
      expect(Math.max(...s.map((v) => Math.abs(v.ry) + Math.abs(v.x) + Math.abs(v.y) + Math.abs(v.rx)))).toBe(0);
      expect(s.every((v) => v.inertia.yaw === 0 && v.inertia.pitch === 0)).toBe(true);
    }
  });

  it("proporcional à velocidade e um pouco maior correndo", () => {
    const slow = Math.min(...diff({ yawRate: 0.5 }).map((v) => v.ry));
    const fast = Math.min(...diff({ yawRate: 3 }).map((v) => v.ry));
    expect(Math.abs(fast)).toBeGreaterThan(Math.abs(slow) * 3);
    const walk = Math.min(...diff({ yawRate: 2 }, {}, { moving: true, bob: 0 }, 0.5).map((v) => v.ry));
    const run = Math.min(...diff({ yawRate: 2 }, {}, { moving: true, run: true, bob: 0 }, 0.5).map((v) => v.ry));
    expect(Math.abs(run)).toBeGreaterThan(Math.abs(walk) * 1.1);
    expect(Math.abs(run)).toBeLessThan(Math.abs(walk) * 1.6);
  });

  it("agachado a inércia é igual à de pé", () => {
    const stand = Math.min(...diff({ yawRate: 3 }).map((v) => v.ry));
    const crouch = Math.min(...diff({ yawRate: 3 }, {}, { crouch: true }).map((v) => v.ry));
    expect(crouch).toBeCloseTo(stand, 2);
  });

  it("picos absurdos de velocidade (mouse travado, arraste) ficam dentro do teto", () => {
    const s = diff({ yawRate: 1e6, pitchRate: -1e6 }, {}, {}, 0.5);
    expect(Math.min(...s.map((v) => v.ry))).toBeGreaterThan(-0.2);
    expect(Math.max(...s.map((v) => v.rx))).toBeLessThan(0.15);
    expect(s.every((v) => Number.isFinite(v.ry) && Number.isFinite(v.x))).toBe(true);
  });

  it("com painel aberto não há inércia visível (some suave, sem salto), e também com o celular aberto", () => {
    for (const setup of ["panel", "phone"] as const) {
      const a = mk();
      const b = mk();
      if (setup === "phone") {
        a.phone("open");
        b.phone("open");
      }
      let prev = 0;
      let maxStep = 0;
      let last = 0;
      for (let t = 0; t < 1.2; t += 1 / 60) {
        const input = { ...STILL, panel: setup === "panel" };
        const ra = a.step(1 / 60, { ...input, yawRate: 3 }).pose.right.ry;
        const rb = b.step(1 / 60, input).pose.right.ry;
        last = ra - rb;
        maxStep = Math.max(maxStep, Math.abs(last - prev));
        prev = last;
      }
      expect(Math.abs(last), setup).toBeLessThan(1e-9);
      expect(maxStep, `${setup}: sem salto`).toBeLessThan(0.02);
    }
  });

  it("começar a girar com a lanterna recém-sacada não dá salto (entra suave)", () => {
    const a = mk();
    play(a, 0.8, { panel: true });
    let prev = 0;
    let maxStep = 0;
    for (let t = 0; t < 1.5; t += 1 / 60) {
      const ry = a.step(1 / 60, { ...STILL, yawRate: 2 }).pose.right.ry;
      if (t > 0) maxStep = Math.max(maxStep, Math.abs(ry - prev));
      prev = ry;
    }
    expect(maxStep).toBeLessThan(0.03);
  });

  it("movimento reduzido (e balanço desligado): nenhuma inércia", () => {
    const s = diff({ yawRate: 4 }, { reduced: true });
    expect(Math.max(...s.map((v) => Math.abs(v.ry) + Math.abs(v.x)))).toBe(0);
    expect(s.every((v) => v.inertia.yaw === 0)).toBe(true);
  });

  it("movimento reduzido ligado em execução: a inércia some suave e não volta", () => {
    const a = mk();
    const b = mk();
    for (let t = 0; t < 0.3; t += 1 / 60) a.step(1 / 60, { ...STILL, yawRate: 4 });
    for (let t = 0; t < 0.3; t += 1 / 60) b.step(1 / 60, STILL);
    expect(Math.abs(a.state().inertia.yaw)).toBeGreaterThan(0.03);
    a.setReduced(true);
    b.setReduced(true);
    let prev = a.state().inertia.yaw;
    for (let t = 0; t < 0.6; t += 1 / 60) {
      a.step(1 / 60, { ...STILL, yawRate: 4 });
      const v = a.state().inertia.yaw;
      expect(Math.abs(v - prev)).toBeLessThan(0.03);
      prev = v;
    }
    expect(Math.abs(prev)).toBe(0);
  });

  it("modo still (foto de referência): congela, com ou sem giro", () => {
    const s = diff({ yawRate: 4 }, { still: true });
    expect(Math.max(...s.map((v) => Math.abs(v.ry) + Math.abs(v.x) + Math.abs(v.y) + Math.abs(v.rx)))).toBe(0);
    expect(s.every((v) => v.inertia.yaw === 0 && v.inertia.pitch === 0)).toBe(true);
  });

  it("a mão esquerda acompanha, mais discreta; o balanço do passo continua somando por cima", () => {
    const a = mk();
    const b = mk();
    let maxL = 0;
    let maxR = 0;
    for (let t = 0; t < 0.6; t += 1 / 60) {
      const bob = t * 8.5;
      const input = { ...STILL, moving: true, bob };
      const pa = a.step(1 / 60, { ...input, yawRate: t < 0.15 ? 4 : 0 }).pose;
      const pb = b.step(1 / 60, input).pose;
      maxL = Math.max(maxL, Math.abs(pa.left.ry - pb.left.ry));
      maxR = Math.max(maxR, Math.abs(pa.right.ry - pb.right.ry));
    }
    expect(maxL).toBeGreaterThan(0.005);
    expect(maxL).toBeLessThan(maxR);
  });

  it("dt NaN/negativo não quebra a pose", () => {
    const a = mk();
    play(a, 0.2, { yawRate: 3 });
    for (const dt of [NaN, -1, 0]) {
      const out = a.step(dt, { ...STILL, yawRate: 3 });
      expect(Number.isFinite(out.pose.right.ry)).toBe(true);
    }
  });
});
