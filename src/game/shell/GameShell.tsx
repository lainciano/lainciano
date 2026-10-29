"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { GameLabels } from "../labels";
import type { Line } from "../layers/types";
import type { PromptModel } from "../interaction/targeting";
import type { ExamineInfo, PlaceItem, Session, SessionStatus } from "../runtime/session";
import ExamineCard from "./ExamineCard";
import Prompt from "./Prompt";
import "./shell.css";
import { useGameSession } from "./useGameSession";

/** Tempo da fala na tela: cresce com o texto (bíblia 12b.2); a legenda completa é da T10. */
const lineSeconds = (text: string) => Math.min(9, 2.2 + text.length * 0.055);

/**
 * Casca do jogo: um painel fixo sobre o site (irmão do .page-shell, fora do template). A sessão (engine, camada,
 * jogador, entrada) chega por import() junto com o three e só pede à casca o que mostrar: carregando, falha,
 * "a porta emperrou", a lista de lugares (L), "pausado" e a fala. Sem WebGL, sem slot ou com o contexto perdido:
 * aviso e botão de voltar ao site, e nenhum loop fica rodando.
 * Esc nunca fecha: o navegador reserva a tecla; sair é o botão (e, depois, o menu do jogo).
 */
export default function GameShell({ labels, onExit }: { labels: GameLabels; onExit: () => void }) {
  const shellRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const placesRef = useRef<HTMLUListElement>(null);
  const sessionRef = useRef<Session | null>(null);
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [places, setPlaces] = useState<PlaceItem[] | null>(null);
  const [paused, setPaused] = useState(false);
  const [line, setLine] = useState<Line | null>(null);
  const [prompt, setPrompt] = useState<PromptModel | null>(null);
  const [reticle, setReticle] = useState<"off" | "idle" | "hot">("off");
  const [examine, setExamine] = useState<ExamineInfo | null>(null);
  // Ponteiro grosso (toque): rótulos sem tecla. Decidido uma vez, ao abrir (o jogo só abre no cliente).
  const [coarse] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches === true);
  useGameSession();

  // O site fica inerte: o foco vai para a casca (que não é tabulável) e o Tab segue dali para o botão.
  useEffect(() => {
    shellRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const host = stageRef.current;
    if (!host) return;
    const controller = new AbortController();
    const { signal } = controller;
    let lineTimer = 0;
    const ui = {
      status: (s: SessionStatus) => {
        if (signal.aborted) return;
        setStatus(s);
        // Fora de "live" (contexto perdido, erro, tentar de novo) nada da cena fica na tela: cartão, aviso, lista, mira.
        if (s !== "live") {
          setExamine(null);
          setPrompt(null);
          setPlaces(null);
          setReticle("off");
        }
      },
      places: (list: PlaceItem[] | null) => {
        if (!signal.aborted) setPlaces(list);
      },
      paused: (on: boolean) => {
        if (!signal.aborted) setPaused(on);
      },
      say: (l: Line) => {
        if (signal.aborted) return;
        setLine(l);
        window.clearTimeout(lineTimer);
        lineTimer = window.setTimeout(() => setLine(null), lineSeconds(l.text) * 1000);
      },
      prompt: (p: PromptModel | null) => {
        if (!signal.aborted) setPrompt(p);
      },
      reticle: (r: "off" | "idle" | "hot") => {
        if (!signal.aborted) setReticle(r);
      },
      examine: (info: ExamineInfo | null) => {
        if (!signal.aborted) setExamine(info);
      },
      notice: (n: { kind: "nothing" } | { kind: "hold"; verb: string }) => {
        const hold = coarse ? labels.holdHintTouch : labels.holdHint;
        const text = n.kind === "nothing" ? labels.nothingHere : hold.replace("{verb}", n.verb);
        ui.say({ text, kind: "system" });
      },
    };
    // Sessão, runtime, three, save (zod) e camada chegam juntos por import(): o chunk do shell não cresce.
    import("../runtime/session")
      .then(({ startSession }) => startSession(host, ui, signal))
      .then((session) => {
        if (signal.aborted) session?.dispose();
        else sessionRef.current = session;
      })
      .catch((error: unknown) => {
        // import() falhou (rede) ou erro inesperado ao montar: aviso, e o erro fica no console.
        console.error("[jogo] o runtime não abriu", error);
        ui.status("failed");
      });
    return () => {
      controller.abort();
      window.clearTimeout(lineTimer);
      sessionRef.current?.dispose();
      sessionRef.current = null;
    };
    // Os rótulos vêm do servidor e não mudam com o jogo aberto: a sessão não reabre por eles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status === "failed") backRef.current?.focus({ preventScroll: true });
    if (status === "stuck") retryRef.current?.focus({ preventScroll: true });
  }, [status]);

  // Lista aberta: foco no primeiro lugar disponível; fechada: o foco volta à casca (o teclado segue no jogo).
  useEffect(() => {
    if (status !== "live") return;
    if (places) placesRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
    else if (shellRef.current?.contains(document.activeElement) || document.activeElement === document.body) shellRef.current?.focus({ preventScroll: true });
  }, [places, status]);

  // Exame fechado (E, ⌫, botão direito ou o botão): o foco volta à casca, onde o teclado do jogo mora.
  useEffect(() => {
    // Só com o jogo vivo: num aviso de falha o foco é do botão de voltar (o efeito de status), não da casca.
    if (examine || status !== "live") return;
    if (shellRef.current?.contains(document.activeElement) || document.activeElement === document.body) shellRef.current?.focus({ preventScroll: true });
  }, [examine, status]);

  const onPlacesKey = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = buttons[(i + (e.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length];
    e.preventDefault();
    next?.focus();
  };

  return (
    <div ref={shellRef} data-game-shell role="region" aria-label={labels.region} tabIndex={-1}>
      <div ref={stageRef} data-game-stage />
      {status === "loading" && <p data-game-loading>{labels.loading}</p>}
      {status === "failed" && (
        <div data-game-fallback role="alert">
          <p>{labels.noWebgl}</p>
          <button ref={backRef} type="button" onClick={onExit} className="focus-ring">
            {labels.back}
          </button>
        </div>
      )}
      {status === "stuck" && (
        <div data-game-fallback role="alert">
          <p>{labels.stuck}</p>
          <button ref={retryRef} type="button" onClick={() => sessionRef.current?.retry()} className="focus-ring">
            {labels.retry}
          </button>
        </div>
      )}
      {places && (
        <nav data-game-places aria-label={labels.places}>
          <ul ref={placesRef} onKeyDown={onPlacesKey}>
            {places.map((p) => (
              <li key={p.id}>
                <button type="button" className="focus-ring" disabled={p.here} onClick={() => sessionRef.current?.choosePlace(p.id)}>
                  {p.name}
                  {p.here && <span data-game-here>{` · ${labels.here}`}</span>}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}
      {status === "live" && !examine && <div data-game-reticle data-state={reticle} aria-hidden="true" />}
      <Prompt text={prompt?.text ?? null} keyLabel={prompt?.key === "hold" ? (coarse ? labels.holdKeyTouch : labels.holdKey) : "E"} progress={prompt?.progress ?? null} />
      <div data-game-subtitles aria-live="polite">
        {paused && <p data-game-paused>{labels.paused}</p>}
        {line && !paused && <p data-game-line>{line.text}</p>}
      </div>
      <div data-game-overlay>
        {examine && <ExamineCard title={examine.title} text={examine.text} closeLabel={labels.examineClose} showKeys={!coarse} onClose={() => sessionRef.current?.closeExamine()} />}
      </div>
      <button type="button" data-game-exit onClick={onExit} className="focus-ring">
        {labels.exit}
      </button>
    </div>
  );
}
