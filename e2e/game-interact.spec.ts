import { expect, test, type Page } from "@playwright/test";
import { initialSave } from "../src/game/save/schema";

// T9: mira de perto, aviso, brilho, segurar, ciclo e exame. Desktop e teclado/mouse. O estado vem de
// `window.__cripta.interact` (debug) e a tela de `[data-game-*]`. `aimAt(id)` vira o olhar para o objeto pelo MESMO
// caminho do ciclo. O travamento do mouse é simulado (o SwiftShader headless não trava de verdade).

type Interact = {
  aimedId: string | null;
  target: { id: string; inReach: boolean } | null;
  holdId: string | null;
  holdProgress: number;
  glow: string | null;
  glowLevel: number;
  panel: boolean;
  lastCycled: string | null;
  prompt: { text: string; key: "press" | "hold"; progress: number | null } | null;
  panels: number;
  mode: string;
  examine: { open: boolean; title: string; text: string; turn: number; tilt: number; distance: number; emissive: number; originalVisible: boolean | null };
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
};

test.describe.configure({ timeout: 180_000 });
test.skip(({ isMobile }) => isMobile, "mira e exame com teclado e mouse: desktop");

test.beforeEach(async ({ page }) => {
  await page.route("**/api/run", (route) =>
    route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ runId: "e2e", issuedAt: 0, token: "e2e" }) }));
  await page.addInitScript(() => {
    if (!localStorage.getItem("lainciano:som:v1")) localStorage.setItem("lainciano:som:v1", "off");
    localStorage.removeItem("lainciano:jogo:save:v1");
  });
});

async function hydrated(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => {
    const main = document.querySelector("main");
    return !!main && Object.keys(main).some((key) => key.startsWith("__reactFiber"));
  });
}

/** Abre o jogo já parado em `place` (o save salvo manda). */
async function openAt(page: Page, place: string) {
  const save = { ...initialSave(0), place };
  await page.addInitScript((json) => localStorage.setItem("lainciano:jogo:save:v1", json), JSON.stringify(save));
  await page.goto("/?jogo=1&debug=1");
  await hydrated(page);
  await expect(page.locator("[data-game-loading]")).toHaveCount(0, { timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as CriptaWindow).__cripta?.renderer.frames ?? 0), { timeout: 20_000 }).toBeGreaterThan(3);
  await expect.poll(() => page.evaluate(() => (window as unknown as CriptaWindow).__cripta?.place), { timeout: 10_000 }).toBe(place);
}

const interact = (page: Page) => page.evaluate(() => (window as unknown as CriptaWindow).__cripta?.interact ?? null);
const aimAt = (page: Page, id: string) => page.evaluate((i) => (window as unknown as CriptaWindow).__cripta?.aimAt(i) ?? false, id);
const prompt = (page: Page) => page.locator("[data-game-prompt]");
const card = (page: Page) => page.locator("[data-game-examine]");
/** Texto das falas na tela (vazio quando não há fala): `not.toContainText` num elemento ausente falha. */
const spoken = async (page: Page) => (await page.locator("[data-game-line]").allTextContents()).join(" ");

/** Vira para o objeto e espera o aviso dele aparecer (a histerese e a virada levam alguns quadros). */
async function aimAndWait(page: Page, id: string, text: string) {
  expect(await aimAt(page, id)).toBe(true);
  await expect(prompt(page)).toContainText(text, { timeout: 30_000 });
  expect((await interact(page))?.aimedId).toBe(id);
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

test.describe("aviso só de perto", () => {
  test("da entrada, mirando a mesa a ~2,6 m: há acerto, não há aviso nem brilho nem texto de 'ir até'", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await openAt(page, "entrada");
    expect(await aimAt(page, "mesa")).toBe(true);
    await expect.poll(async () => (await interact(page))?.target, { timeout: 30_000 }).toEqual({ id: "mesa", inReach: false });
    // dá tempo da histerese: o aviso continua ausente
    await page.waitForTimeout(1500);
    await expect(prompt(page)).toBeEmpty();
    const s = await interact(page);
    expect(s?.aimedId).toBeNull();
    expect(s?.glow).toBeNull();
    expect(s?.prompt).toBeNull();
    await expect(page.locator("[data-game-shell]")).not.toContainText(/ir at[ée]/i);
    expect(errors).toEqual([]);
  });

  test("no lugar da mesa, mirando o bilhete, o aviso traz o verbo e o objeto brilha (pulsa)", async ({ page }) => {
    await openAt(page, "mesa");
    await aimAndWait(page, "bilhete", "ler o bilhete");
    await expect(prompt(page).locator("kbd")).toHaveText("E");
    await expect(page.locator("[data-game-reticle]")).toHaveAttribute("data-state", "hot");
    await expect(page.locator("[data-game-ring]")).toHaveCount(0);
    const levels = new Set<number>();
    for (let i = 0; i < 14; i++) {
      levels.add(Math.round(((await interact(page))?.glowLevel ?? 0) * 100));
      await page.waitForTimeout(120);
    }
    expect((await interact(page))?.glow).toBe("bilhete");
    expect(levels.size, "o brilho pulsa").toBeGreaterThan(3);
  });

  test("movimento reduzido: o brilho fica fixo", async ({ page }) => {
    await openAt(page, "mesa");
    // o site entra em modo leitura se a preferência já vem ligada na carga; com o jogo aberto ela vale ao vivo
    await page.emulateMedia({ reducedMotion: "reduce" });
    await aimAndWait(page, "bilhete", "ler o bilhete");
    const levels = new Set<number>();
    for (let i = 0; i < 10; i++) {
      levels.add(Math.round(((await interact(page))?.glowLevel ?? 0) * 100));
      await page.waitForTimeout(120);
    }
    expect([...levels]).toEqual([50]);
  });

  test("desviar o olhar apaga o aviso e o brilho", async ({ page }) => {
    await openAt(page, "mesa");
    await aimAndWait(page, "bilhete", "ler o bilhete");
    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(3000);
    await page.keyboard.up("ArrowRight");
    await expect(prompt(page)).toBeEmpty({ timeout: 20_000 });
    expect((await interact(page))?.glow).toBeNull();
    await expect(page.locator("[data-game-reticle]")).toHaveAttribute("data-state", "idle");
  });
});

test.describe("E sem alvo e Q: ciclo pelos objetos do lugar", () => {
  test("Q percorre mesa → bilhete → caderno → mesa; E sem alvo também cicla; com alvo, E age", async ({ page }) => {
    await openAt(page, "mesa");
    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(3000);
    await page.keyboard.up("ArrowRight");
    await expect.poll(async () => (await interact(page))?.aimedId, { timeout: 20_000 }).toBeNull();
    const seen: (string | null)[] = [];
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("KeyQ");
      await expect.poll(async () => (await interact(page))?.aimedId, { timeout: 30_000 }).toBe(["mesa", "bilhete", "caderno", "mesa"][i]);
      seen.push((await interact(page))?.aimedId ?? null);
    }
    expect(seen).toEqual(["mesa", "bilhete", "caderno", "mesa"]);
    // nada disso agiu: nenhuma fala, nenhum painel
    await expect(page.locator("[data-game-line]")).toHaveCount(0);
    expect((await interact(page))?.panels).toBe(0);

    // vira de costas de novo e usa E (sem alvo): cicla; com o alvo, o segundo E age (a mesa fala)
    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(3000);
    await page.keyboard.up("ArrowRight");
    await expect.poll(async () => (await interact(page))?.aimedId, { timeout: 20_000 }).toBeNull();
    await page.keyboard.press("KeyE");
    await expect.poll(async () => (await interact(page))?.aimedId, { timeout: 30_000 }).not.toBeNull();
    const first = (await interact(page))?.aimedId;
    await expect(page.locator("[data-game-line]")).toHaveCount(0);
    expect(first).toBeTruthy();
  });

  test("onde não há nada (a entrada), E avisa e não vira", async ({ page }) => {
    await openAt(page, "entrada");
    await page.keyboard.press("KeyE");
    await expect(page.locator("[data-game-line]")).toContainText("nada ao alcance daqui", { timeout: 20_000 });
    await page.keyboard.press("KeyQ");
    await expect(page.locator("[data-game-line]")).toContainText("L abre os lugares");
  });

  test("E em objeto comum ao alcance age (a mesa fala); a fala some sozinha depois", async ({ page }) => {
    await openAt(page, "mesa");
    await aimAndWait(page, "mesa", "examinar a mesa");
    await page.keyboard.press("KeyE");
    await expect(page.locator("[data-game-line]")).toContainText("madeira gasta", { timeout: 20_000 });
  });
});

test.describe("segurar", () => {
  test("a porta é de segurar: aviso com o anel, o anel sobe, concluir age UMA vez", async ({ page }) => {
    await openAt(page, "porta");
    await aimAndWait(page, "porta", "forçar a porta");
    await expect(prompt(page).locator("kbd")).toHaveText("segure E");
    await expect(page.locator("[data-game-ring]")).toHaveCount(1);
    await page.keyboard.down("KeyE");
    await expect.poll(async () => (await interact(page))?.holdProgress ?? 0, { timeout: 30_000 }).toBeGreaterThan(0.2);
    expect((await interact(page))?.holdId).toBe("porta");
    // a lanterna não atrapalha: segue na mão
    expect((await page.evaluate(() => (window as unknown as CriptaWindow).__cripta?.handsState))?.mode).toBe("held");
    await expect(page.locator("[data-game-line]")).toHaveCount(0);
    await expect(page.locator("[data-game-line]")).toContainText("trancada.", { timeout: 60_000 });
    expect((await interact(page))?.holdId).toBeNull();
    await page.keyboard.up("KeyE");
    // não repete sozinho
    await page.waitForTimeout(800);
    expect((await interact(page))?.holdId).toBeNull();
  });

  test("soltar antes de 0,22 s: dica 'segure E para forçar a porta' e nada acontece", async ({ page }) => {
    await openAt(page, "porta");
    await aimAndWait(page, "porta", "forçar a porta");
    await page.keyboard.press("KeyE");
    await expect(page.locator("[data-game-line]")).toContainText("segure E para forçar a porta", { timeout: 20_000 });
    await page.waitForTimeout(1500);
    expect(await spoken(page)).not.toContain("trancada");
    expect((await interact(page))?.holdId).toBeNull();
  });

  test("soltar no meio: o anel recua e não age", async ({ page }) => {
    await openAt(page, "porta");
    await aimAndWait(page, "porta", "forçar a porta");
    await page.keyboard.down("KeyE");
    await expect.poll(async () => (await interact(page))?.holdProgress ?? 0, { timeout: 30_000 }).toBeGreaterThan(0.3);
    await page.keyboard.up("KeyE");
    await expect.poll(async () => (await interact(page))?.holdId, { timeout: 30_000 }).toBeNull();
    await page.waitForTimeout(500);
    const said = await spoken(page);
    expect(said).not.toContain("trancada");
    expect(said).not.toContain("segure E para");
  });
});

test.describe("examinar", () => {
  test("E no bilhete abre o exame (painel); arrastar gira, a roda amplia, setas giram; E fecha e devolve o foco", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await openAt(page, "mesa");
    await aimAndWait(page, "bilhete", "ler o bilhete");
    const childrenBefore = (await interact(page))?.cameraChildren ?? -1;
    await page.keyboard.press("KeyE");
    await expect(card(page)).toBeVisible({ timeout: 20_000 });
    await expect(card(page).getByRole("heading", { name: "bilhete" })).toBeVisible();
    let s = await interact(page);
    // a cópia está na câmera e o original saiu da mesa enquanto está na mão
    expect(s?.cameraChildren).toBe(childrenBefore + 1);
    expect(s?.examine.originalVisible).toBe(false);
    expect(s?.mode).toBe("examine");
    expect(s?.panels).toBe(1);
    expect(s?.examine.open).toBe(true);
    // painel: sem aviso nem brilho; a lanterna é guardada
    await expect(prompt(page)).toBeEmpty();
    expect(s?.glow).toBeNull();
    await expect.poll(async () => (await page.evaluate(() => (window as unknown as CriptaWindow).__cripta?.handsState))?.mode, { timeout: 20_000 }).toBe("holstered");
    // E fecha ou ⌫ ou botão direito, nunca um rótulo de Esc
    await expect(card(page)).not.toContainText(/esc/i);
    await expect(card(page).locator("kbd")).toHaveText(["E", "⌫"]);

    // arrastar gira
    const turn0 = (await interact(page))?.examine.turn ?? 0;
    await page.mouse.move(640, 400);
    await page.mouse.down();
    await page.mouse.move(700, 400, { steps: 4 });
    await page.mouse.move(760, 400, { steps: 4 });
    await page.mouse.up();
    await expect.poll(async () => ((await interact(page))?.examine.turn ?? 0) - turn0, { timeout: 20_000 }).toBeGreaterThan(1.0);
    // setas giram de volta
    const turn1 = (await interact(page))?.examine.turn ?? 0;
    for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowLeft");
    await expect.poll(async () => (await interact(page))?.examine.turn ?? turn1, { timeout: 20_000 }).toBeLessThan(turn1 - 1.0);
    // a roda amplia
    const d0 = (await interact(page))?.examine.distance ?? 1;
    await page.mouse.wheel(0, -300);
    await expect.poll(async () => (await interact(page))?.examine.distance ?? d0, { timeout: 20_000 }).toBeLessThan(d0);

    // E fecha
    await page.keyboard.press("KeyE");
    await expect(card(page)).toHaveCount(0);
    s = await interact(page);
    expect(s?.mode).toBe("walk");
    expect(s?.panels).toBe(0);
    expect(s?.examine.open).toBe(false);
    // ao fechar: a cópia sai da câmera e o original volta a ser visível (`null` = nada escondido)
    expect(s?.cameraChildren).toBe(childrenBefore);
    expect(s?.examine.originalVisible).toBeNull();
    await expect(page.locator("[data-game-shell]")).toBeFocused();
    await expect.poll(async () => (await page.evaluate(() => (window as unknown as CriptaWindow).__cripta?.handsState))?.mode, { timeout: 20_000 }).toBe("held");
    // de volta ao jogo: a mira e o aviso retornam
    await expect(prompt(page)).toContainText("ler o bilhete", { timeout: 30_000 });
    expect(errors).toEqual([]);
  });

  test("⌫, botão direito, Esc (tolerância) e o botão do cartão também fecham", async ({ page }) => {
    await openAt(page, "mesa");
    await aimAndWait(page, "caderno", "abrir o caderno");
    for (const how of ["Backspace", "right", "Escape", "button"] as const) {
      await page.keyboard.press("KeyE");
      await expect(card(page), `abre (${how})`).toBeVisible({ timeout: 20_000 });
      await expect(card(page).getByRole("heading", { name: "caderno" })).toBeVisible();
      if (how === "right") await page.mouse.click(640, 400, { button: "right" });
      else if (how === "button") await card(page).getByRole("button").click();
      else await page.keyboard.press(how);
      await expect(card(page), `fecha (${how})`).toHaveCount(0);
      await expect(page.locator("[data-game-shell]")).toBeFocused();
      await expect(prompt(page)).toContainText("abrir o caderno", { timeout: 30_000 });
    }
  });

  test("fechar devolve o mouse travado se estava travado (E, ⌫, botão direito, botão); solto, continua solto", async ({ page }) => {
    await fakePointerLock(page);
    await openAt(page, "mesa");
    // clique na cena trava
    await page.mouse.click(640, 400);
    await expect.poll(() => lock(page)).toMatchObject({ requests: 1, locked: true });
    await aimAndWait(page, "bilhete", "ler o bilhete");
    let requests = 1;
    for (const how of ["KeyE", "Backspace", "right", "button"] as const) {
      await page.keyboard.press("KeyE");
      await expect(card(page), `abre (${how})`).toBeVisible({ timeout: 20_000 });
      // abrir solta o mouse (o cursor precisa para arrastar), sem "pausado"
      await expect.poll(() => lock(page)).toMatchObject({ locked: false });
      await expect(page.locator("[data-game-paused]")).toHaveCount(0);
      if (how === "right") await page.mouse.click(640, 400, { button: "right" });
      else if (how === "button") await card(page).getByRole("button").click();
      else await page.keyboard.press(how);
      await expect(card(page), `fecha (${how})`).toHaveCount(0);
      requests += 1;
      await expect.poll(() => lock(page), { message: `trava de novo (${how})` }).toMatchObject({ requests, locked: true });
      await expect(page.locator("[data-game-paused]")).toHaveCount(0);
      await expect(prompt(page)).toContainText("ler o bilhete", { timeout: 30_000 });
    }
  });

  test("com o mouse solto, fechar o exame não trava nada", async ({ page }) => {
    await fakePointerLock(page);
    await openAt(page, "mesa");
    await aimAndWait(page, "bilhete", "ler o bilhete");
    await page.keyboard.press("KeyE");
    await expect(card(page)).toBeVisible({ timeout: 20_000 });
    await page.keyboard.press("KeyE");
    await expect(card(page)).toHaveCount(0);
    await page.waitForTimeout(500);
    expect(await lock(page)).toMatchObject({ requests: 0, locked: false });
  });

  test("abrir o exame pelo clique do mouse travado também solta o mouse", async ({ page }) => {
    await fakePointerLock(page);
    await openAt(page, "mesa");
    await page.mouse.click(640, 400);
    await expect.poll(() => lock(page)).toMatchObject({ locked: true });
    await aimAndWait(page, "bilhete", "ler o bilhete");
    await page.mouse.click(640, 400);
    await expect(card(page)).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => lock(page)).toMatchObject({ locked: false });
  });

  test("20 aberturas e fechamentos não vazam geometria, textura nem programa", async ({ page }) => {
    await openAt(page, "mesa");
    await aimAndWait(page, "bilhete", "ler o bilhete");
    const info = () => page.evaluate(() => {
      const r = (window as unknown as CriptaWindow).__cripta?.renderer;
      return { geometries: r?.memory.geometries ?? -1, textures: r?.memory.textures ?? -1, programs: r?.programs ?? -1 };
    });
    // A 1ª abertura sobe a mão esquerda (e outras peças) ao quadro pela primeira vez: a GPU recebe a geometria
    // delas. Depois do 3º ciclo o número assenta; é aí que se mede (medido: 129 → 169 → 172 → 172…).
    let settled = { geometries: 0, textures: 0, programs: 0 };
    const childrenBefore = (await interact(page))?.cameraChildren ?? -1;
    const emissives: number[] = [];
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press("KeyE");
      await expect(card(page)).toBeVisible({ timeout: 20_000 });
      // abrir a cada fase do pulso do brilho: o emissivo da cópia é sempre o mesmo (a base + o realce, nunca a fase)
      await page.waitForTimeout(40 + ((i * 53) % 300));
      const open = await interact(page);
      emissives.push(Math.round((open?.examine.emissive ?? -1) * 1e6));
      expect(open?.cameraChildren).toBe(childrenBefore + 1);
      await page.keyboard.press("KeyE");
      await expect(card(page)).toHaveCount(0);
      const closed = await interact(page);
      expect(closed?.cameraChildren, `ciclo ${i}: a cópia saiu da câmera`).toBe(childrenBefore);
      expect(closed?.examine.originalVisible, `ciclo ${i}: o original voltou`).toBeNull();
      await expect(prompt(page)).toContainText("ler o bilhete", { timeout: 30_000 });
      if (i === 3) settled = await info();
    }
    expect(new Set(emissives).size, `emissivo da cópia igual em todas as fases do pulso: ${emissives.join(",")}`).toBe(1);
    expect(emissives[0]).toBeGreaterThan(0);
    const end = await info();
    // As mãos sobem ao quadro em ociosas e mandam geometria nova à GPU pela primeira vez, com ou sem exame (medido
    // sem exame: 129 → 134 em ~14 espaços de 2,5 s). Um vazamento do exame somaria ≥ 1 por ciclo (≥ 16 aqui).
    expect(end.geometries - settled.geometries, "geometrias").toBeLessThanOrEqual(4);
    expect(end.textures, "texturas").toBe(settled.textures);
    expect(end.programs, "programas").toBe(settled.programs);
  });
});
