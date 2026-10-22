"use client";

import { useEffect, useRef, useState } from "react";
import type { GameLabels } from "../labels";
import type { Engine } from "../runtime/engine";
import "./shell.css";
import { useGameSession } from "./useGameSession";

type StageStatus = "loading" | "live" | "failed";

// O save lê o localStorage a cada chamada (o store já trata a exceção de storage bloqueado).
const lazyStorage = {
  getItem: (key: string) => window.localStorage.getItem(key),
  setItem: (key: string, value: string) => window.localStorage.setItem(key, value),
  removeItem: (key: string) => window.localStorage.removeItem(key),
  key: (index: number) => window.localStorage.key(index),
  get length() {
    return window.localStorage.length;
  },
};

/**
 * Casca do jogo: um painel fixo sobre o site (irmão do .page-shell, fora do template). O palco recebe o
 * canvas do runtime (three chega por import() dentro do engine); as camadas de UI (prompt, legendas, painéis)
 * ficam sobre ele. Sem WebGL, sem slot no orçamento ou com o contexto perdido: aviso e botão de voltar ao site,
 * e nenhum loop fica rodando.
 * Esc nunca fecha: o navegador reserva a tecla; sair é o botão (e, depois, o menu do jogo).
 */
export default function GameShell({ labels, onExit }: { labels: GameLabels; onExit: () => void }) {
  const shellRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const [status, setStatus] = useState<StageStatus>("loading");
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
    let engine: Engine | null = null;
    let uninstallDebug = () => {};
    let disposeShot = () => {};
    let lost = false;
    const fail = () => {
      if (!signal.aborted) setStatus("failed");
    };

    // Runtime, three, save (zod) e debug chegam juntos por import(): o chunk do shell (e a lista de chunks
    // que o JS inicial guarda para ele) não cresce.
    const boot = async () => {
      const [{ createEngine }, { installDebug, loadShot }, { createSaveStore }] = await Promise.all([
        import("../runtime/engine"),
        import("../runtime/debug"),
        import("../save/store"),
      ]);
      if (signal.aborted) return;
      const save = createSaveStore(lazyStorage, Date.now);
      const created = await createEngine(host, {
        coarse: window.matchMedia("(pointer: coarse)").matches,
        settings: save.get().settings,
        signal,
        // O loop já parou; o engine é descartado já (slot e canvas), o aviso fica até sair.
        onLost: () => {
          lost = true;
          engine?.dispose();
          fail();
        },
      });
      if (signal.aborted) {
        // Desmontou enquanto o runtime chegava (StrictMode, sair rápido): o engine tardio morre aqui.
        created?.dispose();
        return;
      }
      if (!created) return fail();
      engine = created;
      uninstallDebug = installDebug(created, () => save.get().layer, save.get);
      // Cena de referência de debug (`?debug=1&shot=psx-ref`): entra antes do start para ser compilada junto.
      const shot = await loadShot(created, window.location.search, signal);
      if (signal.aborted) {
        // O cleanup já rodou: a cena montada no meio do caminho morre aqui.
        shot?.();
        return;
      }
      if (shot) disposeShot = shot;
      // Compila cena e pós antes do primeiro quadro; o "carregando" fica na tela até aqui.
      await created.start();
      if (signal.aborted) return;
      if (lost) {
        created.dispose();
        return fail();
      }
      setStatus("live");
    };
    boot().catch((error: unknown) => {
      // import() falhou (rede) ou erro inesperado ao montar: aviso, e o erro fica no console.
      console.error("[jogo] o runtime não abriu", error);
      fail();
    });

    return () => {
      controller.abort();
      uninstallDebug();
      disposeShot();
      engine?.dispose();
      engine = null;
    };
  }, []);

  useEffect(() => {
    if (status === "failed") backRef.current?.focus({ preventScroll: true });
  }, [status]);

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
      <div data-game-prompt />
      <div data-game-subtitles aria-live="polite" />
      <div data-game-overlay />
      <button type="button" data-game-exit onClick={onExit} className="focus-ring">
        {labels.exit}
      </button>
    </div>
  );
}
