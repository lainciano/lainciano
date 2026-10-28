import type * as THREE from "three";
import type { InteractiveObject } from "../layers/types";
import type { SaveV1 } from "../save/schema";
import type { Vec2 } from "../world/collision";
import { inReach } from "../world/reach";

/**
 * Mira e ciclo de alvos (contrato §3, bíblia 12b.3). Aviso de interação SÓ de perto: 1,45 m no chão e 2,4 m em
 * 3D até o ponto mirado (`world/reach.ts`); nunca "ir até" à distância. Sem alvo ao alcance, `E` e `Q` passam
 * pelos objetos habilitados, visíveis e não encobertos do lugar atual (`cycleOrder`). Quase tudo é lógica pura;
 * só `rayHit` e `objectCenter` tocam o three (instância recebida, nenhum import em tempo de execução).
 */

/** Primeiro objeto interativo acertado pelo raio do centro da tela e onde (ponto do acerto, distância 3D). */
export type Hit = { id: string; x: number; z: number; distance: number };
export type Target = { id: string; inReach: boolean };

/** Há um alvo e ele cabe no alcance? Acerto longe devolve o alvo com `inReach: false` (a mão não sobe, sem aviso). */
export function pickTarget(hit: Hit | null, player: Vec2): Target | null {
  if (!hit) return null;
  return { id: hit.id, inReach: inReach(player, hit) };
}

/** Texto e tecla do aviso; `progress` é o anel de segurar (null = sem anel). */
export type PromptModel = { text: string; key: "press" | "hold"; progress: number | null };

/**
 * O que o `Prompt` recebe. Só com o alvo ao alcance: fora disso, nada (null), nunca um aviso de "ir até".
 * `holdProgress` é o anel em curso; `holding` diz que o gesto está sendo feito.
 */
export function promptFor(
  target: Target | null,
  object: InteractiveObject | undefined,
  state: SaveV1,
  holdProgress: number,
  holding: boolean,
): PromptModel | null {
  if (!target || !target.inReach || !object) return null;
  if (object.hold) return { text: object.hold.verb, key: "hold", progress: holding || holdProgress > 0 ? holdProgress : 0 };
  return { text: object.verb(state), key: "press", progress: null };
}

/** Objeto visível: ao menos um `root` com toda a cadeia de pais visível. */
export function objectVisible(o: InteractiveObject): boolean {
  return o.roots.some((root) => {
    for (let n: THREE.Object3D | null = root; n; n = n.parent) if (!n.visible) return false;
    return true;
  });
}

/** Encoberto por outro objeto que está lá (habilitado e visível): a carta sob o celular. */
export function isCovered(o: InteractiveObject, objects: readonly InteractiveObject[], state: SaveV1, visible: (o: InteractiveObject) => boolean): boolean {
  if (!o.hiddenBy) return false;
  const cover = objects.find((x) => x.id === o.hiddenBy);
  return !!cover && cover.enabled(state) && visible(cover);
}

/**
 * Ids que o ciclo percorre: os do lugar atual, habilitados, visíveis e NÃO encobertos, na ordem da camada. Sem
 * lugar (em viagem ou longe de qualquer parada) não há ciclo.
 */
export function cycleOrder(
  objects: readonly InteractiveObject[],
  place: string | null,
  state: SaveV1,
  visible: (o: InteractiveObject) => boolean,
): string[] {
  if (place === null) return [];
  const out: string[] = [];
  for (const o of objects) {
    if (o.place !== place || !o.enabled(state) || !visible(o) || isCovered(o, objects, state, visible)) continue;
    out.push(o.id);
  }
  return out;
}

/** O próximo da ordem depois de `from` (dá a volta); origem fora da lista começa pelo primeiro. */
export function nextInCycle(order: readonly string[], from: string | null): string | null {
  if (order.length === 0) return null;
  const i = from === null ? -1 : order.indexOf(from);
  return order[(i + 1) % order.length];
}

/**
 * Raio do centro da tela contra os objetos interativos habilitados, visíveis e não encobertos; devolve o mais
 * perto. `raycaster.setFromCamera` é feito aqui (o chamador reaproveita raycaster e vetor, sem alocar por leitura).
 */
export function rayHit(
  raycaster: THREE.Raycaster,
  camera: THREE.Camera,
  center: THREE.Vector2,
  objects: readonly InteractiveObject[],
  state: SaveV1 | undefined,
): Hit | null {
  raycaster.setFromCamera(center, camera);
  let best: THREE.Intersection | null = null;
  let bestId: string | null = null;
  for (const o of objects) {
    if (state && (!o.enabled(state) || isCovered(o, objects, state, objectVisible))) continue;
    if (!objectVisible(o)) continue;
    const hits = raycaster.intersectObjects(o.roots, true);
    if (hits[0] && (!best || hits[0].distance < best.distance)) {
      best = hits[0];
      bestId = o.id;
    }
  }
  return best && bestId ? { id: bestId, x: best.point.x, z: best.point.z, distance: best.distance } : null;
}

/**
 * Para onde o ciclo vira o olhar: um ponto da superfície do objeto que o raio do centro da tela acerta DE FATO
 * (o centro da caixa de uma mesa fica dentro do tampo, o de um móvel oco, entre as peças). Testa o centro, o topo
 * e um ponto a 3/4 da altura, a partir do olho, e fica com o primeiro cujo raio chega ao próprio objeto antes de
 * qualquer outro; se nenhum chegar, o centro da caixa.
 */
export function aimPoint(
  three: typeof THREE,
  raycaster: THREE.Raycaster,
  eye: THREE.Vector3,
  objects: readonly InteractiveObject[],
  target: InteractiveObject,
  state: SaveV1 | undefined,
  out = new three.Vector3(),
): THREE.Vector3 {
  const box = new three.Box3();
  for (const root of target.roots) {
    root.updateWorldMatrix(true, true);
    box.expandByObject(root);
  }
  const c = box.getCenter(new three.Vector3());
  const candidates = [c, new three.Vector3(c.x, box.max.y - 0.005, c.z), new three.Vector3(c.x, box.min.y + (box.max.y - box.min.y) * 0.75, c.z)];
  const dir = new three.Vector3();
  for (const cand of candidates) {
    dir.subVectors(cand, eye);
    if (dir.lengthSq() < 1e-8) continue;
    raycaster.set(eye, dir.normalize());
    let best: THREE.Intersection | null = null;
    let bestId: string | null = null;
    for (const o of objects) {
      if (state && (!o.enabled(state) || isCovered(o, objects, state, objectVisible))) continue;
      if (!objectVisible(o)) continue;
      const hit = raycaster.intersectObjects(o.roots, true)[0];
      if (hit && (!best || hit.distance < best.distance)) {
        best = hit;
        bestId = o.id;
      }
    }
    if (best && bestId === target.id) return out.copy(best.point);
  }
  return out.copy(c);
}
