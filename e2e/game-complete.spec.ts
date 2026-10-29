import { expect, test, type Page } from "@playwright/test";
import { lightGame } from "./helpers/light";

// T12: o puzzle da sala cinza do começo ao fim. Desktop SÓ COM TECLADO (L, setas, Enter, Q, E, R, Tab, ⌫); mobile
// pelo mesmo caminho por toque. Escada de pistas acelerada (`hintgap=2`). Review Focus 5 com `page.keyboard` (gesto
// real) e o travamento de mouse DE VERDADE: o Chromium headless trava o ponteiro no clique (medido na T12); o que ele
// NÃO faz é soltar o mouse no Esc (é coisa da interface do navegador), então a soltura do Esc é emulada com
// `document.exitPointerLock()` chamado de fora do jogo, depois de apertar o Esc de verdade.
// Quadro leve (helpers/light.ts): ciclo de vida e DOM, não imagem.

type Cinza = { keyTaken?: boolean; noteRead?: boolean; doorOpen?: boolean; forced?: boolean; hints?: number };
type Save = { place: string | null; items: string[]; flags: Record<string, boolean>; puzzles: { cinza?: Cinza } };
type Interact = {
  aimedId: string | null;
  holdId: string | null;
  holdProgress: number;
  mode: string;
  panels: number;
  examine: { open: boolean; distance: number };
};
type CriptaWindow = Window & {
  __cripta?: { place: string | null; save: Save; interact: Interact | null; aimAt(id: string): boolean; renderer: { frames: number } };
  __lines?: string[];
};

const DOOR_FLAG = "cinza:porta-norte";
const HINTS = ["o bilhete na mesa fala de um armário.", "a chave fica na prateleira de cima do armário.", "a porta ao norte usa a chave. ou cede, se insistir."];

test.describe.configure({ timeout: 240_000 });

test.beforeEach(async ({ page }) => {
  await page.route("**/api/run", (route) =>
    route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ runId: "e2e", issuedAt: 0, token: "e2e" }) }));
  await page.addInitScript(() => {
    if (!localStorage.getItem("lainciano:som:v1")) localStorage.setItem("lainciano:som:v1", "off");
    // toda fala que aparece fica registrada (a fila troca as falas rápido com hintgap=2)
    const w = window as unknown as CriptaWindow;
    w.__lines = [];
    new MutationObserver(() => {
      for (const el of document.querySelectorAll("[data-game-line]")) {
        const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
        if (text && w.__lines?.[w.__lines.length - 1] !== text) w.__lines?.push(text);
      }
    }).observe(document, { subtree: true, childList: true });
  });
});

const cripta = (page: Page) => page.evaluate(() => {
  const c = (window as unknown as CriptaWindow).__cripta;
  return c ? { place: c.place, save: c.save, interact: c.interact, frames: c.renderer.frames } : null;
});
const save = async (page: Page) => (await cripta(page))?.save ?? null;
const prompt = (page: Page) => page.locator("[data-game-prompt]");
const line = (page: Page) => page.locator("[data-game-line]");
const lines = (page: Page) => page.evaluate(() => (window as unknown as CriptaWindow).__lines ?? []);
const reader = (page: Page) => page.getByRole("dialog", { name: "bilhete" });
const stage = (page: Page) => page.locator("[data-game-stage]");

async function openGame(page: Page, query = "") {
  await page.goto(`/?jogo=1&debug=1${query}`);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("[data-game-loading]")).toHaveCount(0, { timeout: 40_000 });
  await expect.poll(async () => (await cripta(page))?.frames ?? 0, { timeout: 40_000 }).toBeGreaterThan(3);
}

/** L abre os lugares; as setas andam até o lugar e Enter vai. Espera chegar. */
async function goPlace(page: Page, id: string, name: RegExp) {
  await page.keyboard.press("KeyL");
  const nav = page.getByRole("navigation", { name: "Lugares" });
  await expect(nav).toBeVisible({ timeout: 20_000 });
  for (let i = 0; i < 6; i++) {
    const focused = await page.evaluate(() => document.activeElement?.textContent ?? "");
    if (name.test(focused)) break;
    await page.keyboard.press("ArrowDown");
  }
  expect(await page.evaluate(() => document.activeElement?.textContent ?? "")).toMatch(name);
  await page.keyboard.press("Enter");
  await expect(nav).toHaveCount(0);
  await expect.poll(async () => (await cripta(page))?.place, { timeout: 60_000 }).toBe(id);
}

/** Q passa pelos objetos do lugar até o aviso trazer `text`. */
async function cycleTo(page: Page, text: string) {
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("KeyQ");
    try {
      await expect(prompt(page)).toContainText(text, { timeout: 8_000 });
      return;
    } catch {
      /* o próximo da volta */
    }
  }
  await expect(prompt(page)).toContainText(text);
}

const locked = (page: Page) => page.evaluate(() => (document.pointerLockElement as HTMLElement | null)?.hasAttribute("data-game-stage") ?? false);
const anyLock = (page: Page) => page.evaluate(() => document.pointerLockElement !== null);

test.describe("desktop · só teclado", () => {
  test.skip(({ isMobile }) => isMobile, "teclado: desktop");

  test("do começo ao fim: L → mesa → E bilhete → R → E → L → armário → E chave → (recarregar mantém a chave) → L → porta → E: a porta abre", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    // `once`: recarregar mantém o que o jogo gravou (o save inicial só entra na primeira carga)
    await lightGame(page, testInfo, {}, { once: true });
    await openGame(page);
    expect((await cripta(page))?.place).toBe("entrada");

    // sem a chave e sem a 3ª pista, a porta não é de segurar: aviso "E" sem anel; E bate e diz "trancada."
    await goPlace(page, "porta", /porta/);
    await cycleTo(page, "abrir a porta");
    await expect(prompt(page).locator("kbd")).toHaveText("E");
    await expect(page.locator("[data-game-ring]")).toHaveCount(0);
    await page.keyboard.press("KeyE");
    await expect(line(page)).toContainText("trancada.", { timeout: 20_000 });
    expect((await save(page))?.flags[DOOR_FLAG]).not.toBe(true);

    await goPlace(page, "mesa", /mesa/);
    await cycleTo(page, "ler o bilhete");
    await page.keyboard.press("KeyE");
    await expect(reader(page)).toBeVisible({ timeout: 20_000 });
    await page.keyboard.press("KeyR");
    await expect(page.locator("[data-reader-clean]")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("[data-reader-clean]")).toContainText("na prateleira de cima, lá no fundo.");
    await page.keyboard.press("KeyE");
    await expect(reader(page)).toHaveCount(0);
    expect((await save(page))?.puzzles.cinza?.noteRead).toBe(true);

    await goPlace(page, "armario", /armário/);
    await cycleTo(page, "pegar a chave");
    await page.keyboard.press("KeyE");
    await expect(line(page)).toContainText("prateleira de cima", { timeout: 20_000 });
    await expect.poll(async () => (await save(page))?.items).toContain("chave");

    // recarregar no meio: a chave segue no inventário, o lugar e o bilhete lido também
    await page.reload();
    await openGame(page);
    const after = await save(page);
    expect(after?.items).toContain("chave");
    expect(after?.puzzles.cinza).toMatchObject({ noteRead: true, keyTaken: true, doorOpen: false });
    expect((await cripta(page))?.place).toBe("armario");

    await goPlace(page, "porta", /porta/);
    await cycleTo(page, "usar a chave na porta");
    // com a chave, a porta não é de segurar: o aviso é de apertar (E), sem anel
    await expect(prompt(page).locator("kbd")).toHaveText("E");
    await page.keyboard.press("KeyE");
    await expect(line(page)).toContainText("a chave gira", { timeout: 20_000 });
    await expect.poll(async () => (await save(page))?.flags[DOOR_FLAG], { timeout: 10_000 }).toBe(true);
    const done = await save(page);
    expect(done?.puzzles.cinza).toMatchObject({ doorOpen: true, forced: false });
    // a chave ficou na fechadura da porta
    expect(done?.items).not.toContain("chave");
    expect(errors).toEqual([]);
  });

  test("escada com hintgap=2: sem agir, as 3 pistas saem (como falas) e forçar fica disponível; segurar E força", async ({ page }, testInfo) => {
    await lightGame(page, testInfo, { place: "porta" });
    await openGame(page, "&hintgap=2");
    const t0 = Date.now();
    await expect.poll(async () => (await save(page))?.puzzles.cinza?.hints ?? 0, { timeout: 40_000, intervals: [250] }).toBe(3);
    const seconds = (Date.now() - t0) / 1000;
    testInfo.annotations.push({ type: "pistas", description: `3 pistas em ${seconds.toFixed(1)} s de relógio (dt preso em 0,05 s por quadro no SwiftShader)` });
    for (const h of HINTS) await expect.poll(() => lines(page), { timeout: 10_000 }).toContain(h);
    // a porta (sem a chave) virou de segurar: "segure E" com o anel
    await cycleTo(page, "forçar a porta");
    await expect(prompt(page).locator("kbd")).toHaveText("segure E");
    await expect(page.locator("[data-game-ring]")).toHaveCount(1);
    await page.keyboard.down("KeyE");
    await expect.poll(async () => (await save(page))?.flags[DOOR_FLAG], { timeout: 60_000 }).toBe(true);
    await page.keyboard.up("KeyE");
    expect((await save(page))?.puzzles.cinza).toMatchObject({ doorOpen: true, forced: true, keyTaken: false });
    await expect.poll(() => lines(page)).toContain("a fechadura estala e cede. a porta abre torta.");
  });

  test("pausado (Esc) a escada não anda: 2× o intervalo sem pista nova; voltar à cena retoma", async ({ page }, testInfo) => {
    await lightGame(page, testInfo, { place: "porta" });
    await openGame(page, "&hintgap=3");
    const box = await stage(page).boundingBox();
    if (!box) throw new Error("sem palco");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect.poll(() => locked(page), { timeout: 10_000 }).toBe(true);
    await page.keyboard.press("Escape");
    await page.evaluate(() => document.exitPointerLock());
    await expect(page.locator("[data-game-paused]")).toBeVisible({ timeout: 10_000 });
    const before = (await save(page))?.puzzles.cinza?.hints ?? 0;
    expect(before).toBeLessThan(3);
    // 2× o intervalo em tempo de JOGO: ≥ 6,5 s de relógio E ≥ 120 quadros (o dt é preso em 0,05 s por quadro)
    const f0 = (await cripta(page))?.frames ?? 0;
    await page.waitForTimeout(6_500);
    await expect.poll(async () => (await cripta(page))?.frames ?? 0, { timeout: 60_000 }).toBeGreaterThan(f0 + 2 * 3 / 0.05);
    expect((await save(page))?.puzzles.cinza?.hints ?? 0).toBe(before);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator("[data-game-paused]")).toHaveCount(0);
    await expect.poll(async () => (await save(page))?.puzzles.cinza?.hints ?? 0, { timeout: 40_000 }).toBeGreaterThan(before);
    // a pista aparece na tela (não foi gasta invisível)
    await expect.poll(() => lines(page), { timeout: 20_000 }).toContain(HINTS[before]);
  });

  test("Review Focus 5 (mouse travado de verdade): E abre o bilhete e solta, E fecha e trava; Tab/Tab no celular; E/⌫ no exame; Tab preso no leitor; Esc → pausado e o jogo continua", async ({ page }, testInfo) => {
    await lightGame(page, testInfo, { place: "mesa" });
    await openGame(page);
    const box = await stage(page).boundingBox();
    if (!box) throw new Error("sem palco");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect.poll(() => locked(page), { timeout: 10_000 }).toBe(true);

    // leitor: E abre (o mouse solta), E fecha (trava de novo no mesmo gesto, no palco do jogo)
    await cycleTo(page, "ler o bilhete");
    await page.keyboard.press("KeyE");
    await expect(reader(page)).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => anyLock(page)).toBe(false);
    // com o leitor aberto, Tab e Shift+Tab não saem do diálogo
    for (const k of ["Tab", "Tab", "Tab", "Shift+Tab", "Shift+Tab"]) {
      await page.keyboard.press(k);
      expect(await reader(page).evaluate((d) => d.contains(document.activeElement)), k).toBe(true);
    }
    await page.keyboard.press("KeyE");
    await expect(reader(page)).toHaveCount(0);
    await expect.poll(() => locked(page), { timeout: 10_000 }).toBe(true);

    // celular: Tab abre (solta), Tab fecha (trava)
    await page.keyboard.press("Tab");
    await expect(page.locator("[data-lcd-title]")).toBeVisible({ timeout: 40_000 });
    await expect.poll(() => anyLock(page)).toBe(false);
    await page.keyboard.press("Tab");
    await expect.poll(async () => (await cripta(page))?.interact?.mode, { timeout: 20_000 }).toBe("walk");
    await expect.poll(() => locked(page), { timeout: 10_000 }).toBe(true);

    // exame: E abre (solta), ⌫ fecha (trava)
    await cycleTo(page, "abrir o caderno");
    await page.keyboard.press("KeyE");
    await expect(page.locator("[data-game-examine]")).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => anyLock(page)).toBe(false);
    await page.keyboard.press("Backspace");
    await expect(page.locator("[data-game-examine]")).toHaveCount(0);
    await expect.poll(() => locked(page), { timeout: 10_000 }).toBe(true);

    // Esc com o mouse travado: a tecla chega (nada fecha); a soltura do navegador é emulada; aparece "pausado"
    await page.keyboard.press("Escape");
    await page.evaluate(() => document.exitPointerLock());
    await expect(page.locator("[data-game-paused]")).toHaveText("pausado · clique na cena para continuar", { timeout: 10_000 });
    await expect(page.locator("[data-game-shell]")).toBeVisible();
    const frames = (await cripta(page))?.frames ?? 0;
    await expect.poll(async () => (await cripta(page))?.frames ?? 0, { timeout: 10_000 }).toBeGreaterThan(frames);
    // clicar na cena trava de novo e o aviso some
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect.poll(() => locked(page), { timeout: 10_000 }).toBe(true);
    await expect(page.locator("[data-game-paused]")).toHaveCount(0);
  });
});

test.describe("mobile · por toque", () => {
  test.skip(({ isMobile }) => !isMobile, "toque: projeto mobile");

  /** Toque no objeto: o olhar vira para ele (debug, o mesmo caminho do ciclo) e o dedo toca o centro do palco. */
  async function tapObject(page: Page, id: string) {
    expect(await page.evaluate((i) => (window as unknown as CriptaWindow).__cripta?.aimAt(i) ?? false, id)).toBe(true);
    await expect.poll(async () => (await cripta(page))?.interact?.aimedId, { timeout: 40_000 }).toBe(id);
    const box = await stage(page).boundingBox();
    if (!box) throw new Error("sem palco");
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  }
  async function touchPlace(page: Page, id: string, name: RegExp) {
    await page.getByRole("button", { name: "abrir os lugares" }).tap();
    const nav = page.getByRole("navigation", { name: "Lugares" });
    await expect(nav).toBeVisible({ timeout: 20_000 });
    await nav.getByRole("button", { name }).tap();
    await expect.poll(async () => (await cripta(page))?.place, { timeout: 60_000 }).toBe(id);
  }
  /** Dedo de verdade (CDP: eventos de toque do navegador, não sintéticos do DOM). */
  async function finger(page: Page) {
    const cdp = await page.context().newCDPSession(page);
    const box = await stage(page).boundingBox();
    if (!box) throw new Error("sem palco");
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const send = (type: "touchStart" | "touchMove" | "touchEnd", points: { x: number; y: number }[]) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: i })) });
    return { cx, cy, send };
  }

  test("o mesmo caminho por toque: lugares → mesa → bilhete (ler, fechar) → armário (chave) → porta (abre)", async ({ page }, testInfo) => {
    await lightGame(page, testInfo, {});
    await openGame(page);
    await touchPlace(page, "mesa", /mesa/);
    await tapObject(page, "bilhete");
    await expect(reader(page)).toBeVisible({ timeout: 20_000 });
    await page.locator("[data-reader-toggle]").tap();
    await expect(page.locator("[data-reader-clean]")).toBeVisible({ timeout: 10_000 });
    await page.locator("[data-reader-close]").tap();
    await expect(reader(page)).toHaveCount(0);

    await touchPlace(page, "armario", /armário/);
    await tapObject(page, "armario");
    await expect.poll(async () => (await save(page))?.items, { timeout: 20_000 }).toContain("chave");

    await touchPlace(page, "porta", /porta/);
    await tapObject(page, "porta");
    await expect.poll(async () => (await save(page))?.flags[DOOR_FLAG], { timeout: 20_000 }).toBe(true);
    expect((await save(page))?.puzzles.cinza).toMatchObject({ noteRead: true, keyTaken: true, doorOpen: true, forced: false });
  });

  test("segurar por toque: dedo parado na porta mostra o anel no dedo; soltar cedo cancela; o dedo sair cancela; segurar até o fim força", async ({ page }, testInfo) => {
    await lightGame(page, testInfo, { place: "porta", puzzles: { cinza: { hints: 3 } } });
    await openGame(page);
    expect(await page.evaluate(() => (window as unknown as CriptaWindow).__cripta?.aimAt("porta") ?? false)).toBe(true);
    await expect.poll(async () => (await cripta(page))?.interact?.aimedId, { timeout: 40_000 }).toBe("porta");
    const f = await finger(page);

    // soltar no meio: o anel aparece no dedo e não age
    await f.send("touchStart", [{ x: f.cx, y: f.cy }]);
    await expect(page.locator("[data-game-prompt][data-at]")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("[data-game-ring]")).toHaveCount(1);
    await expect(prompt(page).locator("kbd")).toHaveText("segure");
    await expect.poll(async () => (await cripta(page))?.interact?.holdProgress ?? 0, { timeout: 20_000 }).toBeGreaterThan(0.2);
    await f.send("touchEnd", []);
    await expect.poll(async () => (await cripta(page))?.interact?.holdId, { timeout: 20_000 }).toBeNull();
    expect((await save(page))?.flags[DOOR_FLAG]).not.toBe(true);

    // o dedo sai muito do alvo: cancela (e vira olhar)
    await f.send("touchStart", [{ x: f.cx, y: f.cy }]);
    await expect.poll(async () => (await cripta(page))?.interact?.holdId, { timeout: 20_000 }).toBe("porta");
    await f.send("touchMove", [{ x: f.cx + 120, y: f.cy }]);
    await expect.poll(async () => (await cripta(page))?.interact?.holdId, { timeout: 20_000 }).toBeNull();
    await f.send("touchEnd", []);
    expect((await save(page))?.flags[DOOR_FLAG]).not.toBe(true);

    // de volta à porta, segurar até o fim: força
    expect(await page.evaluate(() => (window as unknown as CriptaWindow).__cripta?.aimAt("porta") ?? false)).toBe(true);
    await expect.poll(async () => (await cripta(page))?.interact?.aimedId, { timeout: 40_000 }).toBe("porta");
    await f.send("touchStart", [{ x: f.cx, y: f.cy }]);
    await expect.poll(async () => (await save(page))?.flags[DOOR_FLAG], { timeout: 60_000 }).toBe(true);
    await f.send("touchEnd", []);
    expect((await save(page))?.puzzles.cinza).toMatchObject({ doorOpen: true, forced: true });
  });

  test("pinça no exame: abrir dois dedos aproxima o caderno, fechar afasta", async ({ page }, testInfo) => {
    await lightGame(page, testInfo, { place: "mesa" });
    await openGame(page);
    await tapObject(page, "caderno");
    await expect(page.locator("[data-game-examine]")).toBeVisible({ timeout: 20_000 });
    const d0 = (await cripta(page))?.interact?.examine.distance ?? 0;
    expect(d0).toBeGreaterThan(0);
    const f = await finger(page);
    await f.send("touchStart", [{ x: f.cx - 40, y: f.cy }, { x: f.cx + 40, y: f.cy }]);
    for (const spread of [70, 100, 130, 160]) await f.send("touchMove", [{ x: f.cx - spread, y: f.cy }, { x: f.cx + spread, y: f.cy }]);
    await f.send("touchEnd", []);
    await expect.poll(async () => (await cripta(page))?.interact?.examine.distance ?? d0, { timeout: 20_000 }).toBeLessThan(d0 * 0.8);
    const near = (await cripta(page))?.interact?.examine.distance ?? 0;
    await f.send("touchStart", [{ x: f.cx - 160, y: f.cy }, { x: f.cx + 160, y: f.cy }]);
    for (const spread of [120, 80, 40]) await f.send("touchMove", [{ x: f.cx - spread, y: f.cy }, { x: f.cx + spread, y: f.cy }]);
    await f.send("touchEnd", []);
    await expect.poll(async () => (await cripta(page))?.interact?.examine.distance ?? 0, { timeout: 20_000 }).toBeGreaterThan(near * 1.2);
  });
});
