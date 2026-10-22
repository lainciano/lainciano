import { expect, test, type Page } from "@playwright/test";

const GAME_KEY = "lainciano:jogo:v1";

// Sinal pós-hidratação: o React já anexou a fibra ao <main>, então os efeitos do GameHost já rodaram.
async function hydrated(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => {
    const main = document.querySelector("main");
    return !!main && Object.keys(main).some((key) => key.startsWith("__reactFiber"));
  });
}

// Limiar fora do caminho: a chave de som já gravada impede a intro (o Playwright também marca webdriver).
test.beforeEach(async ({ page }) => {
  // O site abre uma run em /api/run a cada visita nova; aqui isso só gastaria o limitador do servidor compartilhado.
  await page.route("**/api/run", (route) =>
    route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ runId: "e2e", issuedAt: 0, token: "e2e" }) }));
  await page.addInitScript(() => {
    if (!localStorage.getItem("lainciano:som:v1")) localStorage.setItem("lainciano:som:v1", "off");
  });
});

test("sem a chave, a Home não tem o jogo", async ({ page }) => {
  await page.goto("/");
  await hydrated(page);
  await expect(page.locator("[data-game-shell]")).toHaveCount(0);
});

test("?jogo=1 grava a chave, limpa a URL, abre o shell e o botão de sair fecha", async ({ page }) => {
  await page.goto("/?jogo=1");
  const shell = page.locator("[data-game-shell]");
  await expect(shell).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  expect(await page.evaluate((key) => localStorage.getItem(key), GAME_KEY)).toBe("on");

  await shell.getByRole("button", { name: "Sair do jogo" }).click();
  await expect(shell).toHaveCount(0);
});

test("em modo leitura, ?jogo=1 grava a chave mas não abre", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("lainciano:leitura:v1", "on"));
  await page.goto("/?jogo=1");
  await hydrated(page);
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), GAME_KEY)).toBe("on");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("[data-game-shell]")).toHaveCount(0);
});
