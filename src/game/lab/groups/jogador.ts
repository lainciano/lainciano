import type * as THREE from "three";
import { createHands } from "../../player/hands";
import { createPhoneModel } from "../../player/phone";
import type { LabBuild, LabId } from "../registry";

const phone = (open: number): LabBuild => (m) => {
  const model = createPhoneModel(m.T, m.kit);
  model.setLid(open);
  model.root.userData.labDispose = () => model.dispose();
  return model.root;
};

/** As duas mãos no ar, com a lanterna na direita: sem a câmera e sem o corpo de sombra (que só projeta). */
const hands: LabBuild = (m) => {
  const { T } = m;
  const camera = new T.PerspectiveCamera();
  const scene = new T.Scene();
  const rig = createHands(T, m.kit, camera, scene, { seed: 1, reduced: true, still: true, flashOn: false });
  rig.debug.setPaused(true);
  rig.debug.step(1, {});
  const root = new T.Group();
  root.name = "maos";
  for (const child of [...camera.children] as THREE.Object3D[]) root.add(child);
  root.userData.labDispose = () => rig.dispose();
  return root;
};

export const builders: Partial<Record<LabId, LabBuild>> = {
  maos: hands,
  "celular-fechado": phone(0),
  "celular-aberto": phone(1),
};
