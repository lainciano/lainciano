"use client";

import gsap from "gsap";
import { useEffect, useRef } from "react";
import { readingStore } from "@/interaction/reading-mode/store";
import { soundEngine } from "@/interaction/sound/engine";
import { portal } from "@/lib/content/copy";
import { resumeLenis } from "@/lib/lenis-bridge";

type EntryMode = "sound" | "silent" | "reading";

// Evita reentrada: cliques/Esc repetidos durante a animação não duplicam sino nem timeline.
const entering = new WeakSet<HTMLDialogElement>();

// Aplica a escolha e abre as folhas da porta (direto, em modo leitura).
function enterPortal(dialog: HTMLDialogElement | null, mode: EntryMode) {
  if (!dialog?.open || entering.has(dialog)) return;
  entering.add(dialog);
  if (mode === "reading") readingStore.set("on");
  soundEngine.setEnabled(mode === "sound");
  if (mode === "sound") soundEngine.bell();
  const close = () => {
    dialog.close();
    entering.delete(dialog);
    resumeLenis();
  };
  if (readingStore.getSnapshot()) {
    close();
    return;
  }
  gsap
    .timeline({ onComplete: close })
    .to(dialog.querySelector(".portal__conteudo"), { opacity: 0, duration: 0.25 })
    .to(dialog.querySelector(".portal__folha--esq"), { xPercent: -100, duration: 0.7, ease: "expo.inOut" }, "<0.1")
    .to(dialog.querySelector(".portal__folha--dir"), { xPercent: 100, duration: 0.7, ease: "expo.inOut" }, "<");
}

// Porta da primeira visita. Aberto pelo PORTAL_BOOT_SCRIPT antes da hidratação (sem piscar).
// Sem JS ou depois da escolha, nunca aparece.
export function Portal({ siteName }: { siteName: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const enter = (mode: EntryMode) => enterPortal(dialogRef.current, mode);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // Esc dispara "cancel": em vez de só fechar, entra em silêncio.
    const onCancel = (event: Event) => {
      event.preventDefault();
      enterPortal(dialog, "silent");
    };
    // Um segundo Esc rápido pode fechar sem "cancel": persiste a escolha mesmo assim.
    const onClose = () => {
      if (entering.has(dialog)) return;
      soundEngine.setEnabled(false);
    };
    dialog.addEventListener("cancel", onCancel);
    dialog.addEventListener("close", onClose);
    return () => {
      dialog.removeEventListener("cancel", onCancel);
      dialog.removeEventListener("close", onClose);
    };
  }, []);

  return (
    <dialog ref={dialogRef} id="portal" className="portal" aria-labelledby="portal-titulo" data-lenis-prevent suppressHydrationWarning>
      <div className="portal__folha portal__folha--esq" aria-hidden="true" />
      <div className="portal__folha portal__folha--dir" aria-hidden="true" />
      <div className="portal__conteudo">
        <h2 id="portal-titulo" className="wordmark text-[clamp(4rem,14vw,12rem)] leading-[0.8]">
          {siteName}
        </h2>
        <p className="max-w-[34ch] text-[clamp(1.125rem,2vw,1.5rem)] font-medium">{portal.lede}</p>
        <div className="flex flex-wrap gap-[var(--space-sm)]">
          <button type="button" autoFocus onClick={() => enter("sound")} className="portal__btn portal__btn--primario focus-ring">
            {portal.withSound}
            <kbd>{portal.enterKey}</kbd>
          </button>
          <button type="button" onClick={() => enter("silent")} className="portal__btn focus-ring">
            {portal.silent}
            <kbd>{portal.escKey}</kbd>
          </button>
        </div>
        <button
          type="button"
          onClick={() => enter("reading")}
          className="focus-ring min-h-11 w-fit font-mono text-sm text-cinza underline underline-offset-4"
        >
          {portal.reading}
        </button>
      </div>
    </dialog>
  );
}
