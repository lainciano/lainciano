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
import { bookStore } from "@/rooms/terminal/bookStore";
import { submitRun, type SubmitError } from "./api";
import type { PlatinumLabels } from "./labels";
import { ensureRunTicket } from "./ticket";

type Phase = { kind: "form" } | { kind: "sending" } | { kind: "error"; error: SubmitError; seq: number };

// Pausa/retomada do Lenis uma vez só por abertura (a ref evita contar duas vezes).
function holdLenis(held: { current: boolean }) {
  if (held.current) return;
  held.current = true;
  pauseLenis();
}
function releaseLenis(held: { current: boolean }) {
  if (!held.current) return;
  held.current = false;
  resumeLenis();
}

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
  const errorSeq = useRef(0);
  const pausedRef = useRef(false);
  const baseId = useId();
  const errorId = `${baseId}-erro`;
  const statusId = `${baseId}-status`;
  const summaryId = `${baseId}-resumo`;
  const elapsed = platinumElapsedMs(relics);
  const recorded = relics.recordedPosition;

  // Abrir/fechar o <dialog> e pausar o Lenis acompanham a loja.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      inputRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
    // Fora do guard do showModal: no StrictMode o cleanup solta e a 2ª montagem precisa pausar de novo.
    if (open) holdLenis(pausedRef);
  }, [open]);

  // Desmontou aberto (ou o evento close não veio): devolve o Lenis uma única vez.
  useEffect(() => () => releaseLenis(pausedRef), []);

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
    const onCloseEvent = () => {
      // Reaberta depois de "Agora não" ou Esc, a tela não traz o erro velho de volta.
      setPhase((current) => (current.kind === "error" ? { kind: "form" } : current));
      releaseLenis(pausedRef);
    };
    dialog.addEventListener("cancel", onCancel);
    dialog.addEventListener("close", onCloseEvent);
    return () => {
      dialog.removeEventListener("cancel", onCancel);
      dialog.removeEventListener("close", onCloseEvent);
    };
  }, [onClose]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (phase.kind === "sending") return; // botão só aria-disabled: Enter não reenvia
    const verdict = validateNickname(nickname);
    if (verdict !== "ok") {
      errorSeq.current += 1;
      setPhase({
        kind: "error",
        error: verdict === "invalid" ? "invalid_nickname" : "blocked_nickname",
        seq: errorSeq.current,
      });
      inputRef.current?.focus();
      return;
    }
    if (elapsed === null) return;
    setPhase({ kind: "sending" });
    const attempt = async () => {
      await ensureRunTicket();
      const { runId, ticket, won } = relicStore.getSnapshot();
      if (!runId || !ticket) return { ok: false as const, error: "unavailable" as SubmitError };
      return submitRun({
        runId,
        issuedAt: ticket.issuedAt,
        token: ticket.token,
        nickname: nickname.trim(),
        relics: won,
        elapsedMs: Math.round(elapsed),
      });
    };
    let result = await attempt();
    // Segredo girou no servidor: o bilhete guardado nunca mais vale. Pede outro e tenta uma vez só.
    if (!result.ok && result.error === "invalid_run") {
      relicStore.dropTicket();
      result = await attempt();
    }
    if (result.ok) {
      relicStore.markRecorded(result.position);
      bookStore.load(); // o livro do Contato refaz a leitura e mostra a linha nova
      setPhase({ kind: "form" });
    } else {
      errorSeq.current += 1;
      setPhase({ kind: "error", error: result.error, seq: errorSeq.current });
      if (result.error === "invalid_nickname" || result.error === "blocked_nickname") inputRef.current?.focus();
    }
  };

  // Já no Contato a navegação é só o hash: o foco vai ao título do livro depois que o diálogo devolve o dele.
  const goToBook = () => {
    onClose();
    if (window.location.pathname === "/contact") {
      window.setTimeout(() => document.getElementById("livro-titulo")?.focus(), 200);
    }
  };

  const error = phase.kind === "error" ? labels.errors[phase.error] : null;
  // Só erro de apelido liga o campo (aria-invalid/describedby); os demais são avisos do formulário.
  const fieldError = phase.kind === "error" && (phase.error === "invalid_nickname" || phase.error === "blocked_nickname");
  const sending = phase.kind === "sending";
  const statusText = sending ? labels.sending : recorded !== null ? fillTemplate(labels.success, { posicao: recorded }) : "";

  return (
    <dialog
      ref={dialogRef}
      className="platina"
      aria-labelledby="platina-titulo"
      aria-describedby={elapsed !== null ? summaryId : undefined}
      data-lenis-prevent
    >
      <div className="platina__painel">
        <button type="button" className="hud-btn focus-ring platina__fechar" onClick={onClose}>
          {labels.close}
        </button>
        <div className="platina__selo" aria-hidden="true">
          {RELICS.map((relic, index) => (
            <span key={relic.id} className="platina__sigilo" style={{ "--i": index, "--n": RELICS.length } as React.CSSProperties}>
              {relic.sigil}
            </span>
          ))}
        </div>
        <h2 id="platina-titulo" className="platina__titulo">
          {labels.title}
        </h2>
        {elapsed !== null && <p id={summaryId} className="platina__resumo">{fillTemplate(labels.summary, { tempo: formatElapsed(elapsed) })}</p>}

        {/* Região viva sempre montada: o texto entra depois, então o leitor de tela anuncia. */}
        <p id={statusId} role="status" className="platina__status">
          {statusText}
        </p>
        {recorded !== null ? (
          <div className="platina__gravado">
            <TransitionLink
              ref={bookLinkRef}
              href="/contact#livro"
              className="hud-btn focus-ring"
              aria-describedby={statusId}
              onClick={goToBook}
            >
              {labels.bookLink}
            </TransitionLink>
          </div>
        ) : (
          <form className="platina__form" onSubmit={submit} noValidate aria-busy={sending}>
            <label htmlFor="platina-apelido" className="platina__rotulo">
              {labels.nicknameLabel}
            </label>
            <input
              ref={inputRef}
              id="platina-apelido"
              className="platina__campo focus-ring"
              value={nickname}
              onChange={(event) => {
                setNickname(event.target.value);
                if (phase.kind === "error") setPhase({ kind: "form" });
              }}
              maxLength={16}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? `${errorId} ${baseId}-dica` : `${baseId}-dica`}
            />
            <p id={`${baseId}-dica`} className="platina__dica">
              {labels.nicknameHint}
            </p>
            {error && (
              <p key={phase.kind === "error" ? phase.seq : 0} id={errorId} role="alert" className="platina__erro text-small-body">
                {error}
              </p>
            )}
            <p className="platina__privacidade">{labels.privacy}</p>
            <div className="platina__acoes">
              <button type="submit" className="hud-btn focus-ring platina__gravar" aria-disabled={sending ? true : undefined}>
                {sending ? labels.sending : labels.submit}
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
