"use client";

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import { soundEngine } from "@/interaction/sound/engine";
import { readTimeToken } from "@/lib/css-time";
import type { ActProps } from "../LimiarStage";
import { INSCRIPTION_COUNT, TIMING } from "../sequence";
import {
  FIRST_INSCRIPTION,
  advanceInscription,
  keyPitch,
  phraseStatus,
  phraseText,
  revealMs,
  splitWords,
  type InscriptionState,
} from "./inscriptions-plan";
import { attachKeyGuard } from "./key-guard";

type Point = { x: number; y: number };

/** Duração de cada palavra acendendo (o mesmo token da transição no CSS). */
const WORD_TOKEN = "--motion-slow";
const WORD_FALLBACK_MS = 500;

/**
 * Ato Inscrições (spec Limiar 3.4): as três frases de `labels.inscriptions`, uma por vez, palavra por palavra
 * (cada uma sai do borrado e de baixo, `TIMING.wordStaggerMs` entre elas, tique `key` subindo de 0,9 a 1,2).
 * A palavra-chave fica em `--sangue`; as frases anteriores esmaecem e encolhem. Avança com clique, espaço ou
 * Enter (o botão das frases, foco do palco) ou sozinho `TIMING.inscriptionAutoMs` depois de a frase acender;
 * avançar no meio do acendimento completa a frase. Tudo começa só depois da entrada (`entered`).
 * O texto inteiro das três frases está no DOM desde o início; um `aria-live` anuncia a frase atual.
 */
export function InscriptionsAct({ labels, done, reduced, entered }: ActProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const doneRef = useRef(done);
  const finishedRef = useRef(false);
  const phrases = useMemo(() => labels.inscriptions.slice(0, INSCRIPTION_COUNT), [labels.inscriptions]);
  const words = useMemo(() => phrases.map(splitWords), [phrases]);
  const [state, setState] = useState<InscriptionState>(FIRST_INSCRIPTION);
  const stateRef = useRef(state);
  const current = entered ? state.index : -1;

  useLayoutEffect(() => {
    doneRef.current = done;
    stateRef.current = state;
  }, [done, state]);

  const advance = (point?: Point) => {
    if (!entered || finishedRef.current) return;
    const next = advanceInscription(stateRef.current, phrases.length);
    if (next === "done") {
      finishedRef.current = true;
      doneRef.current(point);
      return;
    }
    stateRef.current = next;
    setState(next);
  };
  const advanceRef = useRef(advance);
  useLayoutEffect(() => {
    advanceRef.current = advance;
  });

  // Enter/espaço que vinham apertados do Gesto não avançam uma frase.
  useEffect(() => {
    const button = buttonRef.current;
    return button ? attachKeyGuard(button) : undefined;
  }, []);

  // Acendimento da frase atual: um tique por palavra (com movimento reduzido, um só) e o fim do acendimento.
  useEffect(() => {
    if (!entered || state.revealed) return;
    const phraseWords = words[state.index] ?? [];
    const timers: number[] = [];
    const total = reduced ? 0 : revealMs(phraseWords.length, TIMING.wordStaggerMs, readTimeToken(WORD_TOKEN, WORD_FALLBACK_MS));
    if (reduced) soundEngine.play("key", { pitch: keyPitch(0, 1) });
    else
      phraseWords.forEach((_, i) => {
        timers.push(
          window.setTimeout(
            () => soundEngine.play("key", { pitch: keyPitch(i, phraseWords.length) }),
            i * TIMING.wordStaggerMs,
          ),
        );
      });
    const index = state.index;
    timers.push(
      window.setTimeout(() => setState((s) => (s.index === index && !s.revealed ? { index, revealed: true } : s)), total),
    );
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [entered, reduced, state.index, state.revealed, words]);

  // Frase acesa: avança sozinha depois do prazo (recomeça a cada avanço manual).
  useEffect(() => {
    if (!entered || !state.revealed) return;
    const id = window.setTimeout(() => advanceRef.current(), TIMING.inscriptionAutoMs);
    return () => window.clearTimeout(id);
  }, [entered, state.index, state.revealed]);

  // Clique em qualquer ponto do ato, ou espaço/Enter no botão (clique de teclado, sem coordenadas).
  const onClick = (event: ReactMouseEvent<HTMLDivElement>) =>
    advance(event.detail > 0 ? { x: event.clientX, y: event.clientY } : undefined);

  const rootStyle = { "--limiar-palavra-passo": `${TIMING.wordStaggerMs}ms` } as CSSProperties;

  return (
    <div className="limiar-inscricoes" data-verbo={labels.readVerb} style={rootStyle} onClick={onClick}>
      <button ref={buttonRef} type="button" data-limiar-foco className="limiar-inscricoes__frases focus-ring">
        {words.map((phrase, i) => {
          const status = phraseStatus(i, current);
          return (
            <span
              key={i}
              className="limiar-inscricoes__frase"
              data-estado={status}
              data-acesa={status === "atual" && state.revealed ? "" : undefined}
              aria-hidden={status === "atual" ? undefined : true}
            >
              {phrase.map((word, j) => (
                <Fragment key={j}>
                  {word.space ? " " : null}
                  <span
                    className="limiar-inscricoes__palavra"
                    data-chave={word.key ? "" : undefined}
                    style={{ "--i": j } as CSSProperties}
                  >
                    {word.text}
                  </span>
                </Fragment>
              ))}
            </span>
          );
        })}
      </button>
      <p className="sr-only" aria-live="polite">
        {current >= 0 ? phraseText(phrases[current]) : ""}
      </p>
    </div>
  );
}
