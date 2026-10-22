"use client";

import { useEffect } from "react";
import { ambienceDirector } from "@/interaction/sound/ambience";
import { pauseLenis, resumeLenis } from "@/lib/lenis-bridge";

const OWNER = "game";
// O que o jogo esconde do site: o conteúdo da página e a faixa do HUD (que fica fora do .page-shell).
const BEHIND = [".page-shell", "header.hud"];

type Restore = () => void;

function hideBehind(): Restore {
  const undo: Restore[] = [];
  for (const selector of BEHIND) {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) continue;
    const hadInert = el.hasAttribute("inert");
    const prevHidden = el.getAttribute("aria-hidden");
    el.setAttribute("inert", "");
    el.setAttribute("aria-hidden", "true");
    undo.push(() => {
      if (!hadInert) el.removeAttribute("inert");
      if (prevHidden === null) el.removeAttribute("aria-hidden");
      else el.setAttribute("aria-hidden", prevHidden);
    });
  }
  return () => undo.forEach((fn) => fn());
}

/**
 * Sessão do jogo aberto: tudo que o site precisa ceder (rolagem, ambiência, foco, tela cheia) e devolver
 * na ordem inversa ao fechar. Não importa react-dom: o módulo mora no chunk lazy do shell.
 */
export function useGameSession(): void {
  useEffect(() => {
    const root = document.documentElement;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    pauseLenis(OWNER);
    ambienceDirector.hold();
    const showSite = hideBehind();
    root.dataset.game = "open";
    // Pedido no gesto que abriu (clique, tecla ou comando); sem gesto ou sem suporte o jogo segue em janela.
    // Se o jogo fechar antes de a promessa resolver, a tela cheia que chegar atrasada sai na hora.
    let closed = false;
    const leaveFullscreen = () => {
      if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
    };
    if (!document.fullscreenElement) {
      void root.requestFullscreen?.().then(
        () => {
          if (closed) leaveFullscreen();
        },
        () => {},
      );
    }

    return () => {
      closed = true;
      leaveFullscreen();
      delete root.dataset.game;
      showSite();
      ambienceDirector.release();
      resumeLenis(OWNER);
      // O foco volta a quem abriu, se ainda existir (o site estava inerte e perdeu o foco).
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
}
