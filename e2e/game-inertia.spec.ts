import { expect, test, type Page } from "@playwright/test";
import { lightGame } from "./helpers/light";

// T14: inércia da mão e da lanterna ao virar. Gira a câmera pelas setas (←) e confere pelo estado de debug das mãos
// (`handsState.inertia`) que a mão atrasa (oposta ao giro) e volta ao centro quando a câmera para. A aparência (o
// feixe defasado) fica para a foto e o roteiro do dono; a mola em si é coberta por unit.

type Inertia = { yaw: number; pitch: number };
type CriptaWindow = Window & {
  __cripta?: {
    renderer: { frames: number };
    camera: { rotation: [number, number, number] };
    handsState: { mode: string; inertia?: Inertia } | null;
  };
};

test.describe.configure({ timeout: 120_000 });

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "inércia testada no desktop (teclado); o toque usa a mesma mola");
  await page.route("**/api/run", (route) =>
    route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ runId: "e2e", issuedAt: 0, token: "e2e" }) }));
  await page.addInitScript(() => {
    if (!localStorage.getItem("lainciano:som:v1")) localStorage.setItem("lainciano:som:v1", "off");
  });
  await lightGame(page, testInfo);
});

const hands = (page: Page) => page.evaluate(() => (window as unknown as CriptaWindow).__cripta?.handsState ?? null);
const yawOf = (page: Page) => page.evaluate(() => (window as unknown as CriptaWindow).__cripta?.camera.rotation[1] ?? 0);

test("virar rápido: a mão atrasa (oposta ao giro) e volta ao centro quando a câmera para", async ({ page }) => {
  await page.goto("/?jogo=1&debug=1&camada=cinza");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("[data-game-loading]")).toHaveCount(0, { timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as CriptaWindow).__cripta?.renderer.frames ?? 0), { timeout: 30_000 }).toBeGreaterThan(3);
  await expect.poll(async () => (await hands(page))?.mode, { timeout: 20_000 }).toBe("held");

  // parado: nada
  expect(Math.abs((await hands(page))?.inertia?.yaw ?? 1)).toBeLessThan(1e-3);

  // girando para a esquerda: yaw da câmera sobe e a mão fica atrás (inércia negativa, dentro do teto de 7° × 1,3)
  const yaw0 = await yawOf(page);
  await page.keyboard.down("ArrowLeft");
  await expect.poll(async () => (await hands(page))?.inertia?.yaw ?? 0, { timeout: 20_000 }).toBeLessThan(-0.02);
  const during = (await hands(page))?.inertia?.yaw ?? 0;
  expect(during).toBeGreaterThan(-0.16);
  expect(await yawOf(page)).not.toBeCloseTo(yaw0, 2);
  await page.keyboard.up("ArrowLeft");

  // parou: a mão volta ao centro (o leve overshoot assenta)
  await expect.poll(async () => Math.abs((await hands(page))?.inertia?.yaw ?? 1), { timeout: 20_000 }).toBeLessThan(2e-3);
});
