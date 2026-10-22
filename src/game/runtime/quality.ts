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

/**
 * Estado da qualidade em execução. No "auto" o FpsGuard desce um degrau por vez; uma escolha manual (`choose`)
 * troca as linhas e desliga a descida automática de vez ("manual vence"). Ainda não há volta a "auto" em
 * execução: só reabrindo o jogo com o ajuste em "auto" (o menu de ajustes da 1A decide se precisa de `resume`).
 */
export function createQualityControl(initial: QualityLines, auto: boolean) {
  let quality = initial;
  let automatic = auto;
  return {
    get quality(): QualityLines {
      return quality;
    },
    /** A descida automática ainda vale (e há degrau para descer): só então o FpsGuard precisa amostrar. */
    get canDegrade(): boolean {
      return automatic && quality !== 240;
    },
    get auto(): boolean {
      return automatic;
    },
    choose(q: QualityLines) {
      quality = q;
      automatic = false;
    },
    /** O FpsGuard disparou: desce um degrau se automático. Devolve true se mudou. */
    degrade(): boolean {
      if (!automatic || quality === 240) return false;
      quality = downgrade(quality);
      return true;
    },
  };
}
