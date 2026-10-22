import { expect, test, type Page } from "@playwright/test";

// Sinal pós-hidratação: o React já anexou a fibra ao <main>, então os efeitos do GameHost já rodaram.
async function hydrated(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => {
    const main = document.querySelector("main");
    return !!main && Object.keys(main).some((key) => key.startsWith("__reactFiber"));
  });
}

type DebugInfo = {
  quality: number;
  target: { width: number; height: number };
  frames: number;
  frameErrors: number;
  running: boolean;
  lost: boolean;
};
type CriptaWindow = Window & {
  __cripta?: {
    fps: { p50: number; p95: number };
    quality: number;
    lost: boolean;
    renderer: DebugInfo;
    errors: { count: number; last: string | null };
    setQuality(q: number): void;
    onFrame(fn: (dt: number, t: number) => void): () => void;
  };
  __gl: { created: number; lost: number };
};

const NO_WEBGL = "O 3D não abriu neste aparelho (WebGL indisponível ou perdido). O site continua aqui.";

test.beforeEach(async ({ page }) => {
  // O site abre uma run em /api/run a cada visita nova; aqui isso só gastaria o limitador do servidor compartilhado.
  await page.route("**/api/run", (route) =>
    route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ runId: "e2e", issuedAt: 0, token: "e2e" }) }));
  await page.addInitScript(() => {
    // Limiar fora do caminho: a chave de som já gravada impede a intro.
    if (!localStorage.getItem("lainciano:som:v1")) localStorage.setItem("lainciano:som:v1", "off");
    // Conta os contextos WebGL do jogo (o canvas já nasce marcado) e quantos foram soltos.
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

// Erros de console e exceções da página a partir de agora (o que o teste não espera).
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

const debug = (page: Page) => page.evaluate(() => (window as unknown as CriptaWindow).__cripta?.renderer ?? null);

async function expectRunning(page: Page) {
  await expect(page.locator("[data-game-stage] canvas")).toHaveCount(1);
  await expect(page.locator("[data-game-loading]")).toHaveCount(0);
  await expect(page.getByText(NO_WEBGL)).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as CriptaWindow).__cripta?.fps.p50 ?? 0), { timeout: 10_000 })
    .toBeGreaterThan(0);
}

test("abre um canvas no palco, mede quadros e respeita a qualidade do aparelho", async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await page.goto("/?jogo=1&debug=1");
  await hydrated(page);
  await expectRunning(page);
  await page.waitForTimeout(1000);

  const expected = testInfo.project.name === "mobile" ? 360 : 480;
  const info = await debug(page);
  expect(info?.quality).toBe(expected);
  expect(info?.target.height).toBe(expected);
  expect(info?.frameErrors).toBe(0);
  expect(info?.running).toBe(true);
  const fps = await page.evaluate(() => (window as unknown as CriptaWindow).__cripta?.fps);
  expect(fps?.p95).toBeGreaterThanOrEqual(fps?.p50 ?? 0);

  // O render target acompanha o ajuste de qualidade.
  await page.evaluate(() => (window as unknown as CriptaWindow).__cripta?.setQuality(240));
  await expect.poll(async () => (await debug(page))?.target.height).toBe(240);
  expect(errors).toEqual([]);
});

test("um quadro que lança conta o erro, mostra os primeiros no console e o loop segue", async ({ page }) => {
  await page.goto("/?jogo=1&debug=1");
  await hydrated(page);
  await expectRunning(page);
  const errors = collectErrors(page);

  await page.evaluate(() => {
    (window as unknown as CriptaWindow).__cripta?.onFrame(() => {
      throw new Error("quadro de teste");
    });
  });
  await expect.poll(async () => (await debug(page))?.frameErrors ?? 0).toBeGreaterThan(10);
  const before = (await debug(page))?.frames ?? 0;
  await expect.poll(async () => (await debug(page))?.frames ?? 0).toBeGreaterThan(before + 5);
  const reported = await page.evaluate(() => (window as unknown as CriptaWindow).__cripta?.errors);
  expect(reported?.last).toBe("quadro de teste");
  // Não engole em silêncio, mas também não inunda: só os 3 primeiros vão ao console.
  expect(errors.filter((text) => text.includes("[jogo] erro no quadro"))).toHaveLength(3);
});

test("aba escondida para o loop; ao voltar ele retoma", async ({ page }) => {
  await page.goto("/?jogo=1&debug=1");
  await hydrated(page);
  await expectRunning(page);

  const setHidden = (hidden: boolean) =>
    page.evaluate((value) => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => value });
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (value ? "hidden" : "visible") });
      document.dispatchEvent(new Event("visibilitychange"));
    }, hidden);

  await setHidden(true);
  expect((await debug(page))?.running).toBe(false);
  const paused = (await debug(page))?.frames ?? 0;
  await page.waitForTimeout(500);
  expect((await debug(page))?.frames).toBe(paused);

  await setHidden(false);
  expect((await debug(page))?.running).toBe(true);
  await expect.poll(async () => (await debug(page))?.frames ?? 0).toBeGreaterThan(paused);
});

test("perder o contexto mostra o aviso, para o loop, solta o canvas e volta ao site", async ({ page }) => {
  await page.goto("/?jogo=1&debug=1");
  await hydrated(page);
  await expectRunning(page);
  const errors = collectErrors(page);

  await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("[data-game-stage] canvas");
    canvas?.getContext("webgl2")?.getExtension("WEBGL_lose_context")?.loseContext();
  });

  await expect(page.getByText(NO_WEBGL)).toBeVisible();
  const back = page.getByRole("button", { name: "Voltar ao site" });
  await expect(back).toBeFocused();
  await expect(page.locator("[data-game-stage] canvas")).toHaveCount(0);
  const after = await page.evaluate(() => {
    const cripta = (window as unknown as CriptaWindow).__cripta;
    return cripta ? { lost: cripta.lost, running: cripta.renderer.running } : null;
  });
  // Ruling 1: o __cripta some ou marca lost.
  if (after) expect(after).toEqual({ lost: true, running: false });

  await back.click();
  await expect(page.locator("[data-game-shell]")).toHaveCount(0);
  await expect(page.locator(".page-shell")).not.toHaveAttribute("inert", /.*/);
  expect(await page.evaluate(() => (window as unknown as CriptaWindow).__cripta)).toBeUndefined();
  expect(errors).toEqual([]);
});

test("sem WebGL no aparelho: aviso, botão de voltar e nenhum canvas", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (type.startsWith("webgl")) return null;
      return (original as (...args: unknown[]) => RenderingContext | null).call(this, type, ...rest);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  await page.goto("/?jogo=1&debug=1");
  await hydrated(page);

  await expect(page.getByText(NO_WEBGL)).toBeVisible();
  await expect(page.getByRole("button", { name: "Voltar ao site" })).toBeFocused();
  await expect(page.locator("[data-game-stage] canvas")).toHaveCount(0);
  await expect(page.locator("[data-game-loading]")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as CriptaWindow).__cripta)).toBeUndefined();

  await page.getByRole("button", { name: "Voltar ao site" }).click();
  await expect(page.locator("[data-game-shell]")).toHaveCount(0);
});

test("abrir e fechar 3 vezes não deixa canvas nem contexto WebGL para trás", async ({ page }) => {
  const errors = collectErrors(page);
  const counts = () =>
    page.evaluate(() => ({
      total: document.querySelectorAll("canvas").length,
      game: document.querySelectorAll("[data-game-shell] canvas").length,
      ...(window as unknown as CriptaWindow).__gl,
    }));
  const shell = page.locator("[data-game-shell]");

  // Chave já ligada, site sem jogo: a linha de base de canvas é a do site. As aberturas são pelo console.
  await page.addInitScript(() => localStorage.setItem("lainciano:jogo:v1", "on"));
  await page.goto("/?debug=1");
  await hydrated(page);
  const site = (await counts()).total;

  for (const ciclo of [1, 2, 3]) {
    await page.locator("body").press("/");
    const input = page.locator(".console-overlay input");
    await expect(input).toBeVisible();
    await input.fill("jogo");
    await input.press("Enter");
    await expect(shell, `ciclo ${ciclo}: abre`).toBeVisible();
    await expectRunning(page);
    const open = await counts();
    expect(open.game, `ciclo ${ciclo}: um canvas no jogo`).toBe(1);
    expect(open.total, `ciclo ${ciclo}: site + 1`).toBe(site + 1);
    // Sem vazar o orçamento de 2 contextos: cada abertura consegue o seu (a 3ª falharia se vazasse).
    expect(open.created, `ciclo ${ciclo}: um contexto novo por abertura`).toBe(ciclo);

    await shell.getByRole("button", { name: "Sair do jogo" }).click();
    await expect(shell, `ciclo ${ciclo}: fecha`).toHaveCount(0);
    // forceContextLoss: o contexto é solto ao fechar (o evento chega numa tarefa seguinte).
    await expect.poll(async () => (await counts()).lost, { message: `ciclo ${ciclo}: contexto solto` }).toBe(ciclo);
    const closed = await counts();
    expect(closed.total, `ciclo ${ciclo}: só os canvas do site`).toBe(site);
    expect(await page.evaluate(() => (window as unknown as CriptaWindow).__cripta)).toBeUndefined();
  }
  expect(errors).toEqual([]);
});
