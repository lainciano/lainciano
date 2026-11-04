import type * as THREE from "three";
import { buildBasementOpening, buildFluorescentFixture, buildNorthDoor, buildSouthDoor, buildWindow, shellMaterials } from "../../layers/antessala/shell";
import type { Maker } from "../../render/kit";
import type { LabBuild, LabId } from "../registry";

/** Tira do modelo os planos de fundo (o lago, a névoa, o pátio, o corredor, o escuro): o laboratório mostra a peça. */
function without(root: THREE.Object3D, names: readonly string[]): THREE.Object3D {
  for (const name of names) root.getObjectByName(name)?.removeFromParent();
  return root;
}

const mats = (m: Maker) => shellMaterials(m);

/** Peças da casca da Antessala (B8), do jeito que a cena as monta, sem o lote (o laboratório as centraliza). */
export const builders: Partial<Record<LabId, LabBuild>> = {
  fluorescente: (m) => buildFluorescentFixture(m, mats(m)),
  "porta-norte": (m) => without(buildNorthDoor(m, mats(m)).root, ["corredor-alem"]),
  "porta-sul": (m) => without(buildSouthDoor(m, mats(m), "noite"), ["patio"]),
  janela: (m) => without(buildWindow(m, mats(m), "noite").root, ["nevoa", "lago"]),
  "porao-vao": (m) => without(buildBasementOpening(m, mats(m)), ["porao-escuro"]),
};
