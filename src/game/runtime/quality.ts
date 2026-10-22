import type { Settings } from "../save/schema";

/** Linhas do render target da cena (spec §4: presets 480/360/240). */
export type QualityLines = 480 | 360 | 240;

/** Desktop começa em 480 e toque em 360; um ajuste manual vence o aparelho. */
export function initialQuality(coarse: boolean, setting: Settings["quality"]): QualityLines {
  if (setting !== "auto") return setting;
  return coarse ? 360 : 480;
}

/** Um degrau por vez (o FpsGuard aciona); nunca sobe sozinho e para no 240. */
export function downgrade(q: QualityLines): QualityLines {
  return q === 480 ? 360 : 240;
}

/** Tamanho do render target: altura = linhas, largura = linhas × aspecto (mín. 2). Aspecto inválido vira 1. */
export function targetSize(lines: QualityLines, aspect: number): { width: number; height: number } {
  const safe = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  return { width: Math.max(2, Math.round(lines * safe)), height: lines };
}
