"use client";

import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { whenGsap } from "@/lib/motion";
import { lineWidths, waveOffset } from "../engraving";
import type { ActProps } from "../LimiarStage";
import { TIMING } from "../sequence";
import {
  LINE_FILL,
  MASK_SCALE,
  WAVE_RADIUS_PX,
  capDpr,
  engravingRows,
  fitFontSize,
  maskSize,
  rowRuns,
  sweepProgress,
} from "./opening-plan";

type Point = { x: number; y: number };

/** Tamanho de referência para medir o wordmark antes de ajustá-lo à caixa. */
const REF_FONT_PX = 100;
/** Espera máxima pela fonte do wordmark: depois disso desenha com o que houver. */
const FONT_WAIT_MS = 1500;
/** Espessura (px CSS) das linhas da chapa, fora das letras. */
const PLATE_LINE_PX = 0.6;
/** Brilho da varredura (px CSS de desfoque). */
const SWEEP_GLOW_PX = 14;

/** Geometria da gravura para o tamanho atual do ato. */
type Plate = {
  width: number;
  height: number;
  dpr: number;
  rows: number;
  spacing: number;
  columns: number;
  colWidth: number;
  widths: number[][];
  runs: [number, number][][];
};

function waitForFont(font: string, text: string): Promise<void> {
  const fonts = document.fonts;
  if (!fonts) return Promise.resolve();
  const loaded = fonts
    .load(font, text)
    .then(() => fonts.ready)
    .then(() => undefined);
  const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, FONT_WAIT_MS));
  return Promise.race([loaded, timeout]).catch(() => undefined);
}

/**
 * Ato Abertura (spec Limiar 3.2): o wordmark rasterizado numa máscara offscreen e desenhado em linhas
 * horizontais de gravura (espessura pela forma da letra), revelado da esquerda para a direita por uma varredura
 * `--sangue` em `TIMING.sweepMs`; o ponteiro entorta as linhas perto dele. Depois entra a frase. Avança com
 * clique, espaço/Enter (o botão da frase, foco do palco) ou sozinho `TIMING.openingAutoMs` após a varredura.
 * O texto real fica no DOM para leitores de tela; o canvas é `aria-hidden`.
 */
export function OpeningAct({ labels, siteName, done, reduced }: ActProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const markRef = useRef<HTMLHeadingElement>(null);
  const doneRef = useRef(done);
  const [lit, setLit] = useState(false);

  useLayoutEffect(() => {
    doneRef.current = done;
  }, [done]);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const mark = markRef.current;
    const ctx = canvas?.getContext("2d");
    if (!root || !canvas || !mark || !ctx) return;

    const rootStyle = getComputedStyle(document.documentElement);
    const color = (name: string) => rootStyle.getPropertyValue(name).trim();
    const ink = { lit: color("--osso"), plate: color("--linha"), sweep: color("--sangue") };
    const family = rootStyle.getPropertyValue("--font-grenze").trim() || "serif";
    const font = (px: number) => `900 ${px}px ${family}`;

    let disposed = false;
    let plate: Plate | null = null;
    let origin = { left: 0, top: 0 };
    let pointer: Point | null = null;
    let progress = reduced ? 1 : 0;
    let sweepStart = -1;
    let dirty = false;
    let autoTimer: number | undefined;
    let stopTicker: (() => void) | undefined;
    let offsets = new Float32Array(0);

    // Máscara de 1 canal (alfa) com o wordmark na caixa do <h2>, a 1/MASK_SCALE da resolução CSS.
    const build = () => {
      const box = root.getBoundingClientRect();
      const markBox = mark.getBoundingClientRect();
      origin = { left: box.left, top: box.top };
      const width = Math.max(1, Math.round(box.width));
      const height = Math.max(1, Math.round(box.height));
      const dpr = capDpr(window.devicePixelRatio);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);

      const size = maskSize(width, height);
      const off = document.createElement("canvas");
      off.width = size.width;
      off.height = size.height;
      const octx = off.getContext("2d", { willReadFrequently: true });
      if (!octx) return;
      octx.font = font(REF_FONT_PX);
      const measured = octx.measureText(siteName);
      const ascent = measured.actualBoundingBoxAscent;
      const descent = measured.actualBoundingBoxDescent;
      const px = fitFontSize(
        { width: markBox.width / MASK_SCALE, height: markBox.height / MASK_SCALE },
        { width: measured.width, height: ascent + descent },
        REF_FONT_PX,
      );
      if (px > 0) {
        const k = px / REF_FONT_PX;
        octx.font = font(px);
        octx.textAlign = "center";
        octx.textBaseline = "alphabetic";
        const cx = (markBox.left - box.left + markBox.width / 2) / MASK_SCALE;
        const cy = (markBox.top - box.top + markBox.height / 2) / MASK_SCALE;
        // Centro da tinta (não da caixa da fonte): Grenze tem ascendentes altos.
        octx.fillText(siteName, cx, cy + ((ascent - descent) * k) / 2);
      }
      const rgba = octx.getImageData(0, 0, size.width, size.height).data;
      const mask = new Uint8ClampedArray(size.width * size.height);
      for (let i = 0; i < mask.length; i++) mask[i] = rgba[i * 4 + 3];

      const rows = engravingRows(height);
      const spacing = height / rows;
      const widths = lineWidths(mask, size.width, size.height, rows, spacing * LINE_FILL);
      plate = {
        width,
        height,
        dpr,
        rows,
        spacing,
        columns: size.width,
        colWidth: width / size.width,
        widths,
        runs: widths.map((row) => rowRuns(row)),
      };
      offsets = new Float32Array(size.width);
      dirty = true;
    };

    const draw = () => {
      if (!plate) return;
      const { width, height, dpr, rows, spacing, columns, colWidth, widths, runs } = plate;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const revealX = progress * width;
      if (revealX <= 0) return;
      const lastCol = Math.min(columns, Math.ceil(revealX / colWidth));
      const near = reduced ? null : pointer;

      for (let r = 0; r < rows; r++) {
        const y = (r + 0.5) * spacing;
        const bent = near !== null && Math.abs(y - near.y) < WAVE_RADIUS_PX;
        if (bent) for (let c = 0; c < lastCol; c++) offsets[c] = waveOffset((c + 0.5) * colWidth, y, near, WAVE_RADIUS_PX);

        // Chapa: linha fina em --linha de ponta a ponta (entorta junto).
        ctx.fillStyle = ink.plate;
        if (!bent) ctx.fillRect(0, y - PLATE_LINE_PX / 2, revealX, PLATE_LINE_PX);
        else {
          ctx.beginPath();
          for (let c = 0; c < lastCol; c++) ctx.lineTo((c + 0.5) * colWidth, y + offsets[c] - PLATE_LINE_PX / 2);
          for (let c = lastCol - 1; c >= 0; c--) ctx.lineTo((c + 0.5) * colWidth, y + offsets[c] + PLATE_LINE_PX / 2);
          ctx.fill();
        }

        // Letra: a mesma linha engrossa pela máscara, em --osso.
        ctx.fillStyle = ink.lit;
        ctx.beginPath();
        for (const [a, bRaw] of runs[r]) {
          if (a >= lastCol) break;
          const b = Math.min(bRaw, lastCol);
          const row = widths[r];
          const off = (c: number) => (bent ? offsets[c] : 0);
          ctx.moveTo(a * colWidth, y + off(a));
          for (let c = a; c < b; c++) ctx.lineTo((c + 0.5) * colWidth, y + off(c) - row[c] / 2);
          ctx.lineTo(b * colWidth, y + off(b - 1));
          for (let c = b - 1; c >= a; c--) ctx.lineTo((c + 0.5) * colWidth, y + off(c) + row[c] / 2);
          ctx.closePath();
        }
        ctx.fill();
      }

      if (progress < 1) {
        ctx.fillStyle = ink.sweep;
        ctx.shadowColor = ink.sweep;
        ctx.shadowBlur = SWEEP_GLOW_PX;
        ctx.fillRect(revealX - 1, 0, 2, height);
        ctx.shadowBlur = 0;
      }
    };

    const finishSweep = () => {
      if (autoTimer !== undefined) return;
      setLit(true);
      // Sozinho depois da varredura (o palco ignora done() se ainda estiver em transição).
      autoTimer = window.setTimeout(() => doneRef.current(), TIMING.openingAutoMs);
    };

    const onMove = (event: PointerEvent) => {
      pointer = { x: event.clientX - origin.left, y: event.clientY - origin.top };
      dirty = true;
    };
    const onLeave = () => {
      pointer = null;
      dirty = true;
    };
    const resize = new ResizeObserver(() => {
      if (!plate) return; // a primeira construção espera a fonte
      build();
      if (reduced) draw();
    });

    void waitForFont(font(REF_FONT_PX), siteName).then(() => {
      if (disposed) return;
      build();
      resize.observe(root);
      if (reduced) {
        // Sem varredura nem onda: a gravura aparece inteira e a frase entra já.
        draw();
        finishSweep();
        return;
      }
      root.addEventListener("pointermove", onMove);
      root.addEventListener("pointerleave", onLeave);
      stopTicker = whenGsap(({ gsap }) => {
        const tick = () => {
          if (sweepStart < 0) sweepStart = performance.now();
          if (progress < 1) {
            progress = sweepProgress(performance.now() - sweepStart, TIMING.sweepMs);
            dirty = true;
            if (progress >= 1) finishSweep();
          }
          if (!dirty) return;
          dirty = false;
          draw();
        };
        gsap.ticker.add(tick);
        return () => gsap.ticker.remove(tick);
      });
    });

    return () => {
      disposed = true;
      stopTicker?.();
      resize.disconnect();
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerleave", onLeave);
      if (autoTimer !== undefined) window.clearTimeout(autoTimer);
    };
  }, [reduced, siteName]);

  // Clique em qualquer ponto do ato, ou espaço/Enter no botão da frase (clique de teclado, sem coordenadas).
  const advance = (event: ReactMouseEvent<HTMLDivElement>) =>
    done(event.detail > 0 ? { x: event.clientX, y: event.clientY } : undefined);

  return (
    <div ref={rootRef} className="limiar-abertura" data-verbo="" data-acesa={lit ? "" : undefined} onClick={advance}>
      <canvas ref={canvasRef} className="limiar-abertura__gravura" aria-hidden="true" />
      <h2 ref={markRef} className="limiar-abertura__marca">
        <span className="sr-only">{siteName}</span>
      </h2>
      <button type="button" data-limiar-foco className="limiar-abertura__frase focus-ring">
        {labels.openingLede} <span className="limiar-abertura__virada">{labels.openingTwist}</span>
      </button>
    </div>
  );
}
