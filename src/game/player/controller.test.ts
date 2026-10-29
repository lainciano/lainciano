import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { cinzaLayer } from "../layers/cinza";
import type { LayerInstance, Own } from "../layers/types";
import type { MaterialKit } from "../render/materials";
import type { Engine } from "../runtime/engine";
import { DEFAULT_SETTINGS, initialSave } from "../save/schema";
import { createPlayer, PLAYER } from "./controller";
import { silentAudio } from "../audio/types";

// Controlador sobre um engine falso (objetos three de verdade, sem WebGL) e a sala cinza carregada com um kit
// falso (sem canvas). O tempo anda só pelo `update(dt)` do teste.

function fakeKit(): MaterialKit {
  return {
    phong: (o) => new THREE.MeshPhongMaterial(o),
    basic: (o) => new THREE.MeshBasicMaterial(o),
    texture: () => new THREE.CanvasTexture(undefined as unknown as HTMLCanvasElement),
    dispose: () => {},
  };
}

async function world() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1.6, 0.02, 60);
  camera.rotation.order = "YXZ";
  scene.add(camera);
  const kit = fakeKit();
  const fades: number[] = [];
  const engine = { three: THREE, scene, camera, kit, setFade: (v: number) => fades.push(v) } as unknown as Engine;
  const own = Object.assign(<T,>(r: T) => r, { add() {} }) as unknown as Own;
  const save = { get: () => initialSave(0), patch() {}, reset() {}, wipeGame() {} };
  const layer: LayerInstance = await cinzaLayer.load(
    { three: THREE, scene, camera, kit, audio: silentAudio, say() {}, save },
    new AbortController().signal,
    own,
  );
  // a sala na cena (o raycast da mira usa as matrizes do mundo)
  layer.enter(save.get());
  scene.updateMatrixWorld(true);
  return { engine, layer, camera, save };
}

/** Anda `seconds` em passos de 50 ms (o teto de dt do relógio). */
function run(player: { update(dt: number): void }, seconds: number) {
  for (let t = 0; t < seconds - 1e-9; t += 0.05) player.update(0.05);
}

describe("controlador · velocidade", () => {
  it("anda 1,4 m/s e corre 2,6 m/s", async () => {
    const { engine, layer } = await world();
    const p = createPlayer(engine, layer, DEFAULT_SETTINGS);
    p.placeAt("entrada");
    const a = p.position;
    p.apply({ type: "move", x: 0, z: -1 });
    run(p, 0.5);
    const b = p.position;
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeCloseTo(PLAYER.walk * 0.5, 2);
    p.apply({ type: "run", on: true });
    run(p, 0.5);
    const c = p.position;
    expect(Math.hypot(c.x - b.x, c.z - b.z)).toBeCloseTo(PLAYER.run * 0.5, 2);
    p.dispose();
  });

  it("soltar o agachar com Shift ainda segurado volta a correr sem reapertar", async () => {
    const { engine, layer } = await world();
    const p = createPlayer(engine, layer, DEFAULT_SETTINGS);
    p.placeAt("entrada");
    p.apply({ type: "run", on: true });
    p.apply({ type: "crouch", on: true });
    p.apply({ type: "move", x: 0, z: -1 });
    const a = p.position;
    run(p, 0.25);
    const b = p.position;
    expect(Math.hypot(b.x - a.x, b.z - a.z), "agachado anda devagar").toBeCloseTo(PLAYER.crouchSpeed * 0.25, 2);
    p.apply({ type: "crouch", on: false });
    run(p, 0.25);
    const c = p.position;
    expect(Math.hypot(c.x - b.x, c.z - b.z), "de pé com Shift: corre").toBeCloseTo(PLAYER.run * 0.25, 2);
    p.dispose();
  });
});

describe("controlador · passos (T13)", () => {
  /** Mundo com um áudio que só conta os passos (e o peso e a superfície de cada um). */
  async function stepping() {
    const w = await world();
    const steps: { surface: string; scale?: number }[] = [];
    const audio = { ...silentAudio, step: (surface: string, scale?: number) => steps.push({ surface, scale }) };
    const p = createPlayer(w.engine, w.layer, DEFAULT_SETTINGS, { audio: audio as typeof silentAudio });
    p.placeAt("entrada");
    return { p, steps };
  }

  it("parado não há passo; andando, um a cada ~0,55 s (a passada), pela distância e não pelo balanço", async () => {
    const { p, steps } = await stepping();
    run(p, 2);
    expect(steps).toHaveLength(0);
    p.apply({ type: "move", x: 0, z: -1 });
    run(p, 2.2); // 3,08 m a 1,4 m/s
    // o 1º vem depois de meia passada (0,385 m): 0,385 + n·0,77 ≤ 3,08 → 4 passos
    expect(steps.length).toBe(4);
    p.dispose();
  });

  it("correr dá mais passos por segundo que andar, e agachado, menos", async () => {
    const walk = await stepping();
    walk.p.apply({ type: "move", x: 0, z: -1 });
    run(walk.p, 1.5);
    const run_ = await stepping();
    run_.p.apply({ type: "run", on: true });
    run_.p.apply({ type: "move", x: 0, z: -1 });
    run(run_.p, 1.5);
    const crouch = await stepping();
    crouch.p.apply({ type: "crouch", on: true });
    crouch.p.apply({ type: "move", x: 0, z: -1 });
    run(crouch.p, 1.5);
    expect(run_.steps.length).toBeGreaterThan(walk.steps.length);
    expect(crouch.steps.length).toBeLessThan(walk.steps.length);
    expect(run_.steps[0].scale).toBeGreaterThan(1);
    expect(crouch.steps[0].scale).toBeLessThan(1);
    for (const x of [walk, run_, crouch]) x.p.dispose();
  });

  it("encostado na parede (sem sair do lugar) não faz passos", async () => {
    const { p, steps } = await stepping();
    p.apply({ type: "move", x: 0, z: 1 }); // empurra para trás até a parede segurar
    run(p, 12);
    const at = steps.length;
    run(p, 3);
    expect(steps.length).toBe(at);
    p.dispose();
  });

  it("a viagem de lugar a lugar também faz passos, sobre a superfície sob os pés", async () => {
    const { p, steps } = await stepping();
    void p.goTo("mesa");
    run(p, 6);
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.every((s) => ["granilite", "tapete"].includes(s.surface))).toBe(true);
    p.dispose();
  });
});

describe("controlador · lugares", () => {
  it("em viagem o lugar é null; ao chegar, é o destino e a promessa resolve true", async () => {
    const { engine, layer } = await world();
    const p = createPlayer(engine, layer, DEFAULT_SETTINGS);
    p.placeAt("entrada");
    expect(p.place).toBe("entrada");
    const arrived = p.goTo("mesa");
    p.update(0.05);
    expect(p.place).toBeNull();
    run(p, 6);
    await expect(arrived).resolves.toBe(true);
    expect(p.place).toBe("mesa");
    p.dispose();
  });

  it("mexer-se cancela a viagem (resolve false)", async () => {
    const { engine, layer } = await world();
    const p = createPlayer(engine, layer, DEFAULT_SETTINGS);
    p.placeAt("entrada");
    const trip = p.goTo("porta");
    run(p, 0.3);
    p.apply({ type: "move", x: 1, z: 0 });
    await expect(trip).resolves.toBe(false);
    p.dispose();
  });
});

describe("controlador · foto de referência", () => {
  it("parado em `still`, a câmera não respira nem balança, mesmo com o relógio andando", async () => {
    const { engine, layer, camera } = await world();
    const p = createPlayer(engine, layer, DEFAULT_SETTINGS, { still: true });
    p.placeAt("entrada");
    const first = camera.position.clone();
    const rot = camera.rotation.clone();
    for (let i = 0; i < 40; i++) p.update(0.05);
    expect(camera.position.toArray()).toEqual(first.toArray());
    expect(camera.rotation.toArray()).toEqual(rot.toArray());
    p.dispose();
  });

  it("sem `still`, a respiração mexe a câmera (o teste acima não passaria por acaso)", async () => {
    const { engine, layer, camera } = await world();
    const p = createPlayer(engine, layer, DEFAULT_SETTINGS);
    p.placeAt("entrada");
    const first = camera.position.y;
    for (let i = 0; i < 20; i++) p.update(0.05);
    expect(camera.position.y).not.toBe(first);
    p.dispose();
  });
});

describe("controlador · mira e ajustes (rodada 4)", () => {
  /** Da mesa, olhando para o tampo (pitch −0,8). */
  async function atTable() {
    const w = await world();
    const p = createPlayer(w.engine, w.layer, DEFAULT_SETTINGS, { save: w.save.get });
    p.placeAt("mesa");
    p.apply({ type: "look", dx: 0, dy: (0.8 - 0.42) / 0.0022 });
    return { ...w, p };
  }

  it("mirando um objeto habilitado ao alcance, a mão levanta depois das leituras da histerese; abrir painel baixa", async () => {
    const { p } = await atTable();
    p.update(0.05);
    expect(p.aiming).toBe(false);
    run(p, 0.5);
    expect(p.aiming).toBe(true);
    p.setPanel(true);
    expect(p.aiming).toBe(false);
    run(p, 0.5);
    expect(p.aiming).toBe(false);
    p.dispose();
  });

  it("objeto desabilitado no estado atual não conta como alvo", async () => {
    const { p, layer } = await atTable();
    for (const o of layer.objects) o.enabled = () => false;
    run(p, 0.6);
    expect(p.aiming).toBe(false);
    p.dispose();
  });

  it("desligar o balanço nos ajustes vale na hora para as mãos (movimento reduzido)", async () => {
    const { engine, layer } = await world();
    const p = createPlayer(engine, layer, DEFAULT_SETTINGS);
    expect(p.hands.state().reduced).toBe(false);
    p.updateSettings({ ...DEFAULT_SETTINGS, bob: false });
    expect(p.hands.state().reduced).toBe(true);
    p.updateSettings({ ...DEFAULT_SETTINGS, bob: true });
    expect(p.hands.state().reduced).toBe(false);
    p.dispose();
  });
});

describe("controlador · alvo (T9)", () => {
  it("expõe o id do alvo ao alcance; de longe (a mesa vista da entrada) há acerto mas não há alvo", async () => {
    const { engine, layer, camera } = await world();
    const near = createPlayer(engine, layer, DEFAULT_SETTINGS, { save: () => initialSave(0) });
    near.placeAt("mesa");
    near.apply({ type: "look", dx: 0, dy: (0.8 - 0.42) / 0.0022 });
    run(near, 0.5);
    expect(near.aimedId).not.toBeNull();
    expect(["mesa", "bilhete", "caderno"]).toContain(near.aimedId);
    near.dispose();

    // da entrada, olhando para a mesa (2,5 m): o raio acerta a mesa, mas fora do alcance
    const far = createPlayer(engine, layer, DEFAULT_SETTINGS, { save: () => initialSave(0) });
    far.placeAt("entrada");
    far.lookAt(-1.15, 0.74, -1.3, 0);
    run(far, 1);
    expect(far.aimTarget).toEqual({ id: "mesa", inReach: false });
    expect(far.aimedId).toBeNull();
    expect(far.aiming).toBe(false);
    expect(camera.position.distanceTo(new THREE.Vector3(-1.15, 0.74, -1.3))).toBeGreaterThan(2.4);
    far.dispose();
  });

  it("objeto escondido ou encoberto não é acertado", async () => {
    const { engine, layer } = await world();
    const p = createPlayer(engine, layer, DEFAULT_SETTINGS, { save: () => initialSave(0) });
    p.placeAt("mesa");
    p.lookAt(-1.15, 0.8, -1.3, 0);
    run(p, 0.6);
    const seen = p.aimedId;
    expect(seen).not.toBeNull();
    for (const o of layer.objects) for (const r of o.roots) r.visible = false;
    run(p, 0.6);
    expect(p.aimedId).toBeNull();
    p.dispose();
  });

  it("lookAt vira o olhar em ~0,35 s até o ponto (e na hora com duração 0)", async () => {
    const { engine, layer, camera } = await world();
    const p = createPlayer(engine, layer, DEFAULT_SETTINGS, { still: true });
    p.placeAt("entrada");
    const target = new THREE.Vector3(1.6, 1.2, 0.2);
    const dir = () => {
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      return f.dot(target.clone().sub(camera.position).normalize());
    };
    const before = dir();
    p.lookAt(target.x, target.y, target.z);
    p.update(0.05);
    const mid = dir();
    expect(mid).toBeGreaterThan(before);
    run(p, 0.5);
    expect(dir()).toBeGreaterThan(0.999);
    // duração 0: instantâneo
    p.placeAt("entrada");
    p.lookAt(target.x, target.y, target.z, 0);
    p.update(0.001);
    expect(dir()).toBeGreaterThan(0.999);
    p.dispose();
  });

  it("mexer o mouse durante a virada assume o olhar (a virada cede)", async () => {
    const { engine, layer, camera } = await world();
    const p = createPlayer(engine, layer, DEFAULT_SETTINGS, { still: true });
    p.placeAt("entrada");
    p.lookAt(1.6, 1.2, 0.2);
    p.update(0.05);
    p.apply({ type: "look", dx: 200, dy: 0 });
    p.update(0.001);
    const yawAfterInput = camera.rotation.y;
    run(p, 0.5);
    expect(camera.rotation.y).toBeCloseTo(yawAfterInput, 3);
    p.dispose();
  });

  it("expõe movimento reduzido da preferência do sistema", async () => {
    const { engine, layer } = await world();
    const mq = Object.assign(new EventTarget(), { matches: true });
    const g = globalThis as unknown as { window?: unknown };
    const had = "window" in g;
    const prev = g.window;
    g.window = { matchMedia: () => mq };
    try {
      const p = createPlayer(engine, layer, DEFAULT_SETTINGS);
      expect(p.reduced).toBe(true);
      mq.dispatchEvent(Object.assign(new Event("change"), { matches: false }));
      expect(p.reduced).toBe(false);
      p.dispose();
    } finally {
      if (had) g.window = prev;
      else delete g.window;
    }
  });
});

describe("controlador · preferência do sistema (rodada 5)", () => {
  it("mudar prefers-reduced-motion com o jogo aberto chega às mãos (e o ouvinte sai no dispose)", async () => {
    const { engine, layer } = await world();
    const mq = Object.assign(new EventTarget(), { matches: false });
    const g = globalThis as unknown as { window?: unknown };
    const had = "window" in g;
    const prev = g.window;
    g.window = { matchMedia: () => mq };
    try {
      const p = createPlayer(engine, layer, DEFAULT_SETTINGS);
      expect(p.hands.state().reduced).toBe(false);
      mq.matches = true;
      mq.dispatchEvent(Object.assign(new Event("change"), { matches: true }));
      expect(p.hands.state().reduced).toBe(true);
      mq.dispatchEvent(Object.assign(new Event("change"), { matches: false }));
      expect(p.hands.state().reduced).toBe(false);
      p.dispose();
      // depois do dispose o ouvinte não age mais
      mq.dispatchEvent(Object.assign(new Event("change"), { matches: true }));
      expect(p.hands.state().reduced).toBe(false);
    } finally {
      if (had) g.window = prev;
      else delete g.window;
    }
  });
});
