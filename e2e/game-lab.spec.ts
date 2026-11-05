import { expect, test, type Page } from "@playwright/test";
import { LAB_IDS, LAB_MODELS, type LabMeta } from "../src/game/lab/registry";
import { lightGame } from "./helpers/light";

// B2: laboratório de modelos (só debug). O orçamento de CADA modelo do registro é conferido aqui: o teste itera
// `LAB_MODELS`, então cresce sozinho a cada modelo novo (e um modelo que passa do próprio `budget` quebra o teste).
// Movimento reduzido (sem inércia, sem luz girando) é coberto no unit de `orbit`: com ele o site entra em modo leitura
// e o jogo (e o laboratório) nem abre.

type LabSnap = {
  id: string | null;
  status: string;
  stats: { triangles: number; calls: number; meshes: number; materials: number; textures: unknown[] } | null;
  sizeCm: [number, number, number] | null;
  withinBudget: boolean | null;
  wireframe: boolean;
  post: number;
  spin: boolean;
};
type LabApi = {
  snapshot(): LabSnap;
  inspect(): { originals: { count: number; wireframe: number }; clones: { count: number; wireframe: number }; meshes: { clone: boolean; wireframe: boolean }[] };
  live(): { calls: number; triangles: number; geometries: number; textures: number };
  view(): { yaw: number; pitch: number; dist: number };
};
type LabWindow = Window & { __criptaLab?: LabApi; __cripta?: unknown };

test.describe.configure({ timeout: 180_000 });

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "laboratório é ferramenta de desktop");
  await page.addInitScript(() => {
    if (!localStorage.getItem("lainciano:som:v1")) localStorage.setItem("lainciano:som:v1", "off");
  });
  await lightGame(page, testInfo);
});

const snap = (page: Page) => page.evaluate(() => (window as unknown as LabWindow).__criptaLab?.snapshot() ?? null);

async function openLab(page: Page, extra = "") {
  await page.goto(`/?jogo=1&debug=1&lab=1${extra}`);
  await expect(page.locator("[data-lab-panel]")).toBeVisible({ timeout: 40_000 });
  await expect.poll(() => page.evaluate(() => !!(window as unknown as LabWindow).__criptaLab), { timeout: 40_000 }).toBe(true);
}

/** Escolhe o modelo pelo botão e espera ficar pronto. */
async function pick(page: Page, id: string) {
  await page.locator(`[data-lab-model="${id}"]`).click();
  await expect.poll(async () => ((await snap(page))?.id === id ? (await snap(page))?.status : null), { timeout: 60_000, message: id }).toBe("ready");
}

test("sem debug=1 o lab=1 é ignorado: o jogo abre normal e o código do laboratório nem é baixado", async ({ page }) => {
  const scripts: Promise<string>[] = [];
  page.on("response", (r) => {
    if (r.url().endsWith(".js") || r.url().includes(".js?")) scripts.push(r.text().catch(() => ""));
  });
  await page.goto("/?jogo=1&lab=1");
  await expect(page.locator("[data-game-stage] canvas")).toBeVisible({ timeout: 40_000 });
  await expect(page.locator("[data-lab-panel]")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as LabWindow).__criptaLab)).toBeUndefined();
  expect(await page.evaluate(() => (window as unknown as LabWindow).__cripta)).toBeUndefined();
  const bodies = await Promise.all(scripts);
  expect(bodies.length).toBeGreaterThan(3);
  expect(bodies.some((b) => b.includes("laboratório de modelos"))).toBe(false);
});

test("com debug a lista tem todos os ids do registro e clicar num id mostra os números", async ({ page }) => {
  await openLab(page);
  await expect(page.locator("[data-lab-model]")).toHaveCount(LAB_IDS.length);
  for (const id of LAB_IDS) await expect(page.locator(`[data-lab-model="${id}"]`)).toHaveCount(1);

  await pick(page, "lapis");
  const triangles = Number(await page.locator('[data-lab-stat="triangles"]').innerText());
  expect(triangles).toBeGreaterThan(0);
  expect(Number(await page.locator('[data-lab-stat="calls"]').innerText())).toBeGreaterThan(0);
  await expect(page.locator('[data-lab-stat="size"]')).toContainText("cm");
  await expect(page.locator('[data-lab-model="lapis"]')).toHaveAttribute("aria-pressed", "true");
  expect(new URL(page.url()).searchParams.get("model")).toBe("lapis");
  expect((await snap(page))?.stats?.triangles).toBe(triangles);
});

test("&model=<id> abre direto naquele modelo", async ({ page }) => {
  await openLab(page, "&model=tapete");
  await expect.poll(async () => (await snap(page))?.status, { timeout: 60_000 }).toBe("ready");
  expect((await snap(page))?.id).toBe("tapete");
  await expect(page.locator('[data-lab-model="tapete"]')).toHaveAttribute("aria-pressed", "true");
});

test("cada modelo do registro respeita o próprio orçamento (e o desenhado de verdade também)", async ({ page }) => {
  await openLab(page);
  const report: string[] = [];
  for (const id of LAB_IDS) {
    await test.step(id, async () => {
      const meta: LabMeta = LAB_MODELS[id];
      await pick(page, id);
      const s = await snap(page);
      const stats = s?.stats;
      expect(stats, id).toBeTruthy();
      report.push(`${id}: ${stats!.triangles} tri, ${stats!.calls} chamadas, ${stats!.meshes} malhas, ${stats!.materials} materiais, ${stats!.textures.length} texturas, ${s!.sizeCm?.join("×")} cm`);
      expect(stats!.triangles, `${id}: triângulos`).toBeLessThanOrEqual(meta.budget.triangles);
      expect(stats!.calls, `${id}: chamadas de desenho`).toBeLessThanOrEqual(meta.budget.calls);
      expect(s!.withinBudget, id).toBe(true);
      await expect(page.locator("[data-lab-verdict]")).toHaveAttribute("data-state", "ok");
      // o que o three desenhou no quadro não passa do orçamento (a poda de frustum só pode baixar o número)
      await expect.poll(async () => (await page.evaluate(() => (window as unknown as LabWindow).__criptaLab?.live().calls)) ?? 0, { timeout: 30_000, message: `${id}: quadro` }).toBeGreaterThan(0);
      const live = await page.evaluate(() => (window as unknown as LabWindow).__criptaLab!.live());
      expect(live.calls, `${id}: chamadas no quadro`).toBeLessThanOrEqual(meta.budget.calls);
      expect(live.triangles, `${id}: triângulos no quadro`).toBeLessThanOrEqual(meta.budget.triangles);
      if (meta.size) {
        meta.size.forEach((cm, i) => expect(Math.abs(s!.sizeCm![i] - cm), `${id}: medida ${i}`).toBeLessThanOrEqual(Math.max(1, cm * 0.05)));
      }
    });
  }
  test.info().annotations.push({ type: "medidas", description: report.join(" | ") });
  console.log(report.join("\n"));
});

test("wireframe liga só nos clones do laboratório, nunca nos materiais compartilhados do kit", async ({ page }) => {
  await openLab(page, "&model=mesa");
  await expect.poll(async () => (await snap(page))?.status, { timeout: 60_000 }).toBe("ready");
  const inspect = () => page.evaluate(() => (window as unknown as LabWindow).__criptaLab!.inspect());

  let before = await inspect();
  expect(before.clones.count).toBe(0);
  expect(before.originals.count).toBeGreaterThan(0);
  expect(before.originals.wireframe).toBe(0);

  await page.locator('[data-lab-tool="wireframe"]').click();
  await expect(page.locator('[data-lab-tool="wireframe"]')).toHaveAttribute("aria-pressed", "true");
  let on = await inspect();
  expect(on.clones.count).toBeGreaterThan(0);
  expect(on.clones.wireframe).toBe(on.clones.count);
  expect(on.originals.wireframe).toBe(0);
  expect(on.meshes.every((m) => m.clone && m.wireframe)).toBe(true);

  // trocar de modelo com o wireframe ligado mantém o wireframe (e os originais do novo modelo seguem intactos)
  await pick(page, "lapis");
  on = await inspect();
  expect(on.meshes.length).toBeGreaterThan(0);
  expect(on.meshes.every((m) => m.clone && m.wireframe)).toBe(true);
  expect(on.originals.wireframe).toBe(0);

  await page.locator('[data-lab-tool="wireframe"]').click();
  const off = await inspect();
  expect(off.meshes.every((m) => !m.clone && !m.wireframe)).toBe(true);
  expect(off.originals.wireframe).toBe(0);
  before = await inspect();
  expect(before.originals.wireframe).toBe(0);
});

test("pós 0/1/2, luz e órbita: arrastar gira, a roda aproxima, os limites valem; trocar de modelo não vaza geometria", async ({ page }) => {
  await openLab(page, "&model=mesa");
  await expect.poll(async () => (await snap(page))?.status, { timeout: 60_000 }).toBe("ready");

  for (const mode of [0, 2, 1]) {
    await page.locator(`[data-lab-post="${mode}"]`).click();
    await expect(page.locator(`[data-lab-post="${mode}"]`)).toHaveAttribute("aria-pressed", "true");
    expect((await snap(page))?.post).toBe(mode);
  }

  await page.locator('[data-lab-tool="spin"]').click();
  await expect(page.locator('[data-lab-tool="spin"]')).toHaveAttribute("aria-pressed", "true");
  await page.locator('[data-lab-tool="spin"]').click();

  const view = () => page.evaluate(() => (window as unknown as LabWindow).__criptaLab!.view());
  const v0 = await view();
  const canvas = page.locator("[data-game-stage] canvas");
  const box = (await canvas.boundingBox())!;
  const cx = box.x + box.width * 0.7;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 120, cy - 40, { steps: 6 });
  await page.mouse.up();
  const v1 = await view();
  expect(v1.yaw).not.toBeCloseTo(v0.yaw, 2);
  expect(v1.pitch).not.toBeCloseTo(v0.pitch, 2);

  await page.mouse.move(cx, cy);
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -400);
  await expect.poll(async () => (await view()).dist).toBeLessThan(v0.dist);
  for (let i = 0; i < 40; i++) await page.mouse.wheel(0, -1000);
  await expect.poll(async () => (await view()).dist).toBeCloseTo(0.15, 2);
  for (let i = 0; i < 80; i++) await page.mouse.wheel(0, 1000);
  await expect.poll(async () => (await view()).dist).toBeCloseTo(4, 2);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy + 4000, { steps: 4 });
  await page.mouse.up();
  expect((await view()).pitch).toBeLessThanOrEqual((85 * Math.PI) / 180 + 1e-6);

  // trocar de modelo e voltar: nada fica na GPU além do que o modelo tem
  const geometries = () => page.evaluate(() => (window as unknown as LabWindow).__criptaLab!.live().geometries);
  await expect.poll(geometries).toBeGreaterThan(0);
  const first = await geometries();
  await pick(page, "armario");
  await pick(page, "mesa");
  await expect.poll(geometries, { timeout: 20_000 }).toBe(first);
});
