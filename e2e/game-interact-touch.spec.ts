import { expect, test, type Page } from "@playwright/test";
import { initialSave } from "../src/game/save/schema";

// T9 · toque: o rótulo do segurar e o cartão do exame não mostram tecla em ponteiro grosso. Tocar num objeto ao
// alcance age (o exame abre); num objeto de segurar mostra a dica por toque. PENDENTE (T11/T12): segurar por toque
// (dedo parado no objeto) e pinça para ampliar o exame.

type CriptaWindow = Window & { __cripta?: { aimAt(id: string): boolean; renderer: { frames: number }; place: string | null; interact: { aimedId: string | null } | null } };

test.describe.configure({ timeout: 120_000 });
test.skip(({ isMobile }) => !isMobile, "só no projeto mobile (ponteiro grosso)");

async function openAt(page: Page, place: string) {
  await page.route("**/api/run", (route) =>
    route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ runId: "e2e", issuedAt: 0, token: "e2e" }) }));
  const save = { ...initialSave(0), place };
  await page.addInitScript((json) => {
    localStorage.setItem("lainciano:som:v1", "off");
    localStorage.setItem("lainciano:jogo:save:v1", json);
  }, JSON.stringify(save));
  await page.goto("/?jogo=1&debug=1");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("[data-game-loading]")).toHaveCount(0, { timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as CriptaWindow).__cripta?.renderer.frames ?? 0), { timeout: 30_000 }).toBeGreaterThan(3);
  await expect.poll(() => page.evaluate(() => (window as unknown as CriptaWindow).__cripta?.place), { timeout: 10_000 }).toBe(place);
}

async function aimAndTap(page: Page, id: string) {
  await page.evaluate((i) => (window as unknown as CriptaWindow).__cripta?.aimAt(i), id);
  await expect.poll(() => page.evaluate(() => (window as unknown as CriptaWindow).__cripta?.interact?.aimedId), { timeout: 40_000 }).toBe(id);
  const box = await page.locator("[data-game-stage]").boundingBox();
  if (!box) throw new Error("sem palco");
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}

test("tocar no bilhete abre o exame sem glifos de tecla; o botão guarda", async ({ page }) => {
  await openAt(page, "mesa");
  await aimAndTap(page, "bilhete");
  const card = page.locator("[data-game-examine]");
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card.locator("kbd")).toHaveCount(0);
  await card.getByRole("button", { name: "guardar" }).click();
  await expect(card).toHaveCount(0);
});

test("tocar na porta (de segurar) mostra a dica por toque, sem 'E'", async ({ page }) => {
  await openAt(page, "porta");
  await aimAndTap(page, "porta");
  const line = page.locator("[data-game-line]");
  await expect(line).toContainText("mantenha o dedo para forçar a porta", { timeout: 20_000 });
  await expect(line).not.toContainText("segure E");
});
