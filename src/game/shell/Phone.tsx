"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import type { GameLabels } from "../labels";
import type { PhoneRect, PhoneView } from "../runtime/phone";
import { phoneRows, type PhoneAction, type PhoneRow, type PhoneState } from "./phone-menu";

type Labels = GameLabels["phone"];

/**
 * Tela do celular de 2005 (T11): o LCD é DOM por cima da tela do modelo 3D (como no protótipo 7, `.phone`/`.lcd-*`),
 * posicionado onde a sessão diz que a tela do aparelho está (`view.rect`, em px; null abrindo e fechando, e então
 * só o aparelho aparece). Controlado: o estado do menu é da sessão (`phone-menu.ts`); aqui só se desenha e se
 * repassam as teclas: setas sobem e descem, Enter/espaço (o clique nativo do botão marcado) e o toque escolhem; E,
 * ⌫ e o botão direito voltam (E/⌫ chegam pelo adaptador, o direito por aqui); Tab fecha (adaptador).
 *
 * `<dialog>` modal: o resto da casca fica inerte e o foco fica preso no LCD (o item marcado tem o foco, como um
 * menu de verdade). Um documento aberto do Arquivo vem por cima (o leitor, outro modal); ao fechar, o LCD volta
 * "desgirando" da tela cheia para a mão (movimento reduzido: corte direto) e o foco volta ao mesmo item.
 */
export default function Phone({
  view,
  labels,
  covered,
  reduced,
  onNav,
}: {
  view: PhoneView;
  labels: Labels;
  /** O leitor está por cima (documento aberto do Arquivo). */
  covered: boolean;
  reduced: boolean;
  onNav: (a: PhoneAction) => void;
}) {
  const { state, rect } = view;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const lcdRef = useRef<HTMLDivElement>(null);
  const rows = phoneRows(state);
  const hasRect = rect !== null;

  // Abre modal (o resto fica inerte); ao desmontar, fecha.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) {
      try {
        dialog.showModal();
      } catch {
        dialog.setAttribute("open", "");
      }
    }
    dialog.focus({ preventScroll: true });
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  // Voltando de um documento: o LCD sai da tela cheia girada e encolhe até a mão. Só na troca (coberto → livre).
  const [returning, setReturning] = useState(false);
  const [wasCovered, setWasCovered] = useState(covered);
  if (wasCovered !== covered) {
    setWasCovered(covered);
    if (!covered && !reduced && rect) setReturning(true);
  }

  // O foco segue o item marcado (e volta a ele quando o leitor de cima fecha); sem LCD ainda, fica no diálogo.
  useEffect(() => {
    if (covered) return;
    const lcd = lcdRef.current;
    const target = lcd?.querySelector<HTMLElement>(`[data-lcd-row="${state.index}"]`) ?? lcd?.querySelector<HTMLElement>("[data-lcd-soft] button");
    (target ?? dialogRef.current)?.focus({ preventScroll: true });
  }, [state.index, state.screen, state.detail, covered, hasRect]);

  const onKeyDown = (e: KeyboardEvent<HTMLDialogElement>) => {
    if (e.key === "ArrowUp" || e.key === "ArrowLeft") onNav({ type: "up" });
    else if (e.key === "ArrowDown" || e.key === "ArrowRight") onNav({ type: "down" });
    else return;
    e.preventDefault();
  };

  // O botão direito volta (o diálogo cobre o palco, que é quem o ouviria).
  const onPointerDown = (e: PointerEvent<HTMLDialogElement>) => {
    if (e.button !== 2) return;
    e.preventDefault();
    onNav({ type: "back" });
  };

  return (
    <dialog
      ref={dialogRef}
      data-game-phone
      aria-label={labels.name}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onContextMenu={(e) => e.preventDefault()}
      // O Esc é do navegador: o diálogo nativo fecharia sozinho; aqui vale como voltar (tolerância, sem rótulo).
      onCancel={(e) => {
        e.preventDefault();
        onNav({ type: "back" });
      }}
    >
      {rect && (
        <div
          ref={lcdRef}
          data-phone-lcd
          data-returning={returning ? "" : undefined}
          style={lcdStyle(rect)}
          onAnimationEnd={() => setReturning(false)}
        >
          <div data-lcd-bar aria-hidden="true">
            <span>▂▄▆ {labels.network}</span>
            <span>{clock()}</span>
            <span>▮▮▯</span>
          </div>
          <div data-lcd-body>
            <Screen state={state} rows={rows} labels={labels} onNav={onNav} />
          </div>
          <div data-lcd-soft>
            <button type="button" className="focus-ring" onClick={() => onNav({ type: "ok" })} disabled={rows.length === 0}>
              {labels.ok}
            </button>
            <button type="button" className="focus-ring" onClick={() => onNav({ type: "back" })}>
              {state.screen === "menu" && !state.detail ? labels.close : labels.back}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}

const clock = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** Onde o LCD fica (a tela do aparelho) e de onde ele volta (a tela cheia girada), em variáveis para o CSS. */
function lcdStyle(rect: PhoneRect): CSSProperties {
  const vw = typeof window === "undefined" ? 1280 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  // tela cheia girada: o lado comprido do LCD ocupa a largura da janela
  const zoom = Math.max(vw / rect.h, vh / rect.w);
  return {
    left: `${rect.x - rect.w / 2}px`,
    top: `${rect.y - rect.h / 2}px`,
    width: `${rect.w}px`,
    height: `${rect.h}px`,
    "--lcd-rot": `${rect.angle}rad`,
    "--lcd-fs": `${Math.min(18, Math.max(10, rect.h / 15))}px`,
    "--lcd-from-x": `${vw / 2 - rect.x}px`,
    "--lcd-from-y": `${vh / 2 - rect.y}px`,
    "--lcd-from-zoom": `${zoom}`,
  } as CSSProperties;
}

function settingValue(row: Extract<PhoneRow, { kind: "setting" }>, labels: Labels): string {
  const v = row.value;
  if (typeof v === "boolean") return v ? labels.yes : labels.no;
  if (row.id === "volume") return `${Math.round(Number(v) * 100)}%`;
  if (row.id === "fov") return `${v}°`;
  if (row.id === "sensitivity") return `${v}×`;
  if (v === "auto") return labels.auto;
  return String(v);
}

function rowText(row: PhoneRow, state: PhoneState, labels: Labels): { label: string; right?: string } {
  const d = state.data;
  switch (row.kind) {
    case "screen":
      return { label: labels[row.id], right: row.disabled ? "—" : row.count ? String(row.count) : undefined };
    case "message": {
      const m = d.messages.find((x) => x.id === row.target);
      const text = m ? (m.text.length > 18 ? `${m.text.slice(0, 18)}…` : m.text) : row.target;
      return { label: `${m && !m.read ? "● " : ""}${text}`, right: m?.at };
    }
    case "item":
      return { label: d.items.find((x) => x.id === row.target)?.name ?? row.target };
    case "doc":
      return { label: d.docs.find((x) => x.id === row.target)?.title ?? row.target };
    case "place":
      return { label: labels.goTo.replace("{name}", d.places.find((x) => x.id === row.target)?.name ?? row.target) };
    case "setting":
      return { label: labels[row.id], right: settingValue(row, labels) };
    case "exit":
      return { label: labels.exit };
  }
}

function Screen({ state, rows, labels, onNav }: { state: PhoneState; rows: PhoneRow[]; labels: Labels; onNav: (a: PhoneAction) => void }) {
  const d = state.data;
  if (state.detail && state.screen === "mensagens") {
    const m = d.messages.find((x) => x.id === state.detail);
    return (
      <>
        <div data-lcd-title>{labels.message}</div>
        {m && <div data-lcd-from>{`${m.from} · ${m.at}`}</div>}
        {m && <div data-lcd-text>{m.text}</div>}
      </>
    );
  }
  if (state.detail && state.screen === "itens") {
    const it = d.items.find((x) => x.id === state.detail);
    return (
      <>
        <div data-lcd-title>{it?.name ?? state.detail}</div>
        {it?.desc && <div data-lcd-text>{it.desc}</div>}
      </>
    );
  }
  const empty = { menu: "", mensagens: labels.noMessages, itens: labels.noItems, mapa: labels.noPlaces, arquivo: labels.noDocs, ajustes: "" }[state.screen];
  return (
    <>
      <div data-lcd-title>{labels[state.screen]}</div>
      {rows.length === 0 && empty && <div data-lcd-text>{empty}</div>}
      {rows.map((row, i) => {
        const { label, right } = rowText(row, state, labels);
        const disabled = row.kind === "screen" && row.disabled;
        return (
          <button
            key={row.id}
            type="button"
            className="focus-ring"
            data-lcd-row={i}
            data-row-id={row.id}
            data-selected={i === state.index ? "" : undefined}
            aria-disabled={disabled ? "true" : undefined}
            aria-current={i === state.index ? "true" : undefined}
            tabIndex={i === state.index ? 0 : -1}
            onClick={() => onNav({ type: "select", index: i })}
          >
            <span>{label}</span>
            {right && <span data-lcd-right>{right}</span>}
          </button>
        );
      })}
    </>
  );
}
