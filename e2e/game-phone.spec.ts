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

/**
 * Desce até a linha `id` (pelas setas) e aperta Enter. O LCD responde quando a tecla chega ao fundo (~0,1–0,2 s):
 * cada seta espera o item marcado mudar antes da próxima.
 */
async function choose(page: Page, id: string) {
  for (let i = 0; i < 12; i++) {
    const now = await selected(page).getAttribute("data-row-id");
    if (now === id) break;
    await page.keyboard.press("ArrowDown");
    await expect(selected(page)).not.toHaveAttribute("data-row-id", now ?? "", { timeout: 10_000 });
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
  test.skip(({ isMobile }) => isMobile, "celular com teclado e mouse: desktop");
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
    // O aparelho já nasce e compila no ocioso, antes do 1º ciclo (T11, rodada 1). Texturas e programas ficam planos do
    // 2º ciclo em diante. As geometrias ainda sobem até +3 em ciclos esparsos e param (medido na rodada 1: 155 → 156
    // no 2º, 157 no 8º, 158 no 10º e 158 até o 20º): é a 1ª vez que uma peça da mão entra no quadro numa pose amostrada
    // (o WebGL só sobe a geometria quando a desenha), não o celular, que é um só (hands.test.ts: mesmo modelo e mesma
    // contagem em 20 aberturas). Vazamento seria crescer até o fim: os últimos 10 ciclos têm de ser iguais.
    for (const k of ["textures", "programs"] as const) expect(new Set(seen.slice(1).map((x) => x[k])).size, k).toBe(1);
    expect(new Set(seen.slice(10).map((x) => x.geometries)).size, "geometrias nos últimos 10 ciclos").toBe(1);
    expect(seen[19].geometries - seen[0].geometries, "geometrias de mão vistas pela 1ª vez").toBeLessThanOrEqual(3);
    expect((await interact(page))?.panels).toBe(0);
  });

  test("o pincel do papel não chega (rede): o leitor abre mesmo assim, no texto limpo, com a dica; E fecha e o mouse trava de novo", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await fakePointerLock(page);
    // derruba só o chunk do papel (o leitor mora na casca: um chunk próprio que falhasse ficaria falho para sempre,
    // porque o navegador guarda o import() que falhou — medido na rodada 2: a 2ª tentativa nem pedia de novo)
    let paperRequests = 0;
    await page.route("**/_next/static/chunks/*.js", async (route) => {
      const res = await route.fetch();
      const body = await res.text();
      if (body.includes("rgba(168,52,42,0.34)")) {
        paperRequests += 1;
        return route.abort();
      }
      return route.fulfill({ response: res, body });
    });
    await lightGame(page, testInfo, { place: "mesa" });
    await openGame(page);
    await page.mouse.click(400, 250);
    await expect.poll(() => lock(page)).toMatchObject({ requests: 1, locked: true });
    expect(await page.evaluate(() => (window as unknown as { __cripta: { aimAt(id: string): boolean } }).__cripta.aimAt("bilhete"))).toBe(true);
    await expect(page.locator("[data-game-prompt]")).toContainText("ler o bilhete", { timeout: 30_000 });
    await page.keyboard.press("KeyE");
    const reader = page.getByRole("dialog", { name: "bilhete" });
    await expect(reader).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("[data-reader-clean]")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("[data-reader-clean]")).toContainText("o que abre a porta");
    await expect(page.locator("[data-reader-paper]")).toBeHidden();
    await expect(page.locator("[data-game-subtitles]")).toContainText("o papel não abriu", { timeout: 20_000 });
    expect(paperRequests).toBeGreaterThan(0);
    expect(await interact(page)).toMatchObject({ mode: "read", panels: 1 });
    await page.keyboard.press("KeyE");
    await expect(reader).toHaveCount(0);
    expect(await interact(page)).toMatchObject({ mode: "walk", panels: 0 });
    await expect.poll(() => lock(page)).toMatchObject({ requests: 2, locked: true });
    expect(errors).toEqual([]);
  });

  test("voltar + voltar rápido no Arquivo (o 1º ainda na fila): o celular fecha e o mouse trava de novo no gesto", async ({ page }, testInfo) => {
    await fakePointerLock(page);
    await lightGame(page, testInfo, { place: "mesa", flags: { "lido:bilhete": true } });
    await openGame(page);
    await page.mouse.click(400, 250);
    await expect.poll(() => lock(page)).toMatchObject({ requests: 1, locked: true });
    await openPhone(page);
    await choose(page, "arquivo");
    await expect(page.locator("[data-lcd-title]")).toHaveText("arquivo");
    await page.keyboard.press("KeyE");
    await page.keyboard.press("KeyE");
    await expect(phoneDialog(page)).toHaveCount(0);
    expect((await interact(page))?.mode).toBe("walk");
    await expect.poll(() => lock(page)).toMatchObject({ requests: 2, locked: true });
  });

  test("@slow celular em movimento: só os pixels do aparelho, dois quadros com a câmera deslocada, não nadam nem cintilam", async ({ page }, testInfo) => {
    await lightGame(page, testInfo, { place: "mesa" });
    await openGame(page);
    await page.evaluate(() => (window as unknown as { __cripta: { handsDebug(o: { still: boolean }): void } }).__cripta.handsDebug({ still: true }));
    await openPhone(page);
    // o LCD é DOM (igual em qualquer quadro): esconde, para medir só o modelo 3D
    await page.addStyleTag({ content: "[data-phone-lcd] { visibility: hidden !important; }" });
    const cam = (await w(page)) as unknown as { camera: { position: [number, number, number]; rotation: [number, number, number] } };
    const [x, y, z] = cam.camera.position;
    const [pitch, yaw] = cam.camera.rotation;
    const hands = (v: boolean) => page.evaluate((on) => (window as unknown as { __cripta: { hands(v: boolean): void } }).__cripta.hands(on), v);
    const shot = async (pose: { x: number; y: number; z: number; yaw: number; pitch: number }) => {
      await page.evaluate((p) => (window as unknown as { __cripta: { setCamera(p: unknown): void } }).__cripta.setCamera(p), pose);
      const frame = async () => {
        const f0 = (await w(page))!.renderer.frames;
        await expect.poll(async () => (await w(page))!.renderer.frames).toBeGreaterThan(f0 + 2);
        return (await page.screenshot()).toString("base64");
      };
      await hands(true);
      const withPhone = await frame();
      await hands(false);
      const without = await frame();
      await hands(true);
      return { withPhone, without };
    };
    const a = await shot({ x, y, z, yaw, pitch });
    const b = await shot({ x: x + 0.05, y, z: z + 0.03, yaw: yaw + 0.02, pitch });
    // máscara: pixels em que o aparelho (e a mão) aparecem nos DOIS quadros (comparado com o mesmo quadro sem as mãos);
    // a sala atrás fica fora, então o parallax dela não conta; o que sobra é o celular, que anda com a câmera
    const r = await page.evaluate(
      async ({ a, b }) => {
        const pixels = async (b64: string) => {
          const img = new Image();
          img.src = `data:image/png;base64,${b64}`;
          await img.decode();
          const c = document.createElement("canvas");
          c.width = img.width;
          c.height = img.height;
          const g = c.getContext("2d")!;
          g.drawImage(img, 0, 0);
          return g.getImageData(0, 0, c.width, c.height).data;
        };
        const [aw, ao, bw, bo] = await Promise.all([pixels(a.withPhone), pixels(a.without), pixels(b.withPhone), pixels(b.without)]);
        const d = (p: Uint8ClampedArray, q: Uint8ClampedArray, i: number) => (Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2])) / 3;
        let n = 0;
        let sum = 0;
        let big = 0;
        for (let i = 0; i < aw.length; i += 4) {
          if (d(aw, ao, i) < 12 || d(bw, bo, i) < 12) continue;
          n += 1;
          const v = d(aw, bw, i);
          sum += v;
          if (v > 40) big += 1;
        }
        return { pixels: n, mean: n ? sum / n : 0, flicker: n ? big / n : 0 };
      },
      { a: a, b: b },
    );
    testInfo.annotations.push({ type: "aparelho em movimento", description: JSON.stringify(r) });
    expect(r.pixels, "o aparelho ocupa uma parte boa do quadro").toBeGreaterThan(20_000);
    expect(r.mean, "diferença média nos pixels do aparelho").toBeLessThan(4);
    expect(r.flicker, "fração de pixels do aparelho que trocam muito (cintilação)").toBeLessThan(0.02);
  });
});

test.describe("celular por toque (mobile)", () => {
  test.skip(({ isMobile }) => !isMobile, "só no projeto mobile (ponteiro grosso)");
  test.describe.configure({ timeout: 180_000 });

  test("botões de toque: o celular abre, navega por toque, abre o arquivo e fecha; os lugares abrem e levam até o lugar", async ({ page }, testInfo) => {
    await lightGame(page, testInfo, { place: "entrada", flags: { "lido:bilhete": true } });
    await openGame(page);
    await page.getByRole("button", { name: "abrir o celular" }).tap();
    await expect(lcd(page)).toBeVisible({ timeout: 40_000 });
    await page.locator('[data-row-id="arquivo"]').tap();
    await expect(page.locator("[data-lcd-title]")).toHaveText("arquivo", { timeout: 10_000 });
    await page.locator('[data-row-id="doc:bilhete"]').tap();
    const reader = page.getByRole("dialog", { name: "bilhete" });
    await expect(reader).toBeVisible({ timeout: 20_000 });
    await expect(reader).toHaveAttribute("data-variant", "phone");
    await page.locator("[data-reader-close]").tap();
    await expect(reader).toHaveCount(0);
    await expect(page.locator("[data-lcd-title]")).toHaveText("arquivo");
    await page.locator("[data-lcd-soft] button").last().tap();
    await expect(page.locator("[data-lcd-title]")).toHaveText("menu", { timeout: 10_000 });
    await page.locator("[data-lcd-soft] button").last().tap();
    await expect(phoneDialog(page)).toHaveCount(0);
    expect((await interact(page))?.mode).toBe("walk");

    await page.getByRole("button", { name: "abrir os lugares" }).tap();
    const places = page.getByRole("navigation", { name: "Lugares" });
    await expect(places).toBeVisible();
    await places.getByRole("button", { name: /mesa/ }).tap();
    await expect.poll(async () => (await w(page))?.place, { timeout: 40_000 }).toBe("mesa");
  });
});
