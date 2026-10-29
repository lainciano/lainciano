"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { GameLabels } from "../labels";
import type { Line } from "../layers/types";
import type { PromptModel } from "../interaction/targeting";
import type { ExamineInfo, PlaceItem, Session, SessionStatus } from "../runtime/session";
import type { PhoneRect, PhoneView } from "../runtime/phone";
import type { Settings } from "../save/schema";
import ExamineCard from "./ExamineCard";
import Phone from "./Phone";
import Reader from "./Reader";
import Prompt from "./Prompt";
import type { ReaderView } from "./readerFlow";
import Subtitles from "./Subtitles";
import { lineDuration } from "./subtitles";
import { createLineQueue, tierOf, TIER } from "./lineQueue";
import "./shell.css";
import { useGameSession } from "./useGameSession";

/**
 * Pré-carga ociosa do pincel do papel (o primeiro `E` no bilhete já pinta sem esperar a rede). O leitor em si mora no
 * chunk da casca (~1,3 KB): um chunk próprio que falhasse ficaria falho para sempre (o navegador guarda o import()
 * que falhou), e "tente de novo" seria mentira. Se o papel não chegar, o leitor mostra o texto limpo.
 */
function preloadPaper(): void {
  import("../render/paper").catch(() => {
    /* sem rede agora: o leitor cai no texto limpo */
  });
}

/** Movimento reduzido ao vivo: a legenda aparece direta, sem palavra a palavra. */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true);
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

/**
 * Casca do jogo: um painel fixo sobre o site (irmão do .page-shell, fora do template). A sessão (engine, camada,
 * jogador, entrada) chega por import() junto com o three e só pede à casca o que mostrar: carregando, falha,
 * "a porta emperrou", a lista de lugares (L), "pausado", a fala (legendas) e o leitor de documentos. Sem WebGL, sem slot ou com o contexto perdido:
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
  /** A fala da casca (com o temporizador dela) para quem está fora do efeito da sessão. */
  const sayRef = useRef<((l: Line) => void) | null>(null);
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [places, setPlaces] = useState<PlaceItem[] | null>(null);
  const [paused, setPaused] = useState(false);
  const [line, setLine] = useState<Line | null>(null);
  const [lineSeq, setLineSeq] = useState(0);
  const [reader, setReader] = useState<ReaderView | null>(null);
  const [phone, setPhone] = useState<PhoneView | null>(null);
  // a tela do aparelho anda quadro a quadro: vai direto ao elemento do LCD (sem estado do React)
  const phoneRectRef = useRef<PhoneRect | null>(null);
  const phoneRectSink = useRef<((r: PhoneRect | null) => void) | null>(null);
  const [readPhoneRect] = useState(() => () => phoneRectRef.current);
  const [setPhoneRectSink] = useState(() => (sink: ((r: PhoneRect | null) => void) | null) => {
    phoneRectSink.current = sink;
  });
  // Legendas desligadas nos ajustes do celular: some a fala e o som; as dicas do jogo (sistema) ficam.
  const subtitlesRef = useRef(true);
  const reduced = useReducedMotion();
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
    // Fila curta com prioridade (T12): pista e aviso de sistema nunca cortam a fala da história.
    const queue = createLineQueue((l) => lineDuration(l.text));
    const clock = () => performance.now() / 1000;
    const schedule = () => {
      window.clearTimeout(lineTimer);
      if (queue.current()) lineTimer = window.setTimeout(expire, Math.max(0, queue.until() - clock()) * 1000);
    };
    /** Fala nova na tela (mesmo texto de novo, inclusive, recomeça a entrada); `null` limpa. */
    const show = (l: Line | null) => {
      setLine(l);
      if (l) setLineSeq((n) => n + 1);
      schedule();
    };
    function expire() {
      if (signal.aborted) return;
      const before = queue.current();
      const next = queue.expire(clock());
      if (next && next === before) schedule();
      else show(next);
    }
    const clearLines = () => {
      queue.clear();
      window.clearTimeout(lineTimer);
      setLine(null);
    };
    const ui = {
      status: (s: SessionStatus) => {
        if (signal.aborted) return;
        setStatus(s);
        // Fora de "live" (contexto perdido, erro, tentar de novo) nada da cena fica na tela: cartão, aviso, lista, mira.
        if (s !== "live") {
          setExamine(null);
          setReader(null);
          setPhone(null);
          setPrompt(null);
          setPlaces(null);
          setReticle("off");
          clearLines();
          setPaused(false);
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
        // Legendas desligadas: some a fala da história; as pistas (sem voz até a T13) e os avisos ficam.
        if (!subtitlesRef.current && tierOf(l) === TIER.story) return;
        // O tempo na tela cresce com o texto (bíblia 12b.2); a fila decide se entra agora ou espera.
        const now = queue.offer(l, clock());
        if (now) show(now);
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
      reader: (view: ReaderView | null) => {
        if (!signal.aborted) setReader(view);
      },
      phone: (view: PhoneView | null) => {
        if (!signal.aborted) setPhone(view);
      },
      phoneRect: (r: PhoneRect | null) => {
        phoneRectRef.current = r;
        if (!signal.aborted) phoneRectSink.current?.(r);
      },
      settings: (s: Settings) => {
        if (signal.aborted) return;
        subtitlesRef.current = s.subtitles;
        const cur = queue.current();
        if (!s.subtitles && cur && tierOf(cur) === TIER.story) clearLines();
      },
      exit: () => {
        if (!signal.aborted) onExit();
      },
      notice: (n: { kind: "nothing" } | { kind: "hold"; verb: string }) => {
        const hold = coarse ? labels.holdHintTouch : labels.holdHint;
        const text = n.kind === "nothing" ? labels.nothingHere : hold.replace("{verb}", n.verb);
        ui.say({ text, kind: "system" });
      },
    };
    sayRef.current = ui.say;
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
    if (status !== "live") return;
    // Jogo vivo: o papel baixa no ocioso (sem disputar o primeiro quadro).
    const idle = window.requestIdleCallback?.(preloadPaper, { timeout: 4000 });
    const timer = idle === undefined ? window.setTimeout(preloadPaper, 1500) : 0;
    return () => {
      if (idle !== undefined) window.cancelIdleCallback?.(idle);
      window.clearTimeout(timer);
    };
  }, [status]);

  // Lista aberta: foco no primeiro lugar disponível; fechada: o foco volta à casca (o teclado segue no jogo).
  const prevPlaces = useRef<PlaceItem[] | null>(null);
  useEffect(() => {
    // Só quando a lista mudou de fato (abrir/fechar): ir para "live" não mexe no foco de um botão da casca.
    const changed = prevPlaces.current !== places;
    prevPlaces.current = places;
    if (!changed || status !== "live") return;
    if (places) placesRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
    else if (shellRef.current?.contains(document.activeElement) || document.activeElement === document.body) shellRef.current?.focus({ preventScroll: true });
  }, [places, status]);

  // Exame ou leitor fechado (E, ⌫, botão direito ou o botão): o foco volta à casca, onde o teclado do jogo mora.
  const prevPanel = useRef(false);
  useEffect(() => {
    // Só quando o painel fechou de fato e com o jogo vivo: num aviso de falha o foco é do botão de voltar (o efeito
    // de status), e a transição para "live" não rouba o foco de ninguém.
    const open = examine !== null || reader !== null || phone !== null;
    const closed = prevPanel.current && !open;
    prevPanel.current = open;
    // Com o celular embaixo do leitor, quem cuida do foco é o celular (volta ao mesmo item).
    if (!closed || status !== "live") return;
    if (shellRef.current?.contains(document.activeElement) || document.activeElement === document.body) shellRef.current?.focus({ preventScroll: true });
  }, [examine, reader, phone, status]);

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
      {coarse && status === "live" && !examine && !reader && !phone && !places && (
        <div data-game-touch-tools>
          <button type="button" className="focus-ring" aria-label={labels.phone.places} onClick={() => sessionRef.current?.openPlaces()}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 21s-6-5.6-6-10.2A6 6 0 0 1 18 10.8C18 15.4 12 21 12 21z" />
              <circle cx="12" cy="10.5" r="2.2" />
            </svg>
          </button>
          <button type="button" className="focus-ring" aria-label={labels.phone.open} onClick={() => sessionRef.current?.openPhone()}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="7" y="2.5" width="10" height="19" rx="1.5" />
              <rect x="9" y="5" width="6" height="6" />
              <path d="M9 14h6M9 17h6" />
            </svg>
          </button>
        </div>
      )}
      {status === "live" && !examine && !reader && !phone && <div data-game-reticle data-state={reticle} aria-hidden="true" />}
      <Prompt
        text={prompt?.text ?? null}
        keyLabel={prompt?.key === "hold" ? (coarse ? labels.holdKeyTouch : labels.holdKey) : "E"}
        progress={prompt?.progress ?? null}
        at={prompt?.at ?? null}
      />
      <Subtitles line={line} seq={lineSeq} reduced={reduced} notice={paused ? labels.paused : null} />
      <div data-game-overlay>
        {examine && <ExamineCard title={examine.title} text={examine.text} closeLabel={labels.examineClose} showKeys={!coarse} onClose={() => sessionRef.current?.closeExamine()} />}
      </div>
      {phone && (
        <Phone
          view={phone}
          labels={labels.phone}
          covered={reader !== null}
          reduced={reduced}
          rect={readPhoneRect}
          onRect={setPhoneRectSink}
          onNav={(a) => sessionRef.current?.phoneNav(a)}
        />
      )}
      {reader && (
        <Reader
          onPaperFailed={() => sayRef.current?.({ text: labels.readerFailed, kind: "system" })}
          view={reader}
          origin={readPhoneRect}
          network={labels.phone.network}
          readLabel={labels.readerRead}
          paperLabel={labels.readerPaper}
          closeLabel={labels.readerClose}
          showKeys={!coarse}
          onToggle={() => sessionRef.current?.toggleReader()}
          onClose={() => sessionRef.current?.closeReader()}
        />
      )}
      <button type="button" data-game-exit onClick={onExit} className="focus-ring">
        {labels.exit}
      </button>
    </div>
  );
}
