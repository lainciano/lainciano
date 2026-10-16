"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { readingStore } from "@/interaction/reading-mode/store";
import { terminal as copy } from "@/lib/content/copy";
import { pauseLenis, resumeLenis } from "@/lib/lenis-bridge";
import { getGsap } from "@/lib/motion";
import { LazyConsoleSession } from "./LazyConsoleSession";
import { shouldOpenConsole } from "./shortcut";
import { consoleStore, useConsoleOpen } from "./store";

/** Durações dos tokens --motion-console-in/out, em segundos para o GSAP. */
const IN_S = 0.3;
const OUT_S = 0.18;

// Console global (spec 8.6): <dialog> modal na metade de baixo (tela cheia no celular). O GSAP anima só
// o painel interno, nunca o <dialog> do top layer (lição 1). Esc e "fechar" saem com animação curta.
export function ConsoleOverlay() {
  const open = useConsoleOpen();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const closeTween = useRef<{ kill: () => void } | null>(null);
  const [everOpened, setEverOpened] = useState(false);
  if (open && !everOpened) setEverOpened(true);

  // Atalho `/` em qualquer página (fora de campos de texto e de outros diálogos — D11).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const go = shouldOpenConsole({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        isComposing: event.isComposing,
        defaultPrevented: event.defaultPrevented,
        target: target ? { tagName: target.tagName, isContentEditable: target.isContentEditable } : null,
        dialogOpen: Boolean(document.querySelector("dialog[open]")),
      });
      if (!go) return;
      event.preventDefault();
      consoleStore.open();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Trocou de rota (comando `ir`, link, voltar): o console fecha.
  useEffect(() => {
    consoleStore.close();
  }, [pathname]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const panel = panelRef.current;
    if (!dialog || !panel) return;
    if (open && closeTween.current) {
      // Reabriu durante a animação de fechar: mata o tween (o onComplete fecharia o diálogo recém-aberto).
      closeTween.current.kill();
      closeTween.current = null;
      panel.style.transform = "";
      panel.style.opacity = "";
      getGsap()?.gsap.set(panel, { clearProps: "transform,opacity" });
      dialog.querySelector<HTMLInputElement>(".console__input")?.focus();
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
      pauseLenis();
      dialog.querySelector<HTMLInputElement>(".console__input")?.focus();
      const lib = getGsap();
      if (lib && !readingStore.getSnapshot()) {
        lib.gsap.fromTo(panel, { yPercent: 12, opacity: 0 }, { yPercent: 0, opacity: 1, duration: IN_S, ease: "power3.out" });
      }
      return;
    }
    if (!open && dialog.open) {
      const lib = getGsap();
      if (!lib || readingStore.getSnapshot()) {
        dialog.close();
        return;
      }
      closeTween.current = lib.gsap.to(panel, {
        yPercent: 8,
        opacity: 0,
        duration: OUT_S,
        ease: "power2.in",
        onComplete: () => {
          closeTween.current = null;
          dialog.close();
          lib.gsap.set(panel, { clearProps: "transform,opacity" });
        },
      });
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // Esc dispara "cancel": em vez de fechar seco, pede o fechamento animado.
    const onCancel = (event: Event) => {
      event.preventDefault();
      consoleStore.close();
    };
    // Fechado por qualquer via: o store e o Lenis voltam ao normal (o navegador devolve o foco a quem abriu).
    const onClose = () => {
      consoleStore.close();
      resumeLenis();
    };
    dialog.addEventListener("cancel", onCancel);
    dialog.addEventListener("close", onClose);
    return () => {
      dialog.removeEventListener("cancel", onCancel);
      dialog.removeEventListener("close", onClose);
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="console-overlay"
      aria-label={copy.overlayLabel}
      data-lenis-prevent
      onClick={(event) => {
        // Só o fundo fecha: o painel cobre o retângulo visível do diálogo.
        if (event.target === event.currentTarget) consoleStore.close();
      }}
    >
      <div ref={panelRef} className="console-overlay__painel">
        {everOpened && (
          <LazyConsoleSession
            greeting={copy.greeting}
            autoFocus
            onNavigate={() => consoleStore.close()}
            onClose={() => consoleStore.close()}
          />
        )}
      </div>
    </dialog>
  );
}
