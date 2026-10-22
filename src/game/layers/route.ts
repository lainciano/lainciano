import type { LayerId } from "../save/schema";

/** Rota → camada. Na Fase 1A toda rota cai em `cinza`; a 1B passa a olhar o caminho. */
export function layerForPath(pathname: string): LayerId {
  void pathname;
  return "cinza";
}
