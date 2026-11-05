import type { SaveV1 } from "./schema";

/**
 * Aplica um patch ao save. Regra única, usada por `SaveApi.patch` e pelo carregador de camadas:
 * - `flags` e `puzzles` são fundidos chave a chave (um nível): patchar `flags.bilhete` não apaga `flags["porta-norte"]`.
 *   Para "desligar" uma flag, passe `false`; não existe remoção por patch.
 * - TODO o resto (`items`, `relics`, `settings`, `place`, `layer`, números…) é SUBSTITUÍDO: quem patcha passa o
 *   valor completo (`items: [...save.items, "chave"]`, `settings: { ...save.settings, fov: 70 }`).
 * - Chaves com valor `undefined` são ignoradas (não apagam nada) e `version` fica sempre 1.
 */
export function mergeSavePatch(save: SaveV1, patch: Partial<SaveV1>): SaveV1 {
  const next: SaveV1 = { ...save };
  for (const key of Object.keys(patch) as (keyof SaveV1)[]) {
    const value = patch[key];
    if (value === undefined) continue;
    (next as Record<string, unknown>)[key] = value;
  }
  if (patch.flags) next.flags = { ...save.flags, ...patch.flags };
  if (patch.puzzles) next.puzzles = { ...save.puzzles, ...patch.puzzles };
  next.version = 1;
  return next;
}
