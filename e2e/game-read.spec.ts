import { expect, test, type Locator, type Page } from "@playwright/test";
import { lineDuration, splitWords } from "../src/game/shell/subtitles";
import { lightGame } from "./helpers/light";

// T10: leitor em dois níveis e legendas. Desktop, teclado e mouse (o toque tem os mesmos botões; o marco mobile roda
// no fim da fase). `window.__cripta.interact` (debug) dá o estado da pilha de painéis; o resto é a tela de
// `[data-game-*]` e `[data-reader-*]`. O travamento do mouse é simulado (o SwiftShader headless não trava de verdade).
// Quadro leve (helpers/light.ts): estes testes são de ciclo de vida e DOM, não de imagem.

type Interact = {
  aimedId: string | null;
  panel: boolean;
  panels: number;
  mode: string;
  reader: { open: boolean; id: string | null; clean: boolean; returnTo: string | null };
  cameraChildren: number;
};
type CriptaWindow = Window & {
  __cripta?: {
    place: string | null;
    interact: Interact | null;
    aimAt(id: string): boolean;
    renderer: { frames: number; programs: number; memory: { geometries: number; textures: number } };
    handsState: { mode: string } | null;
  };
  __lock?: { requests: number; exits: number };
  __made?: HTMLCanvasElement[];
};

test.describe.configure({ timeout: 120_000 });
test.skip(({ isMobile }) => isMobile, "leitor e legendas com teclado e mouse: desktop");

const NOTE_TEXT = "o que abre a porta eu deixei no armário.";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/run", (route) =>
    route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ runId: "e2e", issuedAt: 0, token: "e2e" }) }));
  await page.addInitScript(() => {
    if (!localStorage.getItem("lainciano:som:v1")) localStorage.setItem("lainciano:som:v1", "off");
  });
});

async function hydrated(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => {
    const main = document.querySelector("main");
    return !!main && Object.keys(main).some((key) => key.startsWith("__reactFiber"));
  });
}

/** Abre o jogo leve parado em `place` (o save manda). */
async function openAt(page: Page, testInfo: Parameters<typeof lightGame>[1], place: string) {
  await lightGame(page, testInfo, { place });
  await page.goto("/?jogo=1&debug=1");
  await hydrated(page);
  await expect(page.locator("[data-game-loading]")).toHaveCount(0, { timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as CriptaWindow).__cripta?.renderer.frames ?? 0), { timeout: 30_000 }).toBeGreaterThan(3);
  await expect.poll(() => page.evaluate(() => (window as unknown as CriptaWindow).__cripta?.place), { timeout: 10_000 }).toBe(place);
}

const interact = (page: Page) => page.evaluate(() => (window as unknown as CriptaWindow).__cripta?.interact ?? null);
const prompt = (page: Page) => page.locator("[data-game-prompt]");
const dialog = (page: Page) => page.getByRole("dialog", { name: "bilhete" });
const hands = (page: Page) => page.evaluate(() => (window as unknown as CriptaWindow).__cripta?.handsState?.mode);

async function aimAndWait(page: Page, id: string, text: string) {
  expect(await page.evaluate((i) => (window as unknown as CriptaWindow).__cripta?.aimAt(i) ?? false, id)).toBe(true);
  await expect(prompt(page)).toContainText(text, { timeout: 30_000 });
  expect((await interact(page))?.aimedId).toBe(id);
}

/** Mira o bilhete (lugar da mesa) e aperta E: o leitor abre. */
async function openNote(page: Page) {
  await aimAndWait(page, "bilhete", "ler o bilhete");
  await page.keyboard.press("KeyE");
  await expect(dialog(page)).toBeVisible({ timeout: 20_000 });
}

/** Simula o travamento do ponteiro (conta pedidos e solturas) antes da página carregar. */
async function fakePointerLock(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as CriptaWindow;
    w.__lock = { requests: 0, exits: 0 };
    let locked: Element | null = null;
    Object.defineProperty(document, "pointerLockElement", { get: () => locked, configurable: true });
    Element.prototype.requestPointerLock = function (this: Element) {
      (w.__lock as { requests: number }).requests += 1;
      [locked] = [this];
      queueMicrotask(() => document.dispatchEvent(new Event("pointerlockchange")));
      return Promise.resolve() as never;
    };
    document.exitPointerLock = () => {
      (w.__lock as { exits: number }).exits += 1;
      if (!locked) return;
      locked = null;
      queueMicrotask(() => document.dispatchEvent(new Event("pointerlockchange")));
    };
  });
}
const lock = (page: Page) => page.evaluate(() => ({ ...(window as unknown as CriptaWindow).__lock!, locked: !!document.pointerLockElement }));

/** O canvas do papel tem tinta, papel e cor de verdade (não está vazio nem liso). */
async function paperStats(canvas: Locator) {
  return canvas.evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const g = c.getContext("2d");
    if (!g || c.width === 0) return { w: c.width, h: c.height, opaque: 0, ink: 0, colors: 0 };
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let opaque = 0;
    let ink = 0;
    const colors = new Set<number>();
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      opaque += 1;
      if ((d[i] + d[i + 1] + d[i + 2]) / 3 < 90) ink += 1;
      colors.add(((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3));
    }
    return { w: c.width, h: c.height, opaque: opaque / (c.width * c.height), ink, colors: colors.size };
  });
}

test.describe("leitor em dois níveis", () => {
  test("E no bilhete abre o leitor: nome acessível, papel pintado (nível 1), R mostra o texto limpo (nível 2), E fecha", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await openAt(page, testInfo, "mesa");
    await openNote(page);

    // é um painel na pilha: modo de leitura, lanterna guardada, sem aviso nem mira
    let s = await interact(page);
    expect(s?.mode).toBe("read");
    expect(s?.panels).toBe(1);
    expect(s?.reader).toEqual({ open: true, id: "bilhete", clean: false, returnTo: null });
    await expect.poll(() => hands(page), { timeout: 20_000 }).toBe("holstered");
    await expect(prompt(page)).toBeEmpty();
    await expect(page.locator("[data-game-reticle]")).toHaveCount(0);

    // modal de verdade; nome acessível = título; a descrição é o texto limpo (o leitor de tela lê sem apertar R)
    expect(await dialog(page).evaluate((el) => (el as HTMLDialogElement).matches(":modal"))).toBe(true);
    await expect(dialog(page)).toHaveAccessibleName("bilhete");
    await expect(dialog(page)).toHaveAccessibleDescription(new RegExp(NOTE_TEXT));

    // nível 1: a imagem do documento, pintada em código (papel, tinta, tons); o texto limpo ainda não aparece
    const paper = page.locator("[data-reader-paper]");
    await expect(paper).toBeVisible();
    await expect(paper).toHaveAttribute("data-ready", "", { timeout: 20_000 });
    const stats = await paperStats(paper);
    expect(stats.w).toBe(760);
    expect(stats.h).toBeGreaterThanOrEqual(540);
    expect(stats.opaque, "o papel preenche a folha (bordas rasgadas deixam alguns cantos vazios)").toBeGreaterThan(0.85);
    expect(stats.ink, "há letra escrita").toBeGreaterThan(1500);
    expect(stats.colors, "papel com manchas e pontilhado, não uma cor lisa").toBeGreaterThan(40);
    await expect(page.locator("[data-reader-clean]")).toBeHidden();

    // rótulos: R ler / E fechar, nunca Esc
    await expect(dialog(page).locator("kbd")).toHaveText(["R", "E"]);
    await expect(dialog(page)).not.toContainText(/esc/i);
    await expect(page.locator("[data-reader-toggle]")).toContainText("ler");
    await expect(page.locator("[data-reader-close]")).toContainText("fechar");

    // R: texto limpo, com o texto do bilhete; o papel some
    await page.keyboard.press("KeyR");
    const clean = page.locator("[data-reader-clean]");
    await expect(clean).toBeVisible();
    await expect(clean).toContainText(NOTE_TEXT);
    await expect(clean).toContainText("se você acordou aqui, ainda dá tempo.");
    await expect(paper).toBeHidden();
    await expect(page.locator("[data-reader-toggle]")).toContainText("ver o papel");
    expect((await interact(page))?.reader.clean).toBe(true);
    await expect(clean).toBeFocused();
    // R de novo volta ao papel (o canvas não é repintado: segue com a tinta)
    await page.keyboard.press("KeyR");
    await expect(paper).toBeVisible();
    await expect(clean).toBeHidden();
    expect((await paperStats(paper)).ink).toBe(stats.ink);
    await expect(page.locator("[data-reader-toggle]")).toBeFocused();

    // E fecha: pilha vazia, andando de novo, lanterna de volta, foco na casca, aviso do bilhete de volta
    await page.keyboard.press("KeyE");
    await expect(dialog(page)).toHaveCount(0);
    s = await interact(page);
    expect(s?.mode).toBe("walk");
    expect(s?.panels).toBe(0);
    expect(s?.reader.open).toBe(false);
    await expect(page.locator("[data-game-shell]")).toBeFocused();
    await expect.poll(() => hands(page), { timeout: 20_000 }).toBe("held");
    await expect(prompt(page)).toContainText("ler o bilhete", { timeout: 30_000 });
    expect(errors).toEqual([]);
  });

  test("⌫, botão direito, Esc (tolerância, sem rótulo) e o botão do leitor também fecham; o botão R alterna", async ({ page }, testInfo) => {
    await openAt(page, testInfo, "mesa");
    await aimAndWait(page, "bilhete", "ler o bilhete");
    for (const how of ["Backspace", "right", "Escape", "button"] as const) {
      await page.keyboard.press("KeyE");
      await expect(dialog(page), `abre (${how})`).toBeVisible({ timeout: 20_000 });
      if (how === "button") {
        await page.locator("[data-reader-toggle]").click();
        await expect(page.locator("[data-reader-clean]")).toBeVisible();
        await page.locator("[data-reader-toggle]").click();
        await expect(page.locator("[data-reader-clean]")).toBeHidden();
      }
      if (how === "right") await page.mouse.click(400, 250, { button: "right" });
      else if (how === "button") await page.locator("[data-reader-close]").click();
      else await page.keyboard.press(how);
      await expect(dialog(page), `fecha (${how})`).toHaveCount(0);
      expect((await interact(page))?.panels).toBe(0);
      await expect(page.locator("[data-game-shell]")).toBeFocused();
      await expect(prompt(page)).toContainText("ler o bilhete", { timeout: 30_000 });
    }
  });

  test("foco preso: Tab e Shift+Tab não saem do diálogo; o palco e o botão de sair ficam inertes; o site também", async ({ page }, testInfo) => {
    await openAt(page, testInfo, "mesa");
    await openNote(page);
    const inside = () => page.evaluate(() => !!document.activeElement?.closest("[data-game-reader]"));
    const which = () =>
      page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (el?.hasAttribute("data-reader-clean")) return "texto";
        if (el?.hasAttribute("data-reader-toggle")) return "ler";
        if (el?.hasAttribute("data-reader-close")) return "fechar";
        return "fora";
      });
    expect(await inside(), "o foco entrou no diálogo ao abrir").toBe(true);
    const seen = new Set<string>();
    for (let i = 0; i < 7; i++) {
      await page.keyboard.press("Tab");
      expect(await inside(), `Tab ${i + 1}`).toBe(true);
      seen.add(await which());
    }
    expect([...seen].sort()).toEqual(["fechar", "ler"]);
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("Shift+Tab");
      expect(await inside(), `Shift+Tab ${i + 1}`).toBe(true);
    }
    // no nível 2 o texto limpo entra na volta do Tab (rolagem por teclado) e o foco continua preso
    await page.keyboard.press("KeyR");
    const order = new Set<string>();
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Tab");
      expect(await inside(), `nível 2, Tab ${i + 1}`).toBe(true);
      order.add(await which());
    }
    expect(order).toEqual(new Set(["texto", "ler", "fechar"]));

    // inerte: o clique no lugar do botão de sair cai no diálogo, não no botão; o site e o HUD têm `inert`
    const exit = page.locator("[data-game-exit]");
    const box = await exit.boundingBox();
    if (!box) throw new Error("sem botão de sair");
    const hit = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return { inReader: !!el?.closest("[data-game-reader]"), isExit: !!el?.closest("[data-game-exit]") };
    }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    expect(hit).toEqual({ inReader: true, isExit: false });
    expect(await page.evaluate(() => document.querySelector(".page-shell")?.hasAttribute("inert"))).toBe(true);
    expect(await page.evaluate(() => document.querySelector("header.hud")?.hasAttribute("inert"))).toBe(true);
    // fechar devolve o foco à casca
    await page.keyboard.press("KeyE");
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.locator("[data-game-shell]")).toBeFocused();
  });

  test("o mouse travado solta ao abrir e trava de novo ao esvaziar a pilha (E, ⌫, botão direito, botão); solto, continua solto", async ({ page }, testInfo) => {
    await fakePointerLock(page);
    await openAt(page, testInfo, "mesa");
    await page.mouse.click(400, 250);
    await expect.poll(() => lock(page)).toMatchObject({ requests: 1, locked: true });
    await aimAndWait(page, "bilhete", "ler o bilhete");
    let requests = 1;
    for (const how of ["KeyE", "Backspace", "right", "button"] as const) {
      await page.keyboard.press("KeyE");
      await expect(dialog(page), `abre (${how})`).toBeVisible({ timeout: 20_000 });
      await expect.poll(() => lock(page)).toMatchObject({ locked: false });
      await expect(page.locator("[data-game-paused]")).toHaveCount(0);
      if (how === "right") await page.mouse.click(400, 250, { button: "right" });
      else if (how === "button") await page.locator("[data-reader-close]").click();
      else await page.keyboard.press(how);
      await expect(dialog(page), `fecha (${how})`).toHaveCount(0);
      requests += 1;
      await expect.poll(() => lock(page), { message: `trava de novo (${how})` }).toMatchObject({ requests, locked: true });
      await expect(page.locator("[data-game-paused]")).toHaveCount(0);
      await expect(prompt(page)).toContainText("ler o bilhete", { timeout: 30_000 });
    }
  });

  test("com o mouse solto, fechar o leitor não trava nada", async ({ page }, testInfo) => {
    await fakePointerLock(page);
    await openAt(page, testInfo, "mesa");
    await openNote(page);
    await page.keyboard.press("KeyE");
    await expect(dialog(page)).toHaveCount(0);
    await page.waitForTimeout(500);
    expect(await lock(page)).toMatchObject({ requests: 0, locked: false });
  });

  test("movimento reduzido: o leitor abre sem animação nem transição", async ({ page }, testInfo) => {
    await openAt(page, testInfo, "mesa");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openNote(page);
    const css = await page.evaluate(() => {
      const d = document.querySelector<HTMLElement>("[data-game-reader]");
      const p = document.querySelector<HTMLElement>("[data-reader-paper]");
      const b = document.querySelector<HTMLElement>("[data-reader-toggle]");
      return {
        dialogAnimation: d ? getComputedStyle(d).animationName : null,
        paperTransition: p ? parseFloat(getComputedStyle(p).transitionDuration) : null,
        buttonTransition: b ? parseFloat(getComputedStyle(b).transitionDuration) : null,
      };
    });
    expect(css).toEqual({ dialogAnimation: "none", paperTransition: 0, buttonTransition: 0 });
    await expect(page.locator("[data-reader-paper]")).toHaveAttribute("data-ready", "", { timeout: 20_000 });
  });

  test("perder o contexto WebGL com o leitor aberto não deixa diálogo, travas nem foco preso", async ({ page }, testInfo) => {
    await openAt(page, testInfo, "mesa");
    await openNote(page);
    await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>("[data-game-stage] canvas");
      canvas?.getContext("webgl2")?.getExtension("WEBGL_lose_context")?.loseContext();
    });
    await expect(page.getByText("O 3D não abriu neste aparelho")).toBeVisible();
    await expect(page.locator("[data-game-reader]")).toHaveCount(0);
    expect(await page.evaluate(() => document.querySelectorAll("dialog[open]").length)).toBe(0);
    await expect(page.getByRole("button", { name: "Voltar ao site" })).toBeFocused();
    await page.getByRole("button", { name: "Voltar ao site" }).click();
    await expect(page.locator("[data-game-shell]")).toHaveCount(0);
    expect(await page.evaluate(() => document.querySelector(".page-shell")?.hasAttribute("inert"))).toBe(false);
  });

  test("12 aberturas e fechamentos: todo canvas criado é zerado, nenhum fica no DOM e a GPU não ganha nada", async ({ page }, testInfo) => {
    await page.addInitScript(() => {
      // registra todo <canvas> criado depois de `__made = []` (o do palco já nasceu e não entra)
      const w = window as unknown as CriptaWindow;
      const original = document.createElement.bind(document);
      document.createElement = ((tag: string, opts?: ElementCreationOptions) => {
        const el = original(tag, opts);
        if (tag.toLowerCase() === "canvas") w.__made?.push(el as HTMLCanvasElement);
        return el;
      }) as typeof document.createElement;
    });
    await openAt(page, testInfo, "mesa");
    await aimAndWait(page, "bilhete", "ler o bilhete");
    const gpu = () => page.evaluate(() => {
      const r = (window as unknown as CriptaWindow).__cripta?.renderer;
      return { geometries: r?.memory.geometries ?? -1, textures: r?.memory.textures ?? -1, programs: r?.programs ?? -1 };
    });
    const canvases = () => page.evaluate(() => document.querySelectorAll("canvas").length);
    const baseCanvases = await canvases();
    let settled = await gpu();
    let kept: { w: number; h: number; connected: boolean }[] = [];
    for (let i = 0; i < 12; i++) {
      await page.evaluate(() => {
        (window as unknown as CriptaWindow).__made = [];
      });
      await page.keyboard.press("KeyE");
      await expect(dialog(page)).toBeVisible({ timeout: 20_000 });
      await expect(page.locator("[data-reader-paper]")).toHaveAttribute("data-ready", "", { timeout: 20_000 });
      // alterna os dois níveis no meio, a cada ciclo
      await page.keyboard.press("KeyR");
      await page.keyboard.press("KeyR");
      const open = await page.evaluate(() => (window as unknown as CriptaWindow).__made?.length ?? 0);
      expect(open, `ciclo ${i}: a pintura criou canvases (o teste enxerga)`).toBeGreaterThan(0);
      await page.keyboard.press("KeyE");
      await expect(dialog(page)).toHaveCount(0);
      kept = await page.evaluate(() => (window as unknown as CriptaWindow).__made?.map((c) => ({ w: c.width, h: c.height, connected: c.isConnected })) ?? []);
      for (const c of kept) expect(c, `ciclo ${i}: canvas do documento zerado e fora do DOM`).toEqual({ w: 0, h: 0, connected: false });
      expect(await canvases(), `ciclo ${i}: nenhum canvas sobrando no DOM`).toBe(baseCanvases);
      await expect(prompt(page)).toContainText("ler o bilhete", { timeout: 30_000 });
      if (i === 1) settled = await gpu();
    }
    // o papel é <canvas> do DOM: nenhuma textura WebGL, geometria ou programa nasce por causa dele
    const end = await gpu();
    expect(end.textures, "texturas").toBe(settled.textures);
    expect(end.programs, "programas").toBe(settled.programs);
    expect(end.geometries - settled.geometries, "geometrias (mãos sobem ao quadro uma vez)").toBeLessThanOrEqual(4);
    expect(kept.length).toBeGreaterThan(0);
  });
});

test.describe("legendas", () => {
  test("uma fala aparece palavra a palavra com faixa e fio, fica lineDuration e some", async ({ page }, testInfo) => {
    await openAt(page, testInfo, "mesa");
    await aimAndWait(page, "mesa", "examinar a mesa");
    const text = "madeira gasta onde os braços apoiavam. alguém escreveu aqui por muito tempo.";
    const words = splitWords(text);
    const live = page.locator("[data-game-subtitles]");
    await expect(live).toHaveAttribute("aria-live", "polite");
    await expect(live).not.toHaveAttribute("data-speaking", /.*/);
    await expect(page.locator("[data-game-line]")).toHaveCount(0);

    await page.keyboard.press("KeyE");
    const line = page.locator("[data-game-line]");
    await expect(line).toBeVisible({ timeout: 20_000 });
    const shownAt = Date.now();
    await expect(line).toHaveText(text);
    await expect(line).toHaveAttribute("data-kind", "speech");
    // faixa escura só durante a fala; o fio vermelho (::before da fala) acende com ela
    await expect(live).toHaveAttribute("data-speaking", "");
    await expect.poll(() => live.evaluate((el) => getComputedStyle(el, "::before").opacity), { timeout: 10_000 }).toBe("1");
    await expect(line).toHaveAttribute("data-on", "", { timeout: 10_000 });
    // palavra a palavra: um span por palavra, cada uma 42 ms depois da anterior (o token do tema)
    const spans = line.locator(".w");
    await expect(spans).toHaveCount(words.length);
    const delays = await spans.evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).transitionDelay)));
    delays.forEach((d, i) => expect(d, `atraso da palavra ${i}`).toBeCloseTo(i * 0.042, 3));
    // tudo aceso ao fim da entrada
    await expect.poll(() => spans.evaluateAll((els) => els.every((el) => getComputedStyle(el).opacity === "1")), { timeout: 10_000 }).toBe(true);
    // serifa grande (21–31 px) e o fio acima
    const px = await line.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(px).toBeGreaterThanOrEqual(21);
    expect(px).toBeLessThanOrEqual(31);

    // some depois de lineDuration (+ a saída de ~0,3 s); a faixa desce junto
    const seconds = lineDuration(text);
    await expect(line).toHaveCount(0, { timeout: (seconds + 4) * 1000 });
    const took = (Date.now() - shownAt) / 1000;
    expect(took).toBeGreaterThanOrEqual(seconds - 0.4);
    expect(took).toBeLessThanOrEqual(seconds + 2.5);
    await expect(live).not.toHaveAttribute("data-speaking", /.*/);
  });

  test("dica do jogo ('nada ao alcance daqui') é mono pequena, sem faixa; a mesma fala duas vezes recomeça a entrada", async ({ page }, testInfo) => {
    await openAt(page, testInfo, "entrada");
    await page.keyboard.press("KeyE");
    const line = page.locator("[data-game-line]");
    await expect(line).toContainText("nada ao alcance daqui", { timeout: 20_000 });
    await expect(line).toHaveAttribute("data-kind", "system");
    await expect(page.locator("[data-game-subtitles]")).not.toHaveAttribute("data-speaking", /.*/);
    const family = await line.evaluate((el) => getComputedStyle(el).fontFamily);
    expect(family).toMatch(/mono|jetbrains/i);
    // a dica de novo (mesmo texto): a entrada recomeça (o elemento é outro)
    const first = await line.elementHandle();
    await page.keyboard.press("KeyE");
    await expect.poll(() => first?.evaluate((el) => el.isConnected) ?? false, { timeout: 10_000 }).toBe(false);
    await expect(line).toContainText("nada ao alcance daqui");
  });

  test("movimento reduzido: a fala aparece direta, sem atraso por palavra nem transição", async ({ page }, testInfo) => {
    await openAt(page, testInfo, "mesa");
    await aimAndWait(page, "mesa", "examinar a mesa");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.keyboard.press("KeyE");
    const line = page.locator("[data-game-line]");
    await expect(line).toBeVisible({ timeout: 20_000 });
    // aceso já no primeiro quadro observável, sem esperar a fila
    await expect(line).toHaveAttribute("data-on", "");
    const spans = line.locator(".w");
    const state = await spans.evaluateAll((els) => els.map((el) => ({ opacity: getComputedStyle(el).opacity, filter: getComputedStyle(el).filter, transition: parseFloat(getComputedStyle(el).transitionDuration) })));
    for (const s of state) expect(s).toEqual({ opacity: "1", filter: "none", transition: 0 });
    expect(await page.locator("[data-game-subtitles]").evaluate((el) => parseFloat(getComputedStyle(el, "::before").transitionDuration))).toBe(0);
    // e some sem a saída animada, ainda dentro do tempo da fala
    await expect(line).toHaveCount(0, { timeout: 15_000 });
  });
});
