import * as THREE from "three";
import { cinzaLayer } from "../layers/cinza";
import type { LayerInstance, Own } from "../layers/types";
import type { MaterialKit } from "../render/materials";
import { createPsxUniforms } from "../render/psx";
import type { Engine } from "../runtime/engine";
import { mergeSavePatch } from "../save/merge";
import { initialSave, type SaveV1 } from "../save/schema";
import { silentAudio } from "../audio/types";

/**
 * Só para os testes: um engine falso (objetos three de verdade, sem WebGL), um kit sem canvas e a sala cinza
 * carregada e na cena. O tempo anda só pelo que o teste chamar.
 */
export function fakeKit(): MaterialKit {
  return {
    phong: (o) => new THREE.MeshPhongMaterial(o),
    basic: (o) => new THREE.MeshBasicMaterial(o),
    texture: () => new THREE.CanvasTexture(undefined as unknown as HTMLCanvasElement),
    dispose: () => {},
  };
}

/** `initial` sobrescreve campos do save inicial (ex.: `puzzles.cinza` com as pistas dadas). */
export async function cinzaWorld(initial: Partial<SaveV1> = {}) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1.6, 0.02, 60);
  camera.rotation.order = "YXZ";
  scene.add(camera);
  const kit = fakeKit();
  const psx = createPsxUniforms(THREE);
  const engine = { three: THREE, scene, camera, kit, psx, setFade: () => {} } as unknown as Engine;
  const own = Object.assign(<T,>(r: T) => r, { add() {} }) as unknown as Own;
  let state: SaveV1 = { ...initialSave(0), ...initial };
  const said: string[] = [];
  const save = {
    get: () => state,
    patch(p: Partial<SaveV1>) {
      state = mergeSavePatch(state, p);
    },
    reset() {},
    wipeGame() {},
  };
  const layer: LayerInstance = await cinzaLayer.load(
    { three: THREE, scene, camera, kit, audio: silentAudio, say: (l) => said.push(l.text), save },
    new AbortController().signal,
    own,
  );
  layer.enter(save.get());
  scene.updateMatrixWorld(true);
  return { engine, layer, scene, camera, save, said };
}

/** Anda `seconds` em passos de 50 ms (o teto de dt do relógio). */
export function run(target: { update(dt: number): void }, seconds: number) {
  for (let t = 0; t < seconds - 1e-9; t += 0.05) target.update(0.05);
}
