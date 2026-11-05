import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { InteractiveObject } from "../layers/types";
import { createPlayer } from "../player/controller";
import { DEFAULT_SETTINGS, type SaveV1 } from "../save/schema";
import { createInteraction, type InteractionUi } from "./interaction";
import type { PromptModel } from "./targeting";
import { cinzaWorld } from "./testWorld";

// A orquestração da T9 sobre a sala cinza de verdade (sem WebGL): mira de perto, aviso, brilho, segurar, ciclo e
// painel. O tempo anda só pelo `step`.

/** Save com as 3 pistas dadas e sem a chave: a porta pede segurar (forçar). */
const FORCE: Partial<SaveV1> = { puzzles: { cinza: { hints: 3 } } };

async function setup(opts: { coarse?: boolean; save?: Partial<SaveV1> } = {}) {
  const w = await cinzaWorld(opts.save);
  const player = createPlayer(w.engine, w.layer, DEFAULT_SETTINGS, { save: w.save.get, still: true });
  const prompts: (PromptModel | null)[] = [];
  const reticles: string[] = [];
  const notices: unknown[] = [];
  const ui: InteractionUi = {
    prompt: (p) => prompts.push(p),
    reticle: (s) => reticles.push(s),
    notice: (n) => notices.push(n),
  };
  const acted: string[] = [];
  const act = vi.fn((o: InteractiveObject) => void acted.push(o.id));
  const it = createInteraction({
    three: THREE,
    camera: w.camera,
    player,
    objects: w.layer.objects,
    save: w.save.get,
    act,
    ui,
    coarse: opts.coarse,
  });
  let t = 0;
  const step = (seconds: number) => {
    for (let s = 0; s < seconds - 1e-9; s += 0.05) {
      t += 0.05;
      player.update(0.05);
      it.update(0.05, t);
    }
  };
  const lastPrompt = () => prompts[prompts.length - 1] ?? null;
  const emissive = (id: string) => {
    const o = w.layer.objects.find((x) => x.id === id) as InteractiveObject;
    let max = 0;
    o.roots[0].traverse((n) => {
      const m = (n as THREE.Mesh).isMesh ? ((n as THREE.Mesh).material as THREE.MeshPhongMaterial) : null;
      if (m?.emissive) max = Math.max(max, m.emissive.r);
    });
    return max;
  };
  return { ...w, player, it, step, prompts, reticles, notices, acted, act, lastPrompt, emissive };
}

/** Do lugar da mesa, olhando para o ponto médio do objeto. */
function lookAtObject(w: Awaited<ReturnType<typeof setup>>, id: string) {
  const o = w.layer.objects.find((x) => x.id === id) as InteractiveObject;
  const c = new THREE.Box3().setFromObject(o.roots[0]).getCenter(new THREE.Vector3());
  w.player.lookAt(c.x, c.y, c.z, 0);
}

describe("interação · aviso só de perto", () => {
  it("da entrada, mirando a mesa a ~2,6 m, o aviso NÃO aparece e nada brilha", async () => {
    const w = await setup();
    w.player.placeAt("entrada");
    w.player.lookAt(-1.15, 0.76, -1.3, 0);
    w.step(1);
    expect(w.player.aimTarget).toEqual({ id: "mesa", inReach: false });
    expect(w.lastPrompt()).toBeNull();
    expect(w.prompts.every((p) => p === null)).toBe(true);
    expect(w.emissive("mesa")).toBe(0);
    expect(w.reticles[w.reticles.length - 1]).toBe("idle");
  });

  it("no lugar da mesa, mirando o bilhete, o aviso traz o verbo e o objeto brilha", async () => {
    const w = await setup();
    w.player.placeAt("mesa");
    lookAtObject(w, "bilhete");
    w.step(0.6);
    expect(w.player.aimedId).toBe("bilhete");
    expect(w.lastPrompt()).toEqual({ text: "ler o bilhete", key: "press", progress: null });
    expect(w.reticles[w.reticles.length - 1]).toBe("hot");
    expect(w.emissive("bilhete")).toBeGreaterThan(0);
    expect(w.emissive("caderno")).toBe(0);
  });

  it("desviar o olhar apaga o aviso e o brilho (depois da histerese)", async () => {
    const w = await setup();
    w.player.placeAt("mesa");
    lookAtObject(w, "bilhete");
    w.step(0.6);
    expect(w.emissive("bilhete")).toBeGreaterThan(0);
    w.player.apply({ type: "look", dx: 900, dy: 0 });
    w.step(0.5);
    expect(w.lastPrompt()).toBeNull();
    expect(w.emissive("bilhete")).toBe(0);
  });

  it("o brilho pulsa com o tempo e, com movimento reduzido, fica fixo", async () => {
    const w = await setup();
    w.player.placeAt("mesa");
    lookAtObject(w, "bilhete");
    w.step(0.6);
    const seen = new Set<number>();
    for (let i = 0; i < 12; i++) {
      w.step(0.05);
      seen.add(Math.round(w.emissive("bilhete") * 1e5));
    }
    expect(seen.size, "pulsa").toBeGreaterThan(3);

    const calm = await setup();
    Object.defineProperty(calm.player, "reduced", { get: () => true });
    calm.player.placeAt("mesa");
    lookAtObject(calm, "bilhete");
    calm.step(0.6);
    const fixed = new Set<number>();
    for (let i = 0; i < 12; i++) {
      calm.step(0.05);
      fixed.add(Math.round(calm.emissive("bilhete") * 1e5));
    }
    expect(fixed.size, "fixo").toBe(1);
    expect([...fixed][0]).toBeGreaterThan(0);
  });
});

describe("interação · E, Q e o ciclo", () => {
  it("E com alvo ao alcance age no objeto mirado", async () => {
    const w = await setup();
    w.player.placeAt("mesa");
    lookAtObject(w, "bilhete");
    w.step(0.6);
    w.it.press();
    w.it.release();
    expect(w.acted).toEqual(["bilhete"]);
  });

  it("E sem alvo ao alcance faz o ciclo (vira para o primeiro objeto do lugar) e não age", async () => {
    const w = await setup();
    w.player.placeAt("mesa");
    w.player.apply({ type: "look", dx: 900, dy: 0 });
    w.step(0.6);
    expect(w.player.aimedId).toBeNull();
    w.it.press();
    w.it.release();
    expect(w.acted).toEqual([]);
    w.step(1);
    expect(w.player.aimedId).toBe("mesa");
  });

  it("Q percorre os objetos do lugar na ordem da camada, dá a volta, e mira cada um", async () => {
    const w = await setup();
    w.player.placeAt("mesa");
    w.player.apply({ type: "look", dx: 900, dy: 0 });
    w.step(0.3);
    const order: (string | null)[] = [];
    for (let i = 0; i < 4; i++) {
      w.it.cycle();
      w.step(1);
      order.push(w.player.aimedId);
    }
    expect(order).toEqual(["mesa", "bilhete", "caderno", "mesa"]);
    expect(w.acted).toEqual([]);
  });

  it("em cada lugar da sala, o ciclo acerta o olhar em cada objeto dele (e ele fica ao alcance)", async () => {
    for (const place of ["mesa", "armario", "porta"]) {
      const w = await setup();
      const mine = w.layer.objects.filter((o) => o.place === place).map((o) => o.id);
      w.player.placeAt(place);
      w.player.apply({ type: "look", dx: -900, dy: 0 });
      w.step(0.3);
      const seen: (string | null)[] = [];
      for (let i = 0; i < mine.length; i++) {
        w.it.cycle();
        w.step(1);
        seen.push(w.player.aimedId);
      }
      expect(seen, place).toEqual(mine);
    }
  });

  it("o ciclo não inclui objeto de outro lugar nem o desabilitado nem o escondido", async () => {
    const w = await setup();
    w.player.placeAt("mesa");
    w.player.apply({ type: "look", dx: 900, dy: 0 });
    const caderno = w.layer.objects.find((o) => o.id === "caderno") as InteractiveObject;
    caderno.enabled = () => false;
    const note = w.layer.objects.find((o) => o.id === "bilhete") as InteractiveObject;
    note.roots[0].visible = false;
    const order: (string | null)[] = [];
    for (let i = 0; i < 3; i++) {
      w.it.cycle();
      w.step(1);
      order.push(w.player.aimedId);
    }
    expect(order).toEqual(["mesa", "mesa", "mesa"]);
  });

  it("onde não há nada (a entrada) o ciclo avisa e não vira", async () => {
    const w = await setup();
    w.player.placeAt("entrada");
    const yaw = w.camera.rotation.y;
    w.it.cycle();
    w.step(0.5);
    expect(w.notices).toEqual([{ kind: "nothing" }]);
    expect(w.camera.rotation.y).toBeCloseTo(yaw, 6);
  });

  it("encoberto: com o objeto de cima presente o de baixo não entra no ciclo", async () => {
    const w = await setup();
    const caderno = w.layer.objects.find((o) => o.id === "caderno") as InteractiveObject;
    caderno.hiddenBy = "bilhete";
    w.player.placeAt("mesa");
    w.player.apply({ type: "look", dx: 900, dy: 0 });
    const order: (string | null)[] = [];
    for (let i = 0; i < 3; i++) {
      w.it.cycle();
      w.step(1);
      order.push(w.player.aimedId);
    }
    expect(order).toEqual(["mesa", "bilhete", "mesa"]);
  });
});

describe("interação · segurar", () => {
  async function atDoor() {
    const w = await setup({ save: FORCE });
    w.player.placeAt("porta");
    lookAtObject(w, "porta");
    w.step(0.6);
    expect(w.player.aimedId).toBe("porta");
    return w;
  }

  it("o aviso do objeto de segurar traz o verbo do hold, a tecla 'hold' e o anel", async () => {
    const w = await atDoor();
    expect(w.lastPrompt()).toEqual({ text: "forçar a porta", key: "hold", progress: 0 });
  });

  it("segurar o tempo todo age UMA vez e o anel sobe até lá", async () => {
    const w = await atDoor();
    w.it.press();
    w.step(0.7);
    const mid = w.lastPrompt();
    expect(mid?.key).toBe("hold");
    expect(mid?.progress).toBeGreaterThan(0.3);
    expect(mid?.progress).toBeLessThan(0.7);
    expect(w.acted).toEqual([]);
    w.step(1);
    expect(w.acted).toEqual(["porta"]);
    w.step(1);
    expect(w.acted).toEqual(["porta"]);
    w.it.release();
    expect(w.acted).toEqual(["porta"]);
  });

  it("soltar antes de 0,22 s avisa 'segure' com o verbo e não age", async () => {
    const w = await atDoor();
    w.it.press();
    w.step(0.1);
    w.it.release();
    expect(w.notices).toEqual([{ kind: "hold", verb: "forçar a porta" }]);
    w.step(3);
    expect(w.acted).toEqual([]);
  });

  it("soltar no meio (depois de 0,22 s) não avisa e o anel recua até sumir", async () => {
    const w = await atDoor();
    w.it.press();
    w.step(0.6);
    w.it.release();
    expect(w.notices).toEqual([]);
    w.step(1.5);
    expect(w.acted).toEqual([]);
    expect(w.lastPrompt()?.progress).toBe(0);
  });

  it("perder o alvo no meio do segurar cancela (olhar para outro lado)", async () => {
    const w = await atDoor();
    w.it.press();
    w.step(0.5);
    w.player.apply({ type: "look", dx: 1400, dy: 0 });
    w.step(1.5);
    w.player.apply({ type: "look", dx: -1400, dy: 0 });
    w.step(1.5);
    expect(w.acted).toEqual([]);
  });

  it("abrir um painel no meio do segurar cancela e esconde o aviso", async () => {
    const w = await atDoor();
    w.it.press();
    w.step(0.4);
    w.it.setPanel(true);
    w.player.setPanel(true);
    w.step(2);
    expect(w.acted).toEqual([]);
    expect(w.lastPrompt()).toBeNull();
    expect(w.reticles[w.reticles.length - 1]).toBe("off");
  });
});

describe("interação · hold dependente do estado", () => {
  it("sem hold no estado atual, E age na hora; com hold, E segura (e o aviso acompanha)", async () => {
    const w = await setup();
    const porta = w.layer.objects.find((o) => o.id === "porta") as InteractiveObject;
    let forcing = false;
    porta.hold = () => (forcing ? { seconds: 1.4, verb: "forçar a porta" } : undefined);
    w.player.placeAt("porta");
    lookAtObject(w, "porta");
    w.step(0.6);
    expect(w.lastPrompt()).toEqual({ text: "abrir a porta", key: "press", progress: null });
    w.it.press();
    w.it.release();
    expect(w.acted).toEqual(["porta"]);
    expect(w.it.state().holdId).toBeNull();
    // agora a porta passa a pedir segurar
    forcing = true;
    w.step(0.2);
    expect(w.lastPrompt()).toEqual({ text: "forçar a porta", key: "hold", progress: 0 });
    w.it.press();
    expect(w.it.state().holdId).toBe("porta");
    w.it.release();
    expect(w.notices).toEqual([{ kind: "hold", verb: "forçar a porta" }]);
    expect(w.acted).toEqual(["porta"]);
  });

  it("o toque rápido (activate) age quando não há hold e dá a dica quando há", async () => {
    const w = await setup();
    const porta = w.layer.objects.find((o) => o.id === "porta") as InteractiveObject;
    let forcing = false;
    porta.hold = () => (forcing ? { seconds: 1, verb: "forçar" } : undefined);
    w.it.activate(porta);
    expect(w.acted).toEqual(["porta"]);
    forcing = true;
    w.it.activate(porta);
    expect(w.acted).toEqual(["porta"]);
    expect(w.notices).toEqual([{ kind: "hold", verb: "forçar" }]);
  });

  it("o segurar em curso mantém a duração de quando começou (o estado mudar no meio não o troca)", async () => {
    const w = await setup();
    const porta = w.layer.objects.find((o) => o.id === "porta") as InteractiveObject;
    let seconds = 1.4;
    porta.hold = () => ({ seconds, verb: "forçar a porta" });
    w.player.placeAt("porta");
    lookAtObject(w, "porta");
    w.step(0.6);
    w.it.press();
    seconds = 100;
    w.step(2.5);
    expect(w.acted).toEqual(["porta"]);
  });
});

describe("interação · painel, toque e fim", () => {
  it("com painel aberto não há aviso nem brilho; ao fechar tudo volta", async () => {
    const w = await setup();
    w.player.placeAt("mesa");
    lookAtObject(w, "bilhete");
    w.step(0.6);
    expect(w.lastPrompt()).not.toBeNull();
    w.it.setPanel(true);
    w.player.setPanel(true);
    w.step(0.2);
    expect(w.lastPrompt()).toBeNull();
    expect(w.emissive("bilhete")).toBe(0);
    w.it.press();
    expect(w.acted, "E com painel aberto não age nem cicla").toEqual([]);
    w.it.setPanel(false);
    w.player.setPanel(false);
    w.step(0.8);
    expect(w.lastPrompt()?.text).toBe("ler o bilhete");
  });

  it("tocar num objeto comum age; num de segurar mostra a dica em vez de agir", async () => {
    const w = await setup({ save: FORCE });
    const bilhete = w.layer.objects.find((o) => o.id === "bilhete") as InteractiveObject;
    const porta = w.layer.objects.find((o) => o.id === "porta") as InteractiveObject;
    w.it.activate(bilhete);
    expect(w.acted).toEqual(["bilhete"]);
    w.it.activate(porta);
    expect(w.acted).toEqual(["bilhete"]);
    expect(w.notices).toEqual([{ kind: "hold", verb: "forçar a porta" }]);
  });

  it("no toque (coarse) não há mira nem aviso de passagem, só o do segurar em curso", async () => {
    const w = await setup({ coarse: true });
    w.player.placeAt("mesa");
    lookAtObject(w, "bilhete");
    w.step(0.8);
    expect(w.lastPrompt()).toBeNull();
    expect(w.reticles.every((r) => r === "off")).toBe(true);
    expect(w.emissive("bilhete")).toBe(0);
  });

  it("dispose devolve o brilho e silencia", async () => {
    const w = await setup();
    w.player.placeAt("mesa");
    lookAtObject(w, "bilhete");
    w.step(0.6);
    w.it.dispose();
    expect(w.emissive("bilhete")).toBe(0);
    const n = w.prompts.length;
    w.step(0.3);
    w.it.press();
    expect(w.prompts.length).toBe(n);
    expect(w.acted).toEqual([]);
  });

  it("o estado de depuração reflete alvo, segurar e brilho", async () => {
    const w = await setup();
    w.player.placeAt("mesa");
    lookAtObject(w, "bilhete");
    w.step(0.6);
    expect(w.it.state()).toMatchObject({ aimedId: "bilhete", glow: "bilhete", holdId: null, panel: false });
  });
});

describe("interação · segurar por toque (T12)", () => {
  async function touchDoor() {
    const w = await setup({ coarse: true, save: FORCE });
    w.player.placeAt("porta");
    const porta = w.layer.objects.find((o) => o.id === "porta") as InteractiveObject;
    return { ...w, porta };
  }

  it("dedo parado na porta: o anel sobe (aviso no dedo, sem mira) e completa UMA vez, sem depender do centro da tela", async () => {
    const w = await touchDoor();
    // olhando para o outro lado: no toque o alvo é o que está sob o dedo, não o centro da tela
    w.player.apply({ type: "look", dx: 1400, dy: 0 });
    w.step(0.2);
    expect(w.it.touchHold(w.porta, { x: 120, y: 340 })).toBe(true);
    w.step(0.7);
    const mid = w.lastPrompt();
    expect(mid).toMatchObject({ text: "forçar a porta", key: "hold", at: { x: 120, y: 340 } });
    expect(mid?.progress).toBeGreaterThan(0.3);
    expect(w.acted).toEqual([]);
    w.step(1);
    expect(w.acted).toEqual(["porta"]);
    w.it.release();
    w.step(1);
    expect(w.acted).toEqual(["porta"]);
    expect(w.lastPrompt()).toBeNull();
  });

  it("soltar cedo (antes de 0,22 s) dá a dica e não age; no meio, não age e o anel recua", async () => {
    const w = await touchDoor();
    w.it.touchHold(w.porta, { x: 0, y: 0 });
    w.step(0.1);
    w.it.release();
    expect(w.notices).toEqual([{ kind: "hold", verb: "forçar a porta" }]);
    w.it.touchHold(w.porta, { x: 0, y: 0 });
    w.step(0.8);
    w.it.release();
    w.step(2);
    expect(w.acted).toEqual([]);
    expect(w.lastPrompt()).toBeNull();
  });

  it("cancelar (o dedo saiu do alvo) zera sem dica e sem agir", async () => {
    const w = await touchDoor();
    w.it.touchHold(w.porta, { x: 0, y: 0 });
    w.step(1);
    w.it.cancelHold();
    w.step(2);
    expect(w.acted).toEqual([]);
    expect(w.notices).toEqual([]);
    expect(w.it.state().holdId).toBeNull();
  });

  it("objeto que agora não é de segurar (sem a 3ª pista) não começa: o toque age normal", async () => {
    const w = await setup({ coarse: true });
    const porta = w.layer.objects.find((o) => o.id === "porta") as InteractiveObject;
    expect(w.it.touchHold(porta, { x: 0, y: 0 })).toBe(false);
    expect(w.it.state().holdId).toBeNull();
  });

  it("painel aberto: não começa; abrir no meio cancela", async () => {
    const w = await touchDoor();
    w.it.setPanel(true);
    expect(w.it.touchHold(w.porta, { x: 0, y: 0 })).toBe(false);
    w.it.setPanel(false);
    w.it.touchHold(w.porta, { x: 0, y: 0 });
    w.step(0.5);
    w.it.setPanel(true);
    w.step(2);
    expect(w.acted).toEqual([]);
  });
});
