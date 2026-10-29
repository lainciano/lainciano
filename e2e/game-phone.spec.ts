import { expect, test, type Page } from "@playwright/test";
import { lightGame } from "./helpers/light";

// T11: celular de 2005. Desktop com teclado e mouse (o toque tem os mesmos botões; o marco mobile roda no fim da
// fase). `window.__cripta.interact.phone` (debug) dá a tela, o item e onde está a tela do aparelho; a pilha vem de
// `mode`/`panels`; o resto é a tela de `[data-game-phone]`/`[data-lcd-*]`. Quadro leve (helpers/light.ts).

type Interact = {
  panels: number;
  mode: string;
  phone: { open: boolean; screen: string | null; index: number; detail: string | null; rect: { x: number; y: number; w: number; h: number } | null };
  reader: { open: boolean; id: string | null; returnTo: string | null };
};
type CriptaWindow = Window & {
  __cripta?: {
    place: string | null;
    interact: Interact | null;
    camera: { fov: number };
    save: { settings: { fov: number; quality: unknown; subtitles: boolean } };
    renderer: { frames: number; programs: number; memory: { geometries: number; textures: number } };
    handsState: { mode: string; phone: string } | null;
  };
  __lock?: { requests: number; exits: number };
};

test.describe.configure({ timeout: 150_000 });
test.skip(({ isMobile }) => isMobile, "celular com teclado e mouse: desktop");

test.beforeEach(async ({ page }) => {
  await page.route("**/api/run", (route) =>
    route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ runId: "e2e", issuedAt: 0, token: "e2e" }) }));
  await page.addInitScript(() => {
    if (!localStorage.getItem("lainciano:som:v1")) localStorage.setItem("lainciano:som:v1", "off");
  });
});

const w = (page: Page) => page.evaluate(() => (window as unknown as CriptaWindow).__cripta);
const interact = (page: Page) => page.evaluate(() => (window as unknown as CriptaWindow).__cripta?.interact ?? null);
const hands = (page: Page) => page.evaluate(() => (window as unknown as CriptaWindow).__cripta?.handsState ?? null);
const phoneDialog = (page: Page) => page.getByRole("dialog", { name: "celular" });
const lcd = (page: Page) => page.locator("[data-phone-lcd]");
const selected = (page: Page) => page.locator("[data-lcd-body] [data-selected]");
const focusedRow = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute("data-row-id") ?? null);

async function hydrated(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => {
    const main = document.querySelector("main");
    return !!main && Object.keys(main).some((key) => key.startsWith("__reactFiber"));
  });
}

async function openGame(page: Page) {
  await page.goto("/?jogo=1&debug=1");
  await hydrated(page);
  await expect(page.locator("[data-game-loading]")).toHaveCount(0, { timeout: 30_000 });
  await expect.poll(async () => (await w(page))?.renderer.frames ?? 0, { timeout: 30_000 }).toBeGreaterThan(3);
}

/** Tab abre; espera a tampa abrir e o LCD aparecer. */
async function openPhone(page: Page) {
  await page.keyboard.press("Tab");
  await expect(phoneDialog(page)).toBeVisible({ timeout: 20_000 });
  await expect(lcd(page)).toBeVisible({ timeout: 30_000 });
}

/** Desce até a linha `id` (pelas setas) e aperta Enter. */
async function choose(page: Page, id: string) {
  for (let i = 0; i < 12; i++) {
    if ((await selected(page).getAttribute("data-row-id")) === id) break;
    await page.keyboard.press("ArrowDown");
  }
  await expect(selected(page)).toHaveAttribute("data-row-id", id);
  await page.keyboard.press("Enter");
}

/** Simula o travamento do ponteiro (conta pedidos e solturas) antes da página carregar. */
async function fakePointerLock(page: Page) {
  await page.addInitScript(() => {
    const win = window as unknown as CriptaWindow;
    win.__lock = { requests: 0, exits: 0 };
    let locked: Element | null = null;
    Object.defineProperty(document, "pointerLockElement", { get: () => locked, configurable: true });
    Element.prototype.requestPointerLock = function (this: Element) {
      (win.__lock as { requests: number }).requests += 1;
      [locked] = [this];
      queueMicrotask(() => document.dispatchEvent(new Event("pointerlockchange")));
      return Promise.resolve() as never;
    };
    document.exitPointerLock = () => {
      (win.__lock as { exits: number }).exits += 1;
      if (!locked) return;
      locked = null;
      queueMicrotask(() => document.dispatchEvent(new Event("pointerlockchange")));
    };
  });
}
const lock = (page: Page) => page.evaluate(() => ({ ...(window as unknown as CriptaWindow).__lock!, locked: !!document.pointerLockElement }));

test.describe("celular de 2005", () => {
  test("Tab abre (modal, lanterna guardada, LCD sobre a tela do aparelho); setas e Enter navegam; FOV 70 muda a câmera e fica depois de recarregar; sair do jogo fecha", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await lightGame(page, testInfo, { place: "mesa" }, { once: true });
    await openGame(page);
    expect((await w(page))?.camera.fov).toBe(62);

    await openPhone(page);
    const s = await interact(page);
    expect(s?.mode).toBe("phone");
    expect(s?.panels).toBe(1);
    expect(s?.phone).toMatchObject({ open: true, screen: "menu", index: 0 });
    await expect.poll(async () => (await hands(page))?.mode, { timeout: 20_000 }).toBe("holstered");
    expect((await hands(page))?.phone).toBe("holding");
    // modal de verdade; o palco e o botão de sair ficam inertes; sem mira
    expect(await phoneDialog(page).evaluate((el) => (el as HTMLDialogElement).matches(":modal"))).toBe(true);
    expect(await page.locator("[data-game-exit]").evaluate((el) => {
      (el as HTMLElement).focus();
      return document.activeElement === el;
    })).toBe(false);
    await expect(page.locator("[data-game-reticle]")).toHaveCount(0);
    // o LCD fica onde a tela do aparelho está (a sessão mede a projeção dos cantos)
    const rect = s!.phone.rect!;
    const box = (await lcd(page).boundingBox())!;
    expect(Math.abs(box.x + box.width / 2 - rect.x)).toBeLessThan(3);
    expect(Math.abs(box.y + box.height / 2 - rect.y)).toBeLessThan(3);
    expect(box.height).toBeGreaterThan(100);
    // o item marcado tem o foco
    expect(await focusedRow(page)).toBe("mensagens");

    // setas dão a volta; o mapa está apagado sem o item mapa
    await page.keyboard.press("ArrowUp");
    await expect(selected(page)).toHaveAttribute("data-row-id", "ajustes");
    await page.keyboard.press("ArrowDown");
    await expect(selected(page)).toHaveAttribute("data-row-id", "mensagens");
    await expect(page.locator('[data-row-id="mapa"]')).toHaveAttribute("aria-disabled", "true");

    await choose(page, "ajustes");
    await expect(page.locator("[data-lcd-title]")).toHaveText("ajustes");
    await choose(page, "fov");
    await expect(page.locator('[data-row-id="fov"]')).toContainText("70°");
    await expect.poll(async () => (await w(page))?.camera.fov).toBe(70);
    expect((await w(page))?.save.settings.fov).toBe(70);
    // o celular segue no mesmo item
    expect(await focusedRow(page)).toBe("fov");

    // recarregar a página com o jogo: o FOV gravado volta
    await openGame(page);
    expect((await w(page))?.camera.fov).toBe(70);

    // sair do jogo pelo celular
    await openPhone(page);
    await choose(page, "ajustes");
    await choose(page, "exit");
    await expect(page.locator("[data-game-shell]")).toHaveCount(0, { timeout: 20_000 });
    expect(errors).toEqual([]);
  });

  test("Arquivo: o documento abre em tela cheia como o celular; E volta ao celular (mesma tela e item); E, E fecha; o mouse só re-trava com a pilha vazia; a lanterna volta", async ({ page }, testInfo) => {
    await fakePointerLock(page);
    await lightGame(page, testInfo, { place: "mesa", flags: { "lido:bilhete": true } });
    await openGame(page);
    await page.mouse.click(400, 250);
    await expect.poll(() => lock(page)).toMatchObject({ requests: 1, locked: true });

    await openPhone(page);
    await expect.poll(() => lock(page)).toMatchObject({ locked: false });
    await expect(page.locator('[data-row-id="arquivo"]')).toContainText("1");
    await choose(page, "arquivo");
    await choose(page, "doc:bilhete");

    // o leitor por cima, na variante do celular; a pilha tem os dois
    const reader = page.getByRole("dialog", { name: "bilhete" });
    await expect(reader).toBeVisible({ timeout: 20_000 });
    await expect(reader).toHaveAttribute("data-variant", "phone");
    expect(await reader.evaluate((el) => (el as HTMLDialogElement).matches(":modal"))).toBe(true);
    let s = await interact(page);
    expect(s).toMatchObject({ mode: "read", panels: 2, reader: { open: true, id: "bilhete", returnTo: "phone" } });
    // ocupa a tela inteira, deitado (largura > altura)
    await expect.poll(async () => (await reader.boundingBox())?.width).toBe(800);

    // E: volta ao celular, no Arquivo, no bilhete; o mouse não trava (o celular ainda está aberto)
    await page.keyboard.press("KeyE");
    await expect(reader).toHaveCount(0);
    s = await interact(page);
    expect(s).toMatchObject({ mode: "phone", panels: 1, phone: { open: true, screen: "arquivo", index: 0 } });
    await expect(lcd(page)).toBeVisible();
    await expect.poll(() => focusedRow(page)).toBe("doc:bilhete");
    expect(await lock(page)).toMatchObject({ requests: 1, locked: false });

    // E volta ao menu; E fecha; o mouse trava de novo no mesmo gesto
    await page.keyboard.press("KeyE");
    await expect(page.locator("[data-lcd-title]")).toHaveText("menu");
    await expect(selected(page)).toHaveAttribute("data-row-id", "arquivo");
    await page.keyboard.press("KeyE");
    await expect(phoneDialog(page)).toHaveCount(0);
    s = await interact(page);
    expect(s).toMatchObject({ mode: "walk", panels: 0, phone: { open: false } });
    await expect.poll(() => lock(page)).toMatchObject({ requests: 2, locked: true });
    // a lanterna volta à mão depois de o aparelho descer
    await expect.poll(async () => (await hands(page))?.mode, { timeout: 20_000 }).toBe("held");
    expect((await hands(page))?.phone).toBe("none");
  });

  test("botão direito volta; Tab fecha de qualquer tela; ok num lugar do mapa (com o item mapa) leva até ele", async ({ page }, testInfo) => {
    await lightGame(page, testInfo, { place: "entrada", items: ["mapa"] });
    await openGame(page);
    await openPhone(page);
    await choose(page, "ajustes");
    await page.mouse.click(400, 250, { button: "right" });
    await expect(page.locator("[data-lcd-title]")).toHaveText("menu");
    await choose(page, "itens");
    await page.keyboard.press("Tab");
    await expect(phoneDialog(page)).toHaveCount(0);
    expect((await interact(page))?.mode).toBe("walk");

    await openPhone(page);
    await choose(page, "mapa");
    await choose(page, "place:mesa");
    await expect(phoneDialog(page)).toHaveCount(0);
    await expect.poll(async () => (await w(page))?.place, { timeout: 30_000 }).toBe("mesa");
  });

  test("movimento reduzido: o documento abre em tela cheia sem animação de giro", async ({ page }, testInfo) => {
    await lightGame(page, testInfo, { place: "mesa", flags: { "lido:bilhete": true } });
    await openGame(page);
    // depois de abrir: com o movimento reduzido desde o carregamento o site entra em modo leitura e o jogo não abre
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openPhone(page);
    await choose(page, "arquivo");
    await choose(page, "doc:bilhete");
    const reader = page.getByRole("dialog", { name: "bilhete" });
    await expect(reader).toBeVisible({ timeout: 20_000 });
    const turning = await page.evaluate(() => document.getAnimations().filter((a) => (a as CSSAnimation).animationName === "game-phone-turn").length);
    expect(turning).toBe(0);
    await page.keyboard.press("KeyE");
    const returning = await page.evaluate(() => document.getAnimations().filter((a) => (a as CSSAnimation).animationName === "game-lcd-return").length);
    expect(returning).toBe(0);
  });

  test("@slow vazamento: 20 aberturas do celular não fazem crescer geometrias, texturas nem programas", async ({ page }, testInfo) => {
    await lightGame(page, testInfo, { place: "mesa" });
    await openGame(page);
    // abrir e fechar em ≤ 120 ms cada (as mãos seguem a preferência ao vivo)
    await page.emulateMedia({ reducedMotion: "reduce" });
    // sem ociosas sorteadas (a mão esquerda "ajeitando" sobe geometrias que nunca tinham aparecido, uma vez só, em
    // ciclos aleatórios): o que sobra é só o celular
    await page.evaluate(() => (window as unknown as { __cripta: { handsDebug(o: { still: boolean }): void } }).__cripta.handsDebug({ still: true }));
    const cycle = async () => {
      await page.keyboard.press("Tab");
      await expect.poll(async () => (await hands(page))?.phone, { timeout: 20_000 }).toBe("holding");
      await expect(lcd(page)).toBeVisible();
      await page.keyboard.press("Tab");
      await expect.poll(async () => (await hands(page))?.phone, { timeout: 20_000 }).toBe("none");
    };
    const seen: { geometries: number; textures: number; programs: number }[] = [];
    for (let i = 0; i < 20; i++) {
      await cycle();
      const r = (await w(page))!.renderer;
      seen.push({ geometries: r.memory.geometries, textures: r.memory.textures, programs: r.programs });
    }
    testInfo.annotations.push({ type: "memória por ciclo", description: JSON.stringify(seen) });
    // O 1º ciclo sobe o aparelho (4 geometrias, 3 texturas). Depois disso texturas e programas ficam planos. As
    // geometrias ainda sobem até +4 em ciclos esparsos e param (medido: 155 → 156 no 2º, 157 no 8º, 158 no 10º,
    // e 158 até o 20º): é a 1ª vez que uma falange ou unha da mão entra no quadro numa pose amostrada (o WebGL só sobe
    // a geometria quando a desenha), não o celular, que é um só (ver hands.test.ts: mesmo modelo e mesma contagem em
    // 20 aberturas). Vazamento seria crescer até o fim: os últimos 10 ciclos têm de ser iguais.
    for (const k of ["textures", "programs"] as const) expect(new Set(seen.slice(1).map((x) => x[k])).size, k).toBe(1);
    expect(new Set(seen.slice(10).map((x) => x.geometries)).size, "geometrias nos últimos 10 ciclos").toBe(1);
    expect(seen[19].geometries - seen[0].geometries, "geometrias de mão vistas pela 1ª vez").toBeLessThanOrEqual(6);
    expect((await interact(page))?.panels).toBe(0);
  });
});
