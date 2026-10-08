"use client";

import gsap from "gsap";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { TransitionLink } from "@/components/ui/TransitionLink";
import { useViewTransition } from "@/hooks/useViewTransition";
import { vibrate } from "@/interaction/haptics";
import { useReadingMode } from "@/interaction/reading-mode/store";
import { relicStore } from "@/interaction/relics/store";
import { soundEngine } from "@/interaction/sound/engine";
import { useRoomAmbience } from "@/interaction/sound/useRoomAmbience";
import { ruina as copy } from "@/lib/content/copy";
import { useInView } from "@/rooms/shared/useInView";
import { NAME_HOVER, nameReaction } from "./nameHover";
import { CASE_NAV_DELAY_MS } from "./physics";
import type { Slab } from "./slabs";
import type { RuinaWorld } from "./world";

type RuinaProps = { siteName: string; slabs: Slab[] };

// Arena da Home (spec 7.2). O HTML em repouso é o conteúdo (h1 com o wordmark + lajes que são
// links); a física (matter-js, por import()) monta por cima e só aplica transform.
export function Ruina({ siteName, slabs }: RuinaProps) {
  const arenaRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<RuinaWorld | null>(null);
  const openingRef = useRef(false);
  const [ready, setReady] = useState(false);
  const reading = useReadingMode();
  const near = useInView(arenaRef, { rootMargin: "400px", once: true });
  const { push } = useViewTransition();
  const effects = !reading;
  useRoomAmbience("ruina");

  // Abrir o case pela arena: relíquia Case + flash de contorno --sangue + navegação.
  const openCase = (slab: HTMLElement) => {
    const slug = slab.dataset.slug;
    if (!slug || openingRef.current) return;
    openingRef.current = true;
    window.setTimeout(() => {
      openingRef.current = false;
    }, 1000);
    relicStore.unlock("case");
    const href = `/work/${slug}`;
    if (!effects) {
      push(href);
      return;
    }
    soundEngine.play("case");
    slab.classList.add("arena__laje--abrindo");
    gsap.fromTo(
      slab,
      { outlineWidth: 4 },
      { outlineWidth: 0, duration: 0.8, onComplete: () => slab.classList.remove("arena__laje--abrindo") },
    );
    window.setTimeout(() => push(href), CASE_NAV_DELAY_MS);
  };
  const onWorldDoubleTap = useEffectEvent((slab: HTMLElement) => openCase(slab));

  // Abertura do protótipo (salas.html 373–386): antes de desabar, as letras sobem e avermelham
  // perto do mouse. Só com ponteiro fino; desliga quando a física assume.
  useEffect(() => {
    const arena = arenaRef.current;
    if (!effects || !arena || !window.matchMedia("(pointer: fine)").matches) return;
    const name = arena.querySelector<HTMLElement>(".arena__nome");
    const glyphs = Array.from(arena.querySelectorAll<HTMLElement>('[data-piece="glyph"]'));
    if (!name || glyphs.length === 0) return;
    const rootStyle = getComputedStyle(document.documentElement);
    const hot = rootStyle.getPropertyValue("--sangue").trim();
    const calm = rootStyle.getPropertyValue("--osso").trim();
    const onMove = (event: PointerEvent) => {
      if (arena.dataset.live === "on") return;
      for (const glyph of glyphs) {
        const rect = glyph.getBoundingClientRect();
        const distance = Math.hypot(event.clientX - (rect.left + rect.width / 2), event.clientY - (rect.top + rect.height / 2));
        const { lift, hot: isHot } = nameReaction(distance);
        gsap.to(glyph, { y: lift, color: isHot ? hot : calm, duration: NAME_HOVER.tweenS, ease: "power3" });
      }
    };
    const onLeave = () => {
      if (arena.dataset.live === "on") return;
      gsap.to(glyphs, { y: 0, color: calm, duration: NAME_HOVER.leaveS, ease: "elastic.out(1, .4)", clearProps: "transform,color" });
    };
    name.addEventListener("pointermove", onMove);
    name.addEventListener("pointerleave", onLeave);
    return () => {
      name.removeEventListener("pointermove", onMove);
      name.removeEventListener("pointerleave", onLeave);
      if (arena.dataset.live !== "on") {
        gsap.killTweensOf(glyphs);
        gsap.set(glyphs, { clearProps: "transform,color" });
      }
    };
  }, [effects]);

  useEffect(() => {
    const arena = arenaRef.current;
    if (!effects || !near || !arena) return;
    let cancelled = false;
    let world: RuinaWorld | null = null;
    import("./world")
      .then(({ createRuinaWorld }) => {
        if (cancelled) return;
        world = createRuinaWorld(arena, {
          onCollapse: () => {
            soundEngine.play("collapse");
            soundEngine.noise("collapse");
          },
          onRestore: () => soundEngine.play("restore"),
          onGrab: () => {
            soundEngine.play("grab");
            vibrate(10);
          },
          onDrop: () => soundEngine.play("drop"),
          onThrow: () => relicStore.unlock("arremesso"),
          onImpact: (gain) => soundEngine.play("impact", { gain }),
          onDoubleTap: (slab) => onWorldDoubleTap(slab),
        });
        worldRef.current = world;
        setReady(true);
      })
      .catch(() => {
        // Sem o chunk da física, a arena fica no repouso (nome + links): nada a fazer.
      });
    return () => {
      cancelled = true;
      world?.dispose();
      worldRef.current = null;
    };
  }, [effects, near]);

  return (
    <div ref={arenaRef} className="arena" data-verbo={effects ? "arraste" : undefined}>
      {ready && effects && (
        <div className="arena__ui" data-arena-ui role="group" aria-label={copy.controlsLabel}>
          <button type="button" className="arena__btn focus-ring" onClick={() => worldRef.current?.collapse()}>
            {copy.collapse}
          </button>
          <button type="button" className="arena__btn focus-ring" onClick={() => worldRef.current?.restore()}>
            {copy.restore}
          </button>
        </div>
      )}
      <div className="arena__repouso">
        <h1 className="arena__nome">
          <span className="sr-only">{siteName}</span>
          {Array.from(siteName).map((letter, index) => (
            <span key={index} aria-hidden="true" className="arena__glifo" data-piece="glyph">
              {letter}
            </span>
          ))}
        </h1>
        <ul className="arena__lajes" aria-label={copy.slabsLabel}>
          {slabs.map((slab) => (
            <li key={slab.slug}>
              <TransitionLink
                href={`/work/${slab.slug}`}
                data-piece="slab"
                data-slug={slab.slug}
                draggable={false}
                className={`arena__laje arena__laje--${slab.tone} focus-ring`}
                onClick={(event) => {
                  // Modo leitura: link comum que também conta a relíquia. Com a física armada,
                  // o clique simples é para agarrar; abrir é duplo clique, toque duplo ou Enter.
                  if (!effects) {
                    relicStore.unlock("case");
                    return;
                  }
                  if (ready && event.detail !== 0) event.preventDefault();
                }}
                onDoubleClick={(event) => {
                  if (effects) openCase(event.currentTarget);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  openCase(event.currentTarget);
                }}
                onDragStart={(event) => event.preventDefault()}
              >
                {slab.title}
                <small>{slab.meta}</small>
              </TransitionLink>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
