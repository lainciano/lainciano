import { mkdirSync, writeFileSync } from "node:fs";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import { lightGame } from "./helpers/light";

// T13: desempenho e vazamento do jogo. Só desktop (o marco mobile é dos aparelhos do dono). Tudo aqui é REGRESSÃO,
// não meta: o headless usa SwiftShader (CPU), então fps e tempos só dizem "ficou pior que antes" na MESMA máquina.
// Saídas: `test-results/game-bytes.json` (pacote do jogo) e `test-results/game-perf.json` (fps, tempos, memória).
// Atenção: o Playwright limpa `test-results/` no início de cada execução; o ledger guarda o número que valeu.

type Mem = { geometries: number; textures: number };
type CriptaWindow = Window & {
  __cripta?: { fps: { p50: number; p95: number }; renderer: { frames: number; programs: number; memory: Mem } };
  __gl: { created: number; lost: number };
};

const OUT = "test-results";
const write = (name: string, data: unknown) => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/${name}`, `${JSON.stringify(data, null, 2)}\n`);
};

test.describe.configure({ timeout: 900_000 });

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "medição de base é no desktop; celular é do aparelho do dono");
  await lightGame(page, testInfo);
  await page.route("**/api/run", (route) =>
    route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ runId: "e2e", issuedAt: 0, token: "e2e" }) }));
  await page.addInitScript(() => {
    // Limiar fora do caminho (chave de som gravada) e jogo ativado: as aberturas são pelo console, como o visitante faz.
    if (!localStorage.getItem("lainciano:som:v1")) localStorage.setItem("lainciano:som:v1", "off");
    localStorage.setItem("lainciano:jogo:v1", "on");
    // Conta os contextos WebGL do jogo e os que foram soltos.
    const w = window as unknown as CriptaWindow;
    w.__gl = { created: 0, lost: 0 };
    const seen = new WeakSet<HTMLCanvasElement>();
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      const ctx = (original as (...args: unknown[]) => RenderingContext | null).call(this, type, ...rest);
      if (ctx && type.startsWith("webgl") && this.hasAttribute("data-game-canvas") && !seen.has(this)) {
        seen.add(this);
        w.__gl.created += 1;
        this.addEventListener("webglcontextlost", () => {
          w.__gl.lost += 1;
        });
      }
      return ctx;
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
});

async function hydrated(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => {
    const main = document.querySelector("main");
    return !!main && Object.keys(main).some((key) => key.startsWith("__reactFiber"));
  });
}

const shell = (page: Page) => page.locator("[data-game-shell]");

/** Abre pelo console (`/`, `jogo`, Enter) e devolve o `performance.now()` do instante do Enter. */
async function openByConsole(page: Page): Promise<number> {
  await page.locator("body").press("/");
  const input = page.locator(".console-overlay input");
  await expect(input).toBeVisible();
  await input.fill("jogo");
  const t0 = await page.evaluate(() => performance.now());
  await input.press("Enter");
  await expect(shell(page)).toBeVisible();
  return t0;
}

/** Marca `cripta:<nome>` (instante em ms do documento) da N-ésima ocorrência, ou `null`. */
const markAt = (page: Page, name: string, nth = 0) =>
  page.evaluate(([n, i]) => performance.getEntriesByName(`cripta:${n}`)[i]?.startTime ?? null, [name, nth] as const);

/** Jogo no ar: palco com canvas, sem "carregando", quadros contados e o celular já pré-compilado (`cripta:warm`). */
async function liveAndWarm(page: Page, cycle: number) {
  await expect(page.locator("[data-game-stage] canvas")).toHaveCount(1);
  await expect(page.locator("[data-game-loading]")).toHaveCount(0, { timeout: 90_000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as CriptaWindow).__cripta?.fps.p50 ?? 0), { timeout: 60_000 }).toBeGreaterThan(0);
  await expect.poll(() => markAt(page, "warm", cycle - 1), { timeout: 30_000 }).not.toBeNull();
}

const memory = (page: Page) =>
  page.evaluate(() => {
    const r = (window as unknown as CriptaWindow).__cripta!.renderer;
    return { geometries: r.memory.geometries, textures: r.memory.textures, programs: r.programs };
  });

const counts = (page: Page) =>
  page.evaluate(() => ({
    canvases: document.querySelectorAll("canvas").length,
    gameCanvases: document.querySelectorAll("[data-game-shell] canvas").length,
    // nós do site sem o console (o log dele cresce uma linha por comando que este teste digita para abrir o jogo)
    nodes: [...document.querySelectorAll("*")].filter((n) => !n.closest(".console-overlay")).length,
    ...(window as unknown as CriptaWindow).__gl,
  }));

test("@slow 20 ciclos abrir/fechar: memória do renderer estável, nenhum canvas nem contexto órfão; registra fps (regressão)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/?debug=1");
  await hydrated(page);
  const site = await counts(page);

  const cycles: { geometries: number; textures: number; programs: number; nodesClosed: number }[] = [];
  const CYCLES = 20;
  for (let cycle = 1; cycle <= CYCLES; cycle++) {
    await openByConsole(page);
    await liveAndWarm(page, cycle);
    // as geometrias de mão que só entram no quadro na 1ª vez que a pose aparece: espera estabilizar (2 leituras iguais)
    let last = await memory(page);
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(400);
      const now = await memory(page);
      if (now.geometries === last.geometries && now.textures === last.textures && now.programs === last.programs) break;
      last = now;
    }
    const mem = await memory(page);
    const open = await counts(page);
    expect(open.gameCanvases, `ciclo ${cycle}: um canvas no jogo`).toBe(1);
    expect(open.canvases, `ciclo ${cycle}: site + 1`).toBe(site.canvases + 1);
    expect(open.created, `ciclo ${cycle}: um contexto novo por abertura`).toBe(cycle);

    await shell(page).getByRole("button", { name: "Sair do jogo" }).click();
    await expect(shell(page)).toHaveCount(0);
    await expect.poll(async () => (await counts(page)).lost, { message: `ciclo ${cycle}: contexto solto` }).toBe(cycle);
    const closed = await counts(page);
    expect(closed.canvases, `ciclo ${cycle}: só os canvas do site`).toBe(site.canvases);
    expect(closed.created, `ciclo ${cycle}: sem contexto a mais`).toBe(cycle);
    cycles.push({ ...mem, nodesClosed: closed.nodes });
  }

  // 21ª abertura, só para o fps (andar muda o lugar salvo e, com ele, o que está no quadro: por isso fica fora dos 20
  // ciclos de memória, que têm de começar sempre da mesma vista). REGRESSÃO na mesma máquina, não meta.
  await openByConsole(page);
  await liveAndWarm(page, CYCLES + 1);
  await page.waitForTimeout(3000);
  const fpsStill = await page.evaluate(() => ({ ...(window as unknown as CriptaWindow).__cripta!.fps }));
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(3000);
  const fpsWalking = await page.evaluate(() => ({ ...(window as unknown as CriptaWindow).__cripta!.fps }));
  await page.keyboard.up("KeyW");
  await shell(page).getByRole("button", { name: "Sair do jogo" }).click();
  await expect(shell(page)).toHaveCount(0);

  const first = cycles[0];
  const lastCycle = cycles[CYCLES - 1];
  const geo = cycles.map((c) => c.geometries);
  write("game-perf.json", {
    note: "headless SwiftShader: regressão na mesma máquina, NÃO meta de desempenho",
    cycles: CYCLES,
    first: { geometries: first.geometries, textures: first.textures, programs: first.programs },
    last: { geometries: lastCycle.geometries, textures: lastCycle.textures, programs: lastCycle.programs },
    geometriesPerCycle: geo,
    texturesPerCycle: cycles.map((c) => c.textures),
    programsPerCycle: cycles.map((c) => c.programs),
    nodesAfterClose: cycles.map((c) => c.nodesClosed),
    fps: { still: fpsStill, walking: fpsWalking },
    siteCanvases: site.canvases,
  });
  // Cada abertura nasce com um WebGLRenderer novo: `renderer.info.memory` recomeça do zero, então a igualdade entre o
  // 1º e o 20º ciclo prova que a sala (geometrias e texturas) é montada e descartada sempre igual. Texturas e
  // programas são determinísticos (iguais em todo ciclo). As geometrias variam até +3 entre execuções: são as peças da
  // mão que só sobem ao quadro quando uma pose ociosa sorteada as mostra pela 1ª vez (medido na T11, rodada 1:
  // 155 → 158 e parado; game-phone.spec.ts). Vazamento seria crescer ciclo a ciclo, o que `max - min` e a comparação
  // com o 1º pegam. O DOM do site depois de fechar (nós) também tem de voltar igual: sem painel, listener de nó nem
  // `<dialog>` esquecido.
  for (const k of ["textures", "programs"] as const) expect(new Set(cycles.map((c) => c[k])).size, `${k} iguais em todos os ciclos`).toBe(1);
  expect(Math.max(...geo) - Math.min(...geo), "geometrias: variação entre ciclos").toBeLessThanOrEqual(3);
  expect(Math.abs(lastCycle.geometries - first.geometries), "geometrias 20º vs 1º").toBeLessThanOrEqual(3);
  const nodes = cycles.map((c) => c.nodesClosed);
  expect(Math.max(...nodes) - Math.min(...nodes), "nós do DOM do site depois de fechar").toBeLessThanOrEqual(2);
  expect(errors.filter((e) => !e.includes("favicon"))).toEqual([]);

});

test("pacote do jogo (bytes dos chunks que a abertura traz) e tempo até o 1º quadro e o 1º input útil", async ({ page }) => {
  type Asset = { url: string; raw: number; wire: number; gzip: number; brotli: number };
  const pending = new Map<string, Promise<Asset>>();
  page.on("response", (res) => {
    const url = res.url();
    if (!/\/_next\/static\/.+\.(js|css|woff2?)(\?|$)/.test(url) || pending.has(url)) return;
    pending.set(
      url,
      (async () => {
        const body = await res.body();
        const sizes = await res.request().sizes();
        return { url: new URL(url).pathname, raw: body.length, wire: sizes.responseBodySize, gzip: gzipSync(body, { level: 9 }).length, brotli: brotliCompressSync(body).length };
      })(),
    );
  });
  await page.goto("/?debug=1");
  await hydrated(page);
  const initial = new Set([...pending.keys()].map((u) => new URL(u).pathname));

  const t0 = await openByConsole(page);
  await liveAndWarm(page, 1);
  const marks = {
    shell: await markAt(page, "shell"),
    engine: await markAt(page, "engine"),
    layer: await markAt(page, "layer"),
    firstFrame: await markAt(page, "first-frame"),
    live: await markAt(page, "live"),
  };
  for (const [name, v] of Object.entries(marks)) expect(v, `marca ${name}`).not.toBeNull();
  const rel = (v: number | null) => Math.round((v as number) - t0);
  // `live` = loop ligado e entrada pronta (a sala ainda pode não ter pintado); o 1º input ÚTIL é o que vem depois dos dois:
  // entrada pronta E um quadro já desenhado (em SwiftShader o 1º quadro leva ~1,5 s a mais que o `live`).
  const timing = {
    shellMs: rel(marks.shell),
    engineMs: rel(marks.engine),
    layerMs: rel(marks.layer),
    liveMs: rel(marks.live),
    firstFrameMs: rel(marks.firstFrame),
    usefulInputMs: Math.max(rel(marks.live), rel(marks.firstFrame)),
  };
  // as marcas vêm em ordem: a casca monta, o engine nasce, a sala carrega, o 1º quadro e por fim a entrada útil
  expect(timing.shellMs).toBeLessThan(timing.engineMs);
  expect(timing.engineMs).toBeLessThan(timing.layerMs);
  expect(timing.layerMs).toBeLessThanOrEqual(timing.liveMs);
  expect(timing.firstFrameMs).toBeGreaterThan(0);

  const all = await Promise.all([...pending.values()]);
  const pack = all.filter((a) => !initial.has(a.url));
  const sum = (key: "raw" | "wire" | "gzip" | "brotli") => pack.reduce((n, a) => n + a[key], 0);
  expect(pack.length, "a abertura traz chunks novos").toBeGreaterThan(0);
  write("game-bytes.json", {
    note: "chunks de /_next/static que só chegam ao abrir o jogo (build de produção, next start). `wire` = bytes como o Next serve (gzip); brotli = o que a Vercel serve",
    chunks: pack.sort((a, b) => b.brotli - a.brotli),
    totals: { raw: sum("raw"), wire: sum("wire"), gzip: sum("gzip"), brotli: sum("brotli") },
  });
  write("game-timing.json", { note: "SwiftShader (CPU), janela 800×500, qualidade 240: regressão, não meta", ...timing });
});
