import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { cinzaLayer } from "../layers/cinza";
import type { LayerInstance, Own } from "../layers/types";
import type { MaterialKit } from "../render/materials";
import type { Engine } from "../runtime/engine";
import { DEFAULT_SETTINGS, initialSave } from "../save/schema";
import { createPlayer, PLAYER } from "./controller";

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
    { three: THREE, scene, camera, kit, audio: { step() {}, object() {}, room() {}, suspend() {}, resume() {} }, say() {}, save },
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
