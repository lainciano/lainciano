"use client";

import gsap from "gsap";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { TransitionLink } from "@/components/ui/TransitionLink";
import { useReadingMode } from "@/interaction/reading-mode/store";
import { RELICS } from "@/interaction/relics/catalog";
import { formatElapsed, platinumElapsedMs } from "@/interaction/relics/state";
import { relicStore, useRelics } from "@/interaction/relics/store";
import { pauseLenis, resumeLenis } from "@/lib/lenis-bridge";
import { validateNickname } from "@/lib/ranking/validate";
import { fillTemplate } from "@/lib/template";
import { submitRun, type SubmitError } from "./api";
import type { PlatinumLabels } from "./labels";
import { ensureRunTicket } from "./ticket";

type Phase = { kind: "form" } | { kind: "sending" } | { kind: "error"; error: SubmitError };

type PlatinumDialogProps = { labels: PlatinumLabels; open: boolean; onClose: () => void };

// Tela de platina (spec 8.5): selo de sigilos, tempo, apelido. GSAP só nos filhos (o <dialog> é top layer).
export function PlatinumDialog({ labels, open, onClose }: PlatinumDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bookLinkRef = useRef<HTMLAnchorElement>(null);
  const reading = useReadingMode();
  const relics = useRelics();
  const [nickname, setNickname] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const errorId = useId();
  const elapsed = platinumElapsedMs(relics);
  const recorded = relics.recordedPosition;

  // Abrir/fechar o <dialog> e pausar o Lenis acompanham a loja.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      pauseLenis();
      inputRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Gravado (ou reaberto já gravado): o formulário some, então o foco vai para o link do livro, nunca para o body.
  useEffect(() => {
    if (open && recorded !== null) bookLinkRef.current?.focus();
  }, [open, recorded]);

  // Selo: os sigilos convergem e o selo pulsa uma vez (modo leitura: estado final).
  useEffect(() => {
    const dialog = dialogRef.current;
    // Modo leitura e prefers-reduced-motion: estado final direto.
    if (!open || !dialog || reading || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const sigils = dialog.querySelectorAll<HTMLElement>(".platina__sigilo");
    const seal = dialog.querySelector<HTMLElement>(".platina__selo");
    const context = gsap.context(() => {
      gsap
        .timeline()
        .from(sigils, {
          x: () => gsap.utils.random(-window.innerWidth / 2, window.innerWidth / 2),
          y: () => gsap.utils.random(-window.innerHeight / 2, window.innerHeight / 2),
          opacity: 0,
          duration: 0.7,
          ease: "expo.out",
          stagger: 0.04,
        })
        // Pulso sobrepõe o fim dos sigilos: total 0,7 + 9 x 0,04 = 1,06 s; o pulso termina em 1,16 s (≤ 1,2 s).
        .fromTo(seal, { scale: 0.9 }, { scale: 1, duration: 0.4, ease: "back.out(2)" }, "-=0.3");
    }, dialog);
    return () => context.revert();
  }, [open, reading]);

  // Esc fecha como "Agora não"; o evento close devolve o Lenis.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    const onCloseEvent = () => resumeLenis();
    dialog.addEventListener("cancel", onCancel);
    dialog.addEventListener("close", onCloseEvent);
    return () => {
      dialog.removeEventListener("cancel", onCancel);
      dialog.removeEventListener("close", onCloseEvent);
    };
  }, [onClose]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const verdict = validateNickname(nickname);
    if (verdict !== "ok") {
      setPhase({ kind: "error", error: verdict === "invalid" ? "invalid_nickname" : "blocked_nickname" });
      inputRef.current?.focus();
      return;
    }
    if (elapsed === null) return;
    setPhase({ kind: "sending" });
    await ensureRunTicket();
    const { runId, ticket, won } = relicStore.getSnapshot();
    if (!runId || !ticket) {
      setPhase({ kind: "error", error: "unavailable" });
      return;
    }
    const result = await submitRun({
      runId,
      issuedAt: ticket.issuedAt,
      token: ticket.token,
      nickname: nickname.trim(),
      relics: won,
      elapsedMs: Math.round(elapsed),
    });
    if (result.ok) {
      relicStore.markRecorded(result.position);
      setPhase({ kind: "form" });
    } else {
      setPhase({ kind: "error", error: result.error });
      if (result.error === "invalid_nickname" || result.error === "blocked_nickname") inputRef.current?.focus();
    }
  };

  const error = phase.kind === "error" ? labels.errors[phase.error] : null;

  return (
    <dialog ref={dialogRef} className="platina" aria-labelledby="platina-titulo" data-lenis-prevent>
      <div className="platina__painel">
        <button type="button" className="hud-btn focus-ring platina__fechar" onClick={onClose}>
          {labels.close}
        </button>
        <div className="platina__selo" aria-hidden="true">
          {RELICS.map((relic, index) => (
            <span key={relic.id} className="platina__sigilo" style={{ "--i": index } as React.CSSProperties}>
              {relic.sigil}
            </span>
          ))}
        </div>
        <h2 id="platina-titulo" className="platina__titulo">
          {labels.title}
        </h2>
        {elapsed !== null && <p className="platina__resumo">{fillTemplate(labels.summary, { tempo: formatElapsed(elapsed) })}</p>}

        {/* Região viva sempre montada: o texto entra depois, então o leitor de tela anuncia. */}
        <p role="status" className="platina__status">
          {recorded !== null ? fillTemplate(labels.success, { posicao: recorded }) : ""}
        </p>
        {recorded !== null ? (
          <div className="platina__gravado">
            <TransitionLink ref={bookLinkRef} href="/contact#livro" className="hud-btn focus-ring" onClick={onClose}>
              {labels.bookLink}
            </TransitionLink>
          </div>
        ) : (
          <form className="platina__form" onSubmit={submit} noValidate>
            <label htmlFor="platina-apelido" className="platina__rotulo">
              {labels.nicknameLabel}
            </label>
            <input
              ref={inputRef}
              id="platina-apelido"
              className="platina__campo focus-ring"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              maxLength={16}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : `${errorId}-dica`}
            />
            <p id={`${errorId}-dica`} className="platina__dica">
              {labels.nicknameHint}
            </p>
            {error && (
              <p id={errorId} role="alert" className="platina__erro">
                {error}
              </p>
            )}
            <p className="platina__privacidade">{labels.privacy}</p>
            <div className="platina__acoes">
              <button type="submit" className="hud-btn focus-ring platina__gravar" disabled={phase.kind === "sending"}>
                {phase.kind === "sending" ? labels.sending : labels.submit}
              </button>
              <button type="button" className="link-mono focus-ring" onClick={onClose}>
                {labels.later}
              </button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}
