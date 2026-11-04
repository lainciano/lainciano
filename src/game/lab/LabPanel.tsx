"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { PostMode } from "../runtime/engine";
import { startLab, type Lab, type LabSnapshot } from "./lab";
import { isLabId, LAB_IDS, labMeta, type LabGroup, type LabId } from "./registry";
import "./lab.css";

/**
 * Painel do laboratório de modelos (B2, só debug; montado pelo shell com `?debug=1&lab=1`). Rótulos literais aqui:
 * é ferramenta de desenvolvimento, não texto do jogo. `?model=<id>` abre direto; a escolha atualiza a URL. `onFailed`
 * deve ser estável (o efeito abre e fecha o laboratório por ele).
 */

const GROUP_LABEL: Record<LabGroup, string> = { cinza: "sala cinza", jogador: "jogador" };
const POST_MODES: { mode: PostMode; label: string }[] = [
  { mode: 0, label: "0 · gravura" },
  { mode: 1, label: "1 · PSX" },
  { mode: 2, label: "2 · ASCII" },
];

/** Pontos de vista das fotos de revisão (o olho em +z olha para −z: nas mãos, "frente" é o ombro do jogador). */
const VIEWS = [
  { name: "frente", yaw: 0, pitch: 0.05 },
  { name: "3/4", yaw: 0.6, pitch: 0.25 },
  { name: "lado", yaw: Math.PI / 2, pitch: 0.05 },
  { name: "trás", yaw: Math.PI, pitch: 0.05 },
  { name: "topo", yaw: 0, pitch: 1.4 },
];

const GROUPS = (Object.keys(GROUP_LABEL) as LabGroup[]).map((group) => ({ group, ids: LAB_IDS.filter((id) => labMeta(id).group === group) }));

const state = (ok: boolean | null) => (ok === null ? undefined : ok ? "ok" : "over");

export default function LabPanel({ host, onFailed }: { host: RefObject<HTMLDivElement | null>; onFailed: () => void }) {
  const labRef = useRef<Lab | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [snap, setSnap] = useState<LabSnapshot | null>(null);

  useEffect(() => {
    const stage = host.current;
    if (!stage) return;
    const controller = new AbortController();
    let unsubscribe: (() => void) | undefined;
    startLab(stage, { signal: controller.signal, onLost: () => onFailed(), inset: () => panelRef.current?.getBoundingClientRect().right ?? 0 })
      .then((lab) => {
        if (controller.signal.aborted) {
          lab?.dispose();
          return;
        }
        if (!lab) {
          onFailed();
          return;
        }
        labRef.current = lab;
        unsubscribe = lab.subscribe(setSnap);
        setSnap(lab.snapshot());
        const wanted = new URLSearchParams(window.location.search).get("model");
        void lab.select(isLabId(wanted) ? wanted : LAB_IDS[0]);
      })
      .catch((error: unknown) => {
        console.error("[lab] não abriu", error);
        if (!controller.signal.aborted) onFailed();
      });
    return () => {
      controller.abort();
      unsubscribe?.();
      labRef.current?.dispose();
      labRef.current = null;
    };
  }, [host, onFailed]);

  const choose = (id: LabId) => {
    const url = new URL(window.location.href);
    url.searchParams.set("model", id);
    window.history.replaceState(window.history.state, "", url);
    void labRef.current?.select(id);
  };

  const stats = snap?.stats ?? null;
  const verdict = snap?.withinBudget ?? null;

  return (
    <aside ref={panelRef} data-lab-panel aria-label="laboratório de modelos">
      <h2>laboratório de modelos</h2>
      <p>arrastar gira · roda aproxima · debug</p>
      {GROUPS.map(({ group, ids }) => (
        <section key={group} aria-label={GROUP_LABEL[group]}>
          <h3>{GROUP_LABEL[group]}</h3>
          <ul data-lab-list>
            {ids.map((id) => (
              <li key={id}>
                <button type="button" className="focus-ring" data-lab-model={id} aria-pressed={snap?.id === id} title={labMeta(id).label} onClick={() => choose(id)}>
                  {id}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section aria-label="números do modelo" data-lab-numbers aria-live="polite">
        <h3>números</h3>
        {snap?.status === "loading" && <p data-lab-status>montando…</p>}
        {snap?.status === "error" && <p role="alert">{snap.error}</p>}
        {stats && snap && (
          <>
            <p data-lab-verdict data-state={state(verdict)}>
              {verdict ? "dentro do orçamento" : "estourou o orçamento"}
            </p>
            <dl>
              <dt>triângulos</dt>
              <dd>
                <span data-lab-stat="triangles" data-state={state(snap.budget ? stats.triangles <= snap.budget.triangles : null)}>
                  {stats.triangles}
                </span>{" "}
                / {snap.budget?.triangles}
              </dd>
              <dt>chamadas</dt>
              <dd>
                <span data-lab-stat="calls" data-state={state(snap.budget ? stats.calls <= snap.budget.calls : null)}>
                  {stats.calls}
                </span>{" "}
                / {snap.budget?.calls}
              </dd>
              {snap.goal && (
                <>
                  <dt>meta do plano</dt>
                  <dd data-lab-stat="goal" data-state={state(snap.withinGoal)}>
                    ≤ {snap.goal.triangles} tri · ≤ {snap.goal.calls} ch. · {snap.withinGoal ? "ok" : "acima"}
                  </dd>
                </>
              )}
              <dt>malhas</dt>
              <dd data-lab-stat="meshes">{stats.meshes}</dd>
              <dt>materiais</dt>
              <dd data-lab-stat="materials" title={Object.entries(stats.materialTypes).map(([t, n]) => `${t}×${n}`).join(", ")}>
                {stats.materials}
              </dd>
              <dt>texturas</dt>
              <dd data-lab-stat="textures" title={stats.textures.map((t) => `${t.name || "?"} ${t.size}px`).join(", ")}>
                {stats.textures.length}
                {stats.textures.length > 0 && ` (${[...new Set(stats.textures.map((t) => t.size))].sort((a, b) => a - b).join("/")} px)`}
              </dd>
              {snap.sizeCm && (
                <>
                  <dt>medidas</dt>
                  <dd data-lab-stat="size">{snap.sizeCm.map((v) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })).join(" × ")} cm</dd>
                </>
              )}
            </dl>
          </>
        )}
      </section>

      <section aria-label="ferramentas">
        <h3>vista</h3>
        <div data-lab-tools>
          <button type="button" className="focus-ring" data-lab-tool="wireframe" aria-pressed={snap?.wireframe ?? false} onClick={() => labRef.current?.setWireframe(!snap?.wireframe)}>
            wireframe
          </button>
          <button type="button" className="focus-ring" data-lab-tool="reset" onClick={() => labRef.current?.resetView()}>
            recentrar
          </button>
        </div>
        <div data-lab-tools role="group" aria-label="pontos de vista">
          {VIEWS.map(({ name, yaw, pitch }) => (
            <button key={name} type="button" className="focus-ring" data-lab-view={name} onClick={() => labRef.current?.setView({ yaw, pitch })}>
              {name}
            </button>
          ))}
        </div>
        <h3>pós</h3>
        <div data-lab-tools role="group" aria-label="modo de pós">
          {POST_MODES.map(({ mode, label }) => (
            <button key={mode} type="button" className="focus-ring" data-lab-post={mode} aria-pressed={snap?.post === mode} onClick={() => labRef.current?.setPost(mode)}>
              {label}
            </button>
          ))}
        </div>
        <h3>luz</h3>
        <div data-lab-tools>
          <button
            type="button"
            className="focus-ring"
            data-lab-tool="spin"
            aria-pressed={snap?.spin ?? false}
            disabled={snap?.reduced ?? false}
            title={snap?.reduced ? "movimento reduzido: a luz não gira sozinha" : undefined}
            onClick={() => labRef.current?.setSpin(!snap?.spin)}
          >
            girar
          </button>
        </div>
        <input
          type="range"
          className="focus-ring"
          aria-label="ângulo da luz"
          min={0}
          max={Math.round(Math.PI * 2 * 100) / 100}
          step={0.05}
          value={(((snap?.light ?? 0) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)}
          onChange={(e) => labRef.current?.setLight(Number(e.target.value))}
        />
      </section>
    </aside>
  );
}
