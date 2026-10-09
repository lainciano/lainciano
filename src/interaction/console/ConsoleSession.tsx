"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { readingStore, useReadingMode } from "@/interaction/reading-mode/store";
import { RELICS, getRelic } from "@/interaction/relics/catalog";
import { relicStore, useRelics } from "@/interaction/relics/store";
import { soundEngine, useSoundEnabled } from "@/interaction/sound/engine";
import { keyPitch } from "@/interaction/sound/sfx";
import { copyText } from "@/lib/clipboard";
import { terminal as copy } from "@/lib/content/copy";
import { navigateWithTransition } from "@/lib/navigation";
import { COMMANDS, argOptions, runCommand, type ConsoleEffect, type ConsoleLine } from "./commands";
import { useConsoleData } from "./data";
import { complete, historyDown, historyUp, pushHistory } from "./parse";
import { consoleStore } from "./store";

/** Espera o fechamento animado do sobreposto (--motion-console-out) antes de navegar. */
const CLOSE_MS = 200;

type Line = ConsoleLine & { id: number };

type ConsoleSessionProps = {
  /** Primeira linha da saída. */
  greeting: string;
  /** Embutido na página (Contato, 404): `/` foca este console em vez de abrir o sobreposto. */
  inline?: boolean;
  /** Foca o campo ao montar (o sobreposto carrega a sessão já aberto). */
  autoFocus?: boolean;
  /** Antes de navegar (o sobreposto fecha). */
  onNavigate?: () => void;
  /** Só no sobreposto: botão "fechar" na linha de topo. */
  onClose?: () => void;
  className?: string;
};

// Ids das linhas: o 0 é a saudação; os novos nascem só em handlers (nunca durante a renderização).
let lineSeq = 0;
const withId = (line: ConsoleLine): Line => ({ ...line, id: (lineSeq += 1) });

// Console da Cripta (spec 8.6): a mesma sessão no <dialog> global, no Contato e no 404.
export function ConsoleSession({ greeting, inline = false, autoFocus = false, onNavigate, onClose, className = "" }: ConsoleSessionProps) {
  const data = useConsoleData();
  const router = useRouter();
  const pathname = usePathname();
  const { won, platinumAt } = useRelics();
  const sound = useSoundEnabled();
  const reading = useReadingMode();
  const inputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<Line[]>(() => [{ id: 0, kind: "res", text: greeting }]);
  const [value, setValue] = useState("");

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (!inline) return;
    return consoleStore.registerInline({
      focus: () => {
        const input = inputRef.current;
        if (!input) return;
        input.focus({ preventScroll: true });
        input.scrollIntoView({ block: "center", behavior: readingStore.getSnapshot() ? "auto" : "smooth" });
      },
    });
  }, [inline]);

  // Linha nova sempre visível (a saída rola sozinha; a página não).
  useEffect(() => {
    const output = outputRef.current;
    if (output) output.scrollTop = output.scrollHeight;
  }, [lines]);

  const append = (next: ConsoleLine[]) => {
    const fresh = next.map(withId);
    setLines((current) => [...current, ...fresh]);
  };

  const apply = (effect: ConsoleEffect) => {
    switch (effect.type) {
      case "navigate":
        // Mesma rota: o pathname não muda, então o ScrollBridge nunca retomaria o Lenis (página travada).
        if (effect.href === pathname) {
          append([{ kind: "res", text: copy.alreadyHere }]);
          return;
        }
        if (onNavigate) {
          // O sobreposto fecha primeiro e só então a transição de rota começa.
          onNavigate();
          window.setTimeout(() => navigateWithTransition(router, effect.href), CLOSE_MS);
        } else {
          navigateWithTransition(router, effect.href);
        }
        return;
      case "copy":
        void copyText(effect.text).then((copied) => {
          append([{ kind: copied ? "res" : "err", text: copied ? copy.copied : copy.copyFailed }]);
          if (copied) soundEngine.play("copy");
        });
        return;
      case "unlock":
        if (!won.includes(effect.id)) {
          // O aviso (Toast) fica sob o <dialog> do top layer: a relíquia também é anunciada no log.
          append([{ kind: "res", text: copy.relicWon(getRelic(effect.id).name, won.length + 1, RELICS.length) }]);
        }
        relicStore.unlock(effect.id);
        return;
      case "sound":
        soundEngine.setEnabled(effect.on);
        return;
      case "reading":
        readingStore.set(effect.on ? "on" : "off");
        return;
      case "clear":
        setLines([]);
        return;
    }
  };

  const run = (raw: string) => {
    const result = runCommand(raw, data, { won, sound, reading, platinum: platinumAt !== null });
    if (!result) return;
    consoleStore.setHistory(pushHistory(consoleStore.getHistory(), raw));
    if (!result.effects.some((effect) => effect.type === "clear")) {
      append([{ kind: "cmd", text: raw.trim() }, ...result.lines]);
    }
    soundEngine.play(result.status); // "ok" | "error" | "denied" são nomes de SFX (Task 1)
    if (result.status === "ok") relicStore.unlock("terminal");
    result.effects.forEach(apply);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowUp") {
      const up = historyUp(consoleStore.getHistory());
      if (up.value === null) return;
      event.preventDefault();
      consoleStore.setHistory(up.history);
      setValue(up.value);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const down = historyDown(consoleStore.getHistory());
      consoleStore.setHistory(down.history);
      setValue(down.value);
      return;
    }
    if (event.key === "Tab" && !event.shiftKey) {
      const completion = complete(value, COMMANDS, (command) => argOptions(command, data));
      if (completion.value === value && completion.options.length === 0) return; // nada a completar: Tab sai
      event.preventDefault();
      setValue(completion.value);
      if (completion.options.length > 0) append([{ kind: "res", text: completion.options.join("  ") }]);
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) soundEngine.play("key", { pitch: keyPitch() });
  };

  return (
    <section className={`console ${className}`.trim()} data-verbo="digite" aria-label={copy.overlayLabel}>
      <div className="console__topo">
        <span>{copy.title}</span>
        {onClose ? (
          <button type="button" className="console__fechar focus-ring" onClick={onClose}>
            {copy.close} <kbd>Esc</kbd>
          </button>
        ) : (
          <span>{copy.hint}</span>
        )}
      </div>
      <div ref={outputRef} className="console__saida" role="log" data-lenis-prevent>
        {lines.map((line) => (
          <p key={line.id} className={`console__linha console__linha--${line.kind}`}>
            {line.kind === "cmd" && (
              <span className="console__prompt" aria-hidden="true">
                {copy.prompt}{" "}
              </span>
            )}
            {line.text}
          </p>
        ))}
      </div>
      <form
        className="console__form"
        autoComplete="off"
        onSubmit={(event) => {
          event.preventDefault();
          run(value);
          setValue("");
        }}
      >
        <span className="console__rotulo" aria-hidden="true">
          {copy.promptShort}
        </span>
        <input
          ref={inputRef}
          className="console__input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          enterKeyHint="send"
          placeholder={copy.placeholder}
          aria-label={copy.inputLabel}
        />
      </form>
    </section>
  );
}
