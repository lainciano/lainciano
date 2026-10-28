import { expect, test, type Page } from "@playwright/test";
import { CINZA_PLACES, PLAYER_RADIUS, TABLE } from "../src/game/layers/cinza/places";

// T8: o jogador na sala cinza. Só teclado no desktop (lista de lugares acessível, WASD, Shift) e toque no
// celular (tocar no chão anda). Posições lidas de `window.__cripta` (Ruling 1: `place` e `camera` ligados).

type CriptaWindow = Window & {
  __cripta?: {
    place: string | null;
    camera: { position: [number, number, number]; rotation: [number, number, number] };
    renderer: { frames: number; frameErrors: number };
    onFrame(fn: (dt: number, t: number) => void): () => void;
  };
  /** Tempo simulado somado pelos quadros (o dt que o jogador recebe). */
  __simT?: number;
};

async function hydrated(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => {
    const main = document.querySelector("main");
    return !!main && Object.keys(main).some((key) => key.startsWith("__reactFiber"));
  });
}

test.describe.configure({ timeout: 120_000 });

test.beforeEach(async ({ page }) => {
  await page.route("**/api/run", (route) =>
    route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ runId: "e2e", issuedAt: 0, token: "e2e" }) }));
  await page.addInitScript(() => {
    if (!localStorage.getItem("lainciano:som:v1")) localStorage.setItem("lainciano:som:v1", "off");
    // Cada teste começa na entrada (sem lugar salvo de outro teste).
    localStorage.removeItem("lainciano:jogo:save:v1");
  });
});

const place = (page: Page) => page.evaluate(() => (window as unknown as CriptaWindow).__cripta?.place ?? null);
const xz = async (page: Page) => {
  const p = await page.evaluate(() => (window as unknown as CriptaWindow).__cripta?.camera.position ?? null);
  if (!p) throw new Error("sem __cripta.camera");
  return { x: p[0], z: p[2] };
};

async function openGame(page: Page, query = "") {
  await page.goto(`/?jogo=1&debug=1${query}`);
  await hydrated(page);
  await expect(page.locator("[data-game-loading]")).toHaveCount(0, { timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as CriptaWindow).__cripta?.renderer.frames ?? 0), { timeout: 20_000 }).toBeGreaterThan(3);
}

/** Abre a lista (L) e escolhe um lugar com Enter; espera chegar. */
async function goByList(page: Page, name: string, id: string) {
  await page.keyboard.press("KeyL");
  const list = page.getByRole("navigation", { name: "Lugares" });
  await expect(list).toBeVisible();
  await list.getByRole("button", { name }).press("Enter");
  await expect(list).toHaveCount(0);
  await expect.poll(() => place(page), { timeout: 40_000, message: `chegar a ${id}` }).toBe(id);
}

async function holdFor(page: Page, keys: string[], ms: number) {
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  for (const k of [...keys].reverse()) await page.keyboard.up(k);
  // o último quadro com a tecla solta
  await page.waitForTimeout(200);
}

/** Liga um relógio de tempo simulado (soma dos dt dos quadros), para medir velocidade sem depender do fps. */
const startSimClock = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as CriptaWindow;
    w.__simT = 0;
    w.__cripta?.onFrame((dt) => {
      w.__simT = (w.__simT ?? 0) + dt;
    });
  });
/** Posição e tempo simulado lidos juntos (nenhum quadro entre um e outro). */
const snapshot = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as CriptaWindow;
    const p = w.__cripta?.camera.position;
    return { x: p?.[0] ?? NaN, z: p?.[2] ?? NaN, t: w.__simT ?? 0 };
  });

/**
 * Segura as teclas e devolve a velocidade em m por segundo SIMULADO: as duas leituras ficam entre o apertar e o
 * soltar, então todo quadro contado teve as teclas seguradas (independe do fps do SwiftShader).
 */
async function speedWhile(page: Page, keys: string[], ms: number) {
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(250);
  const a = await snapshot(page);
  await page.waitForTimeout(ms);
  const b = await snapshot(page);
  for (const k of [...keys].reverse()) await page.keyboard.up(k);
  await page.waitForTimeout(200);
  return Math.hypot(b.x - a.x, b.z - a.z) / Math.max(1e-6, b.t - a.t);
}

test.describe("teclado (desktop)", () => {
  test.skip(({ isMobile }) => isMobile, "só teclado no desktop");

  test("começa na entrada; L abre a lista acessível e Enter em “a mesa” leva até lá", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await openGame(page);
    expect(await place(page)).toBe("entrada");
    await page.keyboard.press("KeyL");
    const list = page.getByRole("navigation", { name: "Lugares" });
    await expect(list).toBeVisible();
    // O lugar atual vem marcado e desabilitado; o foco vai para o primeiro disponível.
    await expect(list.getByRole("button", { name: /a entrada · aqui/ })).toBeDisabled();
    await expect(list.getByRole("button", { name: "a mesa" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(list).toHaveCount(0);
    await expect.poll(() => place(page), { timeout: 40_000 }).toBe("mesa");
    const p = await xz(page);
    expect(Math.hypot(p.x - CINZA_PLACES.mesa.x, p.z - CINZA_PLACES.mesa.z)).toBeLessThan(0.05);
    expect(errors).toEqual([]);
  });

  test("a lista fecha com L de novo, com ⌫ e com Esc (tolerância)", async ({ page }) => {
    await openGame(page);
    const list = page.getByRole("navigation", { name: "Lugares" });
    for (const key of ["KeyL", "Backspace", "Escape"]) {
      await page.keyboard.press("KeyL");
      await expect(list).toBeVisible();
      await page.keyboard.press(key);
      await expect(list, `fecha com ${key}`).toHaveCount(0);
    }
    // Fechada a lista, o jogo continua no lugar e com o teclado.
    expect(await place(page)).toBe("entrada");
  });

  test("WASD por 1 s muda a posição e não atravessa a mesa", async ({ page }) => {
    await openGame(page);
    await goByList(page, "a mesa", "mesa");
    const before = await xz(page);
    // Para a frente (a mesa está logo ali) e para o lado: anda, desliza, mas não entra na mesa.
    await holdFor(page, ["KeyW"], 1000);
    const forward = await xz(page);
    await holdFor(page, ["KeyW", "KeyA"], 1000);
    const after = await xz(page);
    expect(Math.hypot(forward.x - before.x, forward.z - before.z), "andou").toBeGreaterThan(0.1);
    expect(Math.hypot(after.x - forward.x, after.z - forward.z), "deslizou").toBeGreaterThan(0.05);
    // Borda da frente da mesa + raio do jogador (folga de 2 cm para o balanço da câmera); e encostado nela (até
    // 15 cm), o que prova que andou até o contato em vez de parar antes.
    for (const p of [forward, after]) {
      expect(p.z, "não atravessa a mesa").toBeGreaterThan(TABLE.z1 + PLAYER_RADIUS - 0.02);
      expect(p.z, "chegou a encostar na mesa").toBeLessThan(TABLE.z1 + PLAYER_RADIUS + 0.15);
    }
  });

  test("Shift corre: 2,6 m/s contra 1,4 m/s andando (por segundo simulado, não por quadro)", async ({ page }) => {
    await openGame(page);
    await startSimClock(page);
    const walk = await speedWhile(page, ["KeyW"], 1200);
    await goByList(page, "a entrada", "entrada");
    const run = await speedWhile(page, ["ShiftLeft", "KeyW"], 900);
    // Valores do brief (1,4 e 2,6 m/s); 5 % de folga para o balanço lateral da câmera (±1 cm) sobre ~0,5 m.
    expect(Math.abs(walk - 1.4) / 1.4, `andou a ${walk.toFixed(3)} m/s`).toBeLessThan(0.05);
    expect(Math.abs(run - 2.6) / 2.6, `correu a ${run.toFixed(3)} m/s`).toBeLessThan(0.05);
  });

  test("a porta emperrou: a carga que falha mostra o aviso e “tentar de novo” carrega a sala", async ({ page }) => {
    await page.goto("/?jogo=1&debug=1&falha=camada");
    await hydrated(page);
    const alert = page.locator("[data-game-shell]").getByRole("alert");
    await expect(alert).toContainText("A porta emperrou.", { timeout: 30_000 });
    const retry = alert.getByRole("button", { name: "Tentar de novo" });
    await expect(retry).toBeFocused();
    await retry.press("Enter");
    await expect(alert).toHaveCount(0, { timeout: 30_000 });
    await expect.poll(() => place(page), { timeout: 20_000 }).toBe("entrada");
    await expect.poll(() => page.evaluate(() => (window as unknown as CriptaWindow).__cripta?.renderer.frames ?? 0)).toBeGreaterThan(3);
  });
});

test.describe("toque (celular)", () => {
  test.skip(({ isMobile }) => !isMobile, "só no projeto mobile");

  test("tocar no chão anda até o ponto", async ({ page }) => {
    await openGame(page);
    const before = await xz(page);
    const box = await page.locator("[data-game-stage]").boundingBox();
    if (!box) throw new Error("sem palco");
    // Chão à frente, no meio da tela, abaixo do horizonte (a mão fica no canto de baixo à direita).
    await page.touchscreen.tap(box.x + box.width * 0.42, box.y + box.height * 0.8);
    await expect
      .poll(async () => {
        const p = await xz(page);
        return Math.hypot(p.x - before.x, p.z - before.z);
      }, { timeout: 30_000, message: "andou até o ponto tocado" })
      .toBeGreaterThan(0.3);
    const after = await xz(page);
    // Andou para a frente (norte, −z), que é para onde a entrada olha.
    expect(after.z).toBeLessThan(before.z);
  });
});
