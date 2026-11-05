import { expect, test } from "@playwright/test";

// Fumaça do site: a Home responde com conteúdo e sem erro de console. O Limiar não abre aqui
// porque o Playwright marca navigator.webdriver (ver LIMIAR_BOOT_SCRIPT).
test("a Home carrega o conteúdo sem erro de console", async ({ page }) => {
  // /api/run tem limitador por IP no servidor compartilhado: uma visita a mais já devolve 429 e sujaria o console.
  await page.route("**/api/run", (route) =>
    route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ runId: "e2e", issuedAt: 0, token: "e2e" }) }));
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/");

  await expect(page).toHaveTitle(/lainciano/);
  await expect(page.locator("main")).toBeVisible();
  await expect(page.locator("dialog#limiar")).not.toHaveAttribute("open", "");
  expect(errors).toEqual([]);
});
