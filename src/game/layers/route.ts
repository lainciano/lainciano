import type { LayerId, SaveV1 } from "../save/schema";

/**
 * Rota → camada (1B): toda rota abre a Antessala. A sala cinza (prova do motor da 1A) só abre por debug:
 * `?debug=1&camada=cinza` (decisão 10 do dono). `debug` é o `debugEnabled` da URL (quem chama passa; aqui fica puro).
 */
export function layerForPath(pathname: string, search = "", debug = false): LayerId {
  void pathname;
  if (debug && new URLSearchParams(search).get("camada") === "cinza") return "cinza";
  return "antessala";
}

/** Flag do save: esta pessoa já chegou à Antessala (o save não é mais um save velho da sala cinza). */
export const ANTESSALA_ARRIVED = "antessala:chegou";

/**
 * O que fazer com o save ao entrar na camada `target`:
 * - `keep`: nada muda;
 * - `patch`: aplicar o patch (troca de camada sem perder nada);
 * - `fresh`: começar um save novo (`reset`) e aplicar o patch por cima.
 *
 * Um save da 1A (camada `cinza`, sem a flag de chegada) que abre a Antessala recomeça na `entrada`, preservando só os
 * ajustes (o progresso da sala cinza não vale aqui: a chave e o bilhete eram de outra sala). Quem já chegou à
 * Antessala e passou pela cinza de debug volta sem perder nada (só a camada e o lugar mudam). Abrir a cinza de debug
 * só troca a camada (o lugar salvo vale se existir lá; senão, a entrada).
 */
export type LayerEntry = { kind: "keep" } | { kind: "patch"; patch: Partial<SaveV1> } | { kind: "fresh"; patch: Partial<SaveV1> };

export function layerEntry(save: SaveV1, target: LayerId): LayerEntry {
  if (target === "cinza") return save.layer === "cinza" ? { kind: "keep" } : { kind: "patch", patch: { layer: "cinza" } };
  const arrived = save.flags[ANTESSALA_ARRIVED] === true;
  if (save.layer === "cinza") {
    if (!arrived) return { kind: "fresh", patch: { layer: "antessala", place: "entrada", settings: save.settings, flags: { [ANTESSALA_ARRIVED]: true } } };
    return { kind: "patch", patch: { layer: "antessala", place: "entrada" } };
  }
  return arrived ? { kind: "keep" } : { kind: "patch", patch: { flags: { [ANTESSALA_ARRIVED]: true } } };
}
