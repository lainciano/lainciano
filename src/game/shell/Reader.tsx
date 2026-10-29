"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { ReaderView } from "./readerFlow";

/**
 * Leitor em dois níveis (T10, bíblia 7.5 e 12b.5). O nível 1 é a imagem do documento (um `<canvas>` pintado em código,
 * letra à mão e pontilhado; `render/paper.ts`, carregado só na primeira leitura) e o nível 2 é o texto limpo, que é
 * o que o leitor de tela recebe desde a abertura (`aria-describedby`). R alterna; E, ⌫ ou o botão direito fecham;
 * o Esc só por tolerância e nunca é rótulo.
 *
 * É um `<dialog>` modal nativo: tudo fora dele fica inerte (o palco, o botão de sair), o foco é preso no Tab e volta
 * a quem abriu ao fechar. Quem manda no nível e no fechamento é a sessão (controlado): as teclas chegam pelo adaptador
 * de entrada e os cliques por aqui. Rótulos por props (nada de copy.ts); o canvas é zerado ao desmontar, e nenhuma
 * textura WebGL é criada.
 */
export default function Reader({
  view,
  readLabel,
  paperLabel,
  closeLabel,
  showKeys,
  onToggle,
  onClose,
}: {
  view: ReaderView;
  readLabel: string;
  paperLabel: string;
  closeLabel: string;
  showKeys: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const { doc, clean } = view;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const cleanRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const textId = useId();
  const [painted, setPainted] = useState(false);

  // Abre modal (o resto fica inerte) e leva o foco para dentro; ao desmontar, fecha e devolve o foco a quem abriu.
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
    toggleRef.current?.focus({ preventScroll: true });
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  // Nível 1: pinta uma vez (chunk próprio) e zera o canvas ao sair, esteja a pintura onde estiver.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const controller = new AbortController();
    setPainted(false);
    import("../render/paper")
      .then(async ({ paintPaper }) => {
        await paintPaper(canvas, doc, controller.signal);
        if (!controller.signal.aborted) setPainted(true);
      })
      .catch((error: unknown) => console.error("[jogo] o papel não pintou", error));
    return () => {
      controller.abort();
      canvas.width = 0;
      canvas.height = 0;
    };
  }, [doc]);

  // O foco acompanha o nível: o texto limpo rola com o teclado; ao voltar ao papel, o foco volta ao botão de ler.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    (clean ? cleanRef.current : toggleRef.current)?.focus({ preventScroll: true });
  }, [clean]);

  // Foco preso: o Tab dá a volta dentro do diálogo (o navegador, sozinho, sairia para a barra de endereço).
  const onKeyDown = (e: KeyboardEvent<HTMLDialogElement>) => {
    if (e.key !== "Tab") return;
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), [tabindex='0']")).filter((el) => !el.closest("[hidden]"));
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = e.shiftKey ? (at <= 0 ? items.length - 1 : at - 1) : at === -1 || at === items.length - 1 ? 0 : at + 1;
    e.preventDefault();
    items[next]?.focus();
  };

  // O botão direito fecha (o diálogo cobre o palco, que é quem o ouviria): é gesto, o mouse pode travar de novo aqui.
  const onPointerDown = (e: PointerEvent<HTMLDialogElement>) => {
    if (e.button !== 2) return;
    e.preventDefault();
    onClose();
  };

  const paragraphs = doc.text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  return (
    <dialog
      ref={dialogRef}
      data-game-reader
      data-level={clean ? "clean" : "paper"}
      aria-labelledby={titleId}
      aria-describedby={textId}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onContextMenu={(e) => e.preventDefault()}
      // O Esc é do navegador: o diálogo nativo fecharia sozinho, o jogo fecha pela pilha (idempotente).
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <h2 id={titleId}>{doc.title}</h2>
      <div data-reader-stage>
        <canvas ref={canvasRef} data-reader-paper data-ready={painted ? "" : undefined} hidden={clean} aria-hidden="true" />
        <div ref={cleanRef} id={textId} className="focus-ring" data-reader-clean hidden={!clean} tabIndex={clean ? 0 : -1}>
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </div>
      <div data-reader-acts>
        <button ref={toggleRef} type="button" className="focus-ring" data-reader-toggle onClick={onToggle}>
          {showKeys && <kbd>R</kbd>}
          <span>{clean ? paperLabel : readLabel}</span>
        </button>
        <button type="button" className="focus-ring" data-reader-close onClick={onClose}>
          {showKeys && <kbd>E</kbd>}
          <span>{closeLabel}</span>
        </button>
      </div>
    </dialog>
  );
}
