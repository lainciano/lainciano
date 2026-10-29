import { expect, test, type Page } from "@playwright/test";
import { lightGame } from "./helpers/light";

// Sinal pós-hidratação: o React já anexou a fibra ao <main>, então os efeitos do GameHost já rodaram.
async function hydrated(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => {
    const main = document.querySelector("main");
    return !!main && Object.keys(main).some((key) => key.startsWith("__reactFiber"));
  });
}

// O Lenis nasce depois do `load` (afterLoadIdle): só depois dele os testes de pausa/retomada significam algo.
async function lenisReady(page: Page) {
  await page.waitForFunction(() => document.documentElement.classList.contains("lenis"));
}

// Ciclo de vida do shell: não depende da imagem; o quadro leve (helpers/light.ts) mantém as asserções dentro do tempo.
test.describe.configure({ timeout: 90_000 });

test.beforeEach(async ({ page }, testInfo) => {
  await lightGame(page, testInfo);
  // O site abre uma run em /api/run a cada visita nova; aqui isso só gastaria o limitador do servidor compartilhado.
  await page.route("**/api/run", (route) =>
    route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ runId: "e2e", issuedAt: 0, token: "e2e" }) }));
  // Limiar fora do caminho: a chave de som já gravada impede a intro.
  await page.addInitScript(() => {
    if (!localStorage.getItem("lainciano:som:v1")) localStorage.setItem("lainciano:som:v1", "off");
  });
});

test("abrir deixa o site inerte atrás e fechar desfaz tudo", async ({ page }) => {
  await page.goto("/?jogo=1");
  await hydrated(page);
  await lenisReady(page);

  const shell = page.locator("[data-game-shell]");
  await expect(shell).toBeVisible();
  await expect(shell.locator("[data-game-stage]")).toHaveCount(1);
  for (const layer of ["prompt", "subtitles", "overlay"]) {
    await expect(shell.locator(`[data-game-${layer}]`)).toHaveCount(1);
  }

  const html = page.locator("html");
  const pageShell = page.locator(".page-shell");
  await expect(html).toHaveAttribute("data-game", "open");
  await expect(pageShell).toHaveAttribute("inert", "");
  await expect(pageShell).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("header.hud")).toHaveAttribute("inert", "");
  await expect(html).toHaveClass(/lenis-stopped/);

  await shell.getByRole("button", { name: "Sair do jogo" }).click();
  await expect(shell).toHaveCount(0);
  await expect(html).not.toHaveAttribute("data-game", /.*/);
  await expect(pageShell).not.toHaveAttribute("inert", /.*/);
  await expect(pageShell).not.toHaveAttribute("aria-hidden", /.*/);
  await expect(page.locator("header.hud")).not.toHaveAttribute("inert", /.*/);
  await expect(html).toHaveClass(/lenis/);
  await expect(html).not.toHaveClass(/lenis-stopped/);
});

// Primeiro <h1> da página de trás: prova que a rota por trás do jogo mudou de verdade.
const heading = (page: Page) => page.locator("main h1").first().innerText();

// Com o jogo aberto o site fica inerte e o palco é o mesmo nó; o Lenis segue parado.
async function expectGameStillHolding(page: Page) {
  await expect(page.locator("[data-game-stage]")).toHaveAttribute("data-probe", "vivo");
  await expect(page.locator("[data-game-shell]")).toHaveCount(1);
  await expect(page.locator("html")).toHaveAttribute("data-game", "open");
  await expect(page.locator(".page-shell")).toHaveAttribute("inert", "");
  await expect(page.locator("html")).toHaveClass(/lenis-stopped/);
}

async function openWithProbe(page: Page) {
  await page.goto("/?jogo=1");
  await hydrated(page);
  await lenisReady(page);
  const stage = page.locator("[data-game-stage]");
  await expect(stage).toHaveCount(1);
  await stage.evaluate((el) => {
    (el as HTMLElement).dataset.probe = "vivo";
  });
  await expectGameStillHolding(page);
}

test("navegação real do Next e o voltar do navegador por trás: mesmo palco, site inerte, Lenis parado", async ({ page }) => {
  await openWithProbe(page);
  const homeHeading = await heading(page);

  await page.evaluate(() => (window as unknown as { next: { router: { push(href: string): void } } }).next.router.push("/about"));
  await expect(page).toHaveURL(/\/about$/);
  await expect.poll(() => heading(page)).not.toBe(homeHeading);
  const aboutHeading = await heading(page);
  await expectGameStillHolding(page);

  // O botão voltar de verdade (history.back), não um popstate sintético.
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(() => heading(page)).toBe(homeHeading);
  await expectGameStillHolding(page);

  await page.goForward();
  await expect(page).toHaveURL(/\/about$/);
  await expect.poll(() => heading(page)).toBe(aboutHeading);
  await expectGameStillHolding(page);
});

test("navegação pelo caminho de View Transition (link do HUD) por trás mantém o palco", async ({ page }) => {
  await openWithProbe(page);
  const homeHeading = await heading(page);

  // O HUD está inerte para o usuário; o clique programático passa pelo onClick do TransitionLink (navigateWithTransition).
  await page.evaluate(() => document.querySelector<HTMLAnchorElement>('header.hud a[href="/work"]')?.click());
  await expect(page).toHaveURL(/\/work$/);
  await expect.poll(() => heading(page)).not.toBe(homeHeading);
  await expectGameStillHolding(page);

  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(() => heading(page)).toBe(homeHeading);
  await expectGameStillHolding(page);
});

test("com o Lenis já existente, o comando jogo abre e fecha duas vezes e liga/desliga a pausa e o inert", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("lainciano:jogo:v1", "on"));
  await page.goto("/");
  await hydrated(page);
  await lenisReady(page);
  const html = page.locator("html");
  await expect(html).not.toHaveClass(/lenis-stopped/);

  const shell = page.locator("[data-game-shell]");
  for (const ciclo of [1, 2]) {
    await page.locator("body").press("/");
    const input = page.locator(".console-overlay input");
    await expect(input).toBeVisible();
    await input.fill("jogo");
    await input.press("Enter");

    await expect(shell, `ciclo ${ciclo}: abre`).toBeVisible();
    await expect(html).toHaveClass(/lenis-stopped/);
    await expect(html).toHaveAttribute("data-game", "open");
    await expect(page.locator(".page-shell")).toHaveAttribute("inert", "");

    await shell.getByRole("button", { name: "Sair do jogo" }).click();
    await expect(shell, `ciclo ${ciclo}: fecha`).toHaveCount(0);
    await expect(html).not.toHaveClass(/lenis-stopped/);
    await expect(html).toHaveClass(/lenis/);
    await expect(html).not.toHaveAttribute("data-game", /.*/);
    await expect(page.locator(".page-shell")).not.toHaveAttribute("inert", /.*/);
  }
});

test("Esc não fecha o jogo", async ({ page }) => {
  await page.goto("/?jogo=1");
  await hydrated(page);
  const shell = page.locator("[data-game-shell]");
  await expect(shell).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(shell).toBeVisible();
});
