import { expect, test, type Page } from "@playwright/test";
import { lightGame } from "./helpers/light";

// B6: contexto WebGL perdido (celular em segundo plano) -> "a tela apagou · tocar para continuar" recria a sessão do save.

type Cripta = {
  place: string | null;
  renderer: { memory: { geometries: number; textures: number }; running: boolean; frames: number };
};
type W = Window & {
  __cripta?: Cripta;
  __lose?: { loseContext(): void; restoreContext(): void };
  __gl: { created: number; lost: number };
};

const SLACK = 4;
const RESUME = "a tela apagou · tocar para continuar";
const NO_WEBGL = "O 3D não abriu neste aparelho (WebGL indisponível ou perdido). O site continua aqui.";

test.describe.configure({ timeout: 150_000 });

test.beforeEach(async ({ page }) => {
  await page.route("**/api/run", (route) =>
    route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ runId: "e2e", issuedAt: 0, token: "e2e" }) }));
  await page.addInitScript(() => {
    if (!localStorage.getItem("lainciano:som:v1")) localStorage.setItem("lainciano:som:v1", "off");
    const w = window as unknown as W;
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

/** Jogo vivo e assentado: 1 canvas, quadros correndo e o celular já pré-compilado (marca `cripta:warm` nº `n`). */
async function settled(page: Page, warmCount: number) {
  await expect(page.locator("[data-game-stage] canvas")).toHaveCount(1);
  await expect(page.locator("[data-game-loading]")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__cripta?.renderer.running ?? false), { timeout: 30_000 }).toBe(true);
  await expect
    .poll(() => page.evaluate(() => performance.getEntriesByName("cripta:warm").length), { timeout: 30_000 })
    .toBeGreaterThanOrEqual(warmCount);
}

/** Marca o canvas atual (para provar que o seguinte é outro) e derruba o contexto com WEBGL_lose_context. */
const loseContext = (page: Page) =>
  page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("[data-game-stage] canvas");
    if (!canvas) throw new Error("sem canvas");
    canvas.dataset.old = "1";
    const ext = canvas.getContext("webgl2")?.getExtension("WEBGL_lose_context");
    if (!ext) throw new Error("sem WEBGL_lose_context");
    (window as unknown as W).__lose = ext;
    ext.loseContext();
  });

const gpu = (page: Page) =>
  page.evaluate(() => {
    const m = (window as unknown as W).__cripta?.renderer.memory;
    return { geometries: m?.geometries ?? -1, textures: m?.textures ?? -1 };
  });

const resumeButton = (page: Page) => page.getByRole("button", { name: RESUME });

async function open(page: Page, testInfo: Parameters<typeof lightGame>[1]) {
  // O lugar salvo não é o padrão: prova que a recriação volta ao salvo, não à entrada.
  await lightGame(page, testInfo, { place: "mesa" });
  await page.goto("/?jogo=1&debug=1");
  await hydrated(page);
  await settled(page, 1);
  expect(await page.evaluate(() => (window as unknown as W).__cripta?.place)).toBe("mesa");
}

test("perder o contexto oferece 'tocar para continuar' e tocar recria o canvas no lugar salvo, sem crescer a memória", async ({ page }, testInfo) => {
  await open(page, testInfo);
  const base = await gpu(page);
  expect(base.geometries).toBeGreaterThan(0);

  for (let ciclo = 1; ciclo <= 3; ciclo++) {
    await loseContext(page);
    const button = resumeButton(page);
    await expect(button).toBeVisible();
    await expect(button).toBeFocused();
    // nada de aviso de falha, nenhum quadro correndo no vazio (o debug do mundo antigo já saiu)
    await expect(page.getByText(NO_WEBGL)).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as W).__cripta)).toBeUndefined();

    await button.click();
    await settled(page, ciclo + 1);
    await expect(page.locator("[data-game-stage] canvas[data-old]")).toHaveCount(0);
    await expect(resumeButton(page)).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as W).__cripta?.place), `ciclo ${ciclo}: lugar salvo`).toBe("mesa");
    // `renderer.info.memory` é por renderer: a sessão nova começa do zero e só conta o que já subiu à GPU. No celular a
    // câmera ainda sobe 1-2 peças tardias depois do `warm` (medido: 78 -> 79 -> 81, sem tendência), então há uma folga
    // pequena sobre a sessão original; um laço que acumulasse peças por ciclo estouraria a folga em poucos ciclos.
    const now = await gpu(page);
    expect(now.geometries, `ciclo ${ciclo}: geometrias`).toBeLessThanOrEqual(base.geometries + SLACK);
    expect(now.textures, `ciclo ${ciclo}: texturas`).toBeLessThanOrEqual(base.textures + SLACK);
  }
  // 1 contexto novo por recriação e todos os perdidos foram soltos: nada acumulado
  const gl = await page.evaluate(() => (window as unknown as W).__gl);
  expect(gl.created).toBe(4);
  await expect(page.locator("[data-game-stage] canvas")).toHaveCount(1);
});

test("o navegador restaurar o contexto (webglcontextrestored) segue o mesmo caminho, sem tocar", async ({ page }, testInfo) => {
  await open(page, testInfo);
  await loseContext(page);
  await expect(resumeButton(page)).toBeVisible();
  await page.evaluate(() => (window as unknown as W).__lose?.restoreContext());
  await settled(page, 2);
  await expect(page.locator("[data-game-stage] canvas[data-old]")).toHaveCount(0);
  await expect(resumeButton(page)).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as W).__cripta?.place)).toBe("mesa");
});

test("depois de 3 recriações no minuto, perder de novo só oferece voltar ao site", async ({ page }, testInfo) => {
  await open(page, testInfo);
  for (let ciclo = 1; ciclo <= 3; ciclo++) {
    await loseContext(page);
    await resumeButton(page).click();
    await settled(page, ciclo + 1);
  }
  await loseContext(page);
  await expect(page.getByText(NO_WEBGL)).toBeVisible();
  await expect(resumeButton(page)).toHaveCount(0);
  const back = page.getByRole("button", { name: "Voltar ao site" });
  await expect(back).toBeFocused();
  // o engine perdido é solto: nenhum canvas fica no palco e nenhum loop roda
  await expect(page.locator("[data-game-stage] canvas")).toHaveCount(0);
  await back.click();
  await expect(page.locator("[data-game-shell]")).toHaveCount(0);
  await expect(page.locator(".page-shell")).not.toHaveAttribute("inert", /.*/);
});

test("sair do jogo com o contexto perdido solta o canvas e não recarrega a página", async ({ page }, testInfo) => {
  await open(page, testInfo);
  await page.evaluate(() => ((window as unknown as { __same?: boolean }).__same = true));
  await loseContext(page);
  await expect(resumeButton(page)).toBeVisible();
  await page.getByRole("button", { name: "Sair do jogo" }).click();
  await expect(page.locator("[data-game-shell]")).toHaveCount(0);
  await expect(page.locator("canvas[data-game-canvas]")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __same?: boolean }).__same)).toBe(true);
});
