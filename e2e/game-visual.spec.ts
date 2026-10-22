import { expect, test, type Page } from "@playwright/test";

// T6 (Ruling 2): fotos do PSX portado na cena de referência de debug `psx-ref` (piso, paredes, balcão e luz
// pendente do protótipo 7), em 1280×800, nos três modos do pós. A referência é gerada na primeira execução;
// a aceitação visual (comparação com o protótipo 7 na mesma moldura) é do dono.

type CriptaWindow = Window & {
  __cripta?: {
    renderer: { frames: number; frameErrors: number; postMode: number; compileMs: number | null; programs: number };
    setPostMode(m: 0 | 1 | 2): void;
  };
};

async function hydrated(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => {
    const main = document.querySelector("main");
    return !!main && Object.keys(main).some((key) => key.startsWith("__reactFiber"));
  });
}

const info = (page: Page) => page.evaluate(() => (window as unknown as CriptaWindow).__cripta?.renderer ?? null);

// O botão de sair é DOM por cima do canvas: fica fora da foto (o texto nunca passa pelo pós).
const HIDE_UI = "[data-game-exit] { visibility: hidden !important; }";

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "fotos só na moldura de referência 1280×800");
  await page.route("**/api/run", (route) =>
    route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ runId: "e2e", issuedAt: 0, token: "e2e" }) }));
  await page.addInitScript(() => {
    if (!localStorage.getItem("lainciano:som:v1")) localStorage.setItem("lainciano:som:v1", "off");
  });
});

test("psx-ref: compila antes do 1º quadro e fotografa os modos PSX, gravura e ASCII", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/?jogo=1&debug=1&shot=psx-ref");
  await hydrated(page);
  await expect(page.locator("[data-game-loading]")).toHaveCount(0, { timeout: 20_000 });
  await expect.poll(async () => (await info(page))?.frames ?? 0, { timeout: 10_000 }).toBeGreaterThan(3);

  await page.addStyleTag({ content: HIDE_UI });

  const ready = await info(page);
  // O compileAsync rodou (cena + pós) antes de o loop ligar; os programas do PSX existem.
  expect(ready?.compileMs).not.toBeNull();
  expect(ready?.programs).toBeGreaterThan(1);
  expect(ready?.postMode).toBe(1);

  for (const mode of [1, 0, 2] as const) {
    await page.evaluate((m) => (window as unknown as CriptaWindow).__cripta?.setPostMode(m), mode);
    const before = (await info(page))?.frames ?? 0;
    await expect.poll(async () => (await info(page))?.frames ?? 0).toBeGreaterThan(before + 2);
    expect((await info(page))?.postMode).toBe(mode);
    await expect(page).toHaveScreenshot(`psx-ref-modo-${mode}.png`, { maxDiffPixelRatio: 0.02, animations: "disabled" });
  }

  expect((await info(page))?.frameErrors).toBe(0);
  // Erro de compilação de shader o three registra no console: nenhum aqui.
  expect(errors).toEqual([]);
});
