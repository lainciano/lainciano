import { expect, test, type Page } from "@playwright/test";
import { CINZA_PLACES } from "../src/game/layers/cinza/places";

// T8: fotos da sala cinza (`?debug=1&shot=cinza-entrada`: jogador no lugar `entrada`, tempo do pós preso) em
// 1280×800. A referência é gerada na primeira execução; a ACEITAÇÃO visual é do dono (como no Ruling 2).

type Pose = { x: number; y: number; z: number; yaw: number; pitch: number };
type CriptaWindow = Window & {
  __cripta?: {
    place: string | null;
    renderer: { frames: number; frameErrors: number; quality: number; autoQuality: boolean; render: { triangles: number } };
    setCamera(p: Pose): void;
    setPsx(o: { snap?: boolean; affine?: number }): void;
    hands(visible: boolean): void;
    setShadow(o: { normalBias?: number }): { normalBias: number; bias: number } | null;
  };
};

async function hydrated(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => {
    const main = document.querySelector("main");
    return !!main && Object.keys(main).some((key) => key.startsWith("__reactFiber"));
  });
}

const info = (page: Page) => page.evaluate(() => (window as unknown as CriptaWindow).__cripta?.renderer ?? null);
const HIDE_UI = "[data-game-exit] { visibility: hidden !important; }";

test.describe.configure({ mode: "serial", timeout: 150_000 });

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "fotos só na moldura de referência 1280×800");
  await page.route("**/api/run", (route) =>
    route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ runId: "e2e", issuedAt: 0, token: "e2e" }) }));
  await page.addInitScript(() => {
    if (!localStorage.getItem("lainciano:som:v1")) localStorage.setItem("lainciano:som:v1", "off");
  });
});

async function openShot(page: Page) {
  await page.goto("/?jogo=1&debug=1&shot=cinza-entrada");
  await hydrated(page);
  await expect(page.locator("[data-game-loading]")).toHaveCount(0, { timeout: 30_000 });
  await expect.poll(async () => (await info(page))?.frames ?? 0, { timeout: 20_000 }).toBeGreaterThan(3);
  await page.addStyleTag({ content: HIDE_UI });
}

async function nextFrames(page: Page) {
  const before = (await info(page))?.frames ?? 0;
  await expect.poll(async () => (await info(page))?.frames ?? 0).toBeGreaterThan(before + 2);
}

test("cinza-entrada: lugar entrada, tempo preso, sem erro de quadro", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await openShot(page);
  await nextFrames(page);
  expect(await page.evaluate(() => (window as unknown as CriptaWindow).__cripta?.place)).toBe("entrada");
  await expect(page).toHaveScreenshot("cinza-entrada.png", { maxDiffPixelRatio: 0.02, animations: "disabled" });
  const r = await info(page);
  expect(r?.frameErrors).toBe(0);
  expect(r).toMatchObject({ quality: 480, autoQuality: false });
  // Orçamento do manifesto (40 mil triângulos) com folga: cena + sombras (duas luzes) + pós.
  expect(r?.render.triangles ?? Infinity).toBeLessThan(40_000 * 2);
  expect(errors).toEqual([]);
});

// Instrução do dono (19:43): nado de textura se fotografa em movimento. Duas poses (x +0,05 m, yaw +0,02) e, em
// cada uma, a distorção afim medida contra o mesmo quadro com a UV corrigida (afim 0), como na T6.
const E = CINZA_PLACES.entrada;
const BASE: Pose = { x: E.x, y: 1.6, z: E.z, yaw: Math.atan2(-E.face.x, -E.face.z), pitch: E.pitch };
const MOVED: Pose = { ...BASE, x: BASE.x + 0.05, yaw: BASE.yaw + 0.02 };
/** Regiões de 1280×800 que ficam na mesma superfície nas duas poses (a mão fica de fora, embaixo à direita). */
const REGIONS = {
  piso: [470, 700, 330, 80],
  parede: [240, 190, 280, 230],
  tampo: [40, 585, 260, 30],
  porta: [570, 300, 130, 330],
  armario: [1000, 330, 230, 240],
} as const;
const MAX_DISTORTION = 0.5;
const MAX_SWIM = 0.25;

async function frameAt(page: Page, pose: Pose, affine: number): Promise<Buffer> {
  await page.evaluate(
    ([p, a]) => {
      const cripta = (window as unknown as CriptaWindow).__cripta;
      cripta?.setCamera(p);
      cripta?.setPsx({ affine: a });
    },
    [pose, affine] as const,
  );
  await nextFrames(page);
  return page.screenshot();
}

function meanDiff(page: Page, pairs: Record<string, [Buffer, Buffer]>, regions: Record<string, readonly number[]>) {
  const encoded = Object.fromEntries(Object.entries(pairs).map(([k, [a, b]]) => [k, [a.toString("base64"), b.toString("base64")]]));
  return page.evaluate(
    async ({ encoded, regions }) => {
      const pixels = async (b64: string, [x, y, w, h]: readonly number[]) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const g = canvas.getContext("2d");
        if (!g) throw new Error("sem 2D");
        g.drawImage(img, 0, 0);
        return g.getImageData(x, y, w, h).data;
      };
      const out: Record<string, Record<string, number>> = {};
      for (const [pair, [a, b]] of Object.entries(encoded)) {
        out[pair] = {};
        for (const [name, region] of Object.entries(regions)) {
          const [pa, pb] = await Promise.all([pixels(a, region), pixels(b, region)]);
          let sum = 0;
          for (let i = 0; i < pa.length; i += 4) sum += (Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2])) / 3;
          out[pair][name] = sum / (pa.length / 4);
        }
      }
      return out;
    },
    { encoded, regions },
  );
}

test("cinza-entrada em movimento: textura presa à superfície (sem nado) e quadro reproduzível", async ({ page }, testInfo) => {
  await openShot(page);
  const a = await frameAt(page, BASE, 0.28);
  const a0 = await frameAt(page, BASE, 0);
  const b = await frameAt(page, MOVED, 0.28);
  const b0 = await frameAt(page, MOVED, 0);
  const again = await frameAt(page, BASE, 0.28);
  await testInfo.attach("quadro-base.png", { body: a, contentType: "image/png" });
  await testInfo.attach("quadro-deslocado.png", { body: b, contentType: "image/png" });
  const d = await meanDiff(page, { base: [a, a0], moved: [b, b0], again: [a, again] }, REGIONS);
  await testInfo.attach("distorcao.json", { body: JSON.stringify(d, null, 2), contentType: "application/json" });
  for (const region of Object.keys(REGIONS)) {
    expect(d.base[region], `distorção afim em ${region} (base)`).toBeLessThan(MAX_DISTORTION);
    expect(d.moved[region], `distorção afim em ${region} (deslocada)`).toBeLessThan(MAX_DISTORTION);
    expect(Math.abs(d.base[region] - d.moved[region]), `nado em ${region}`).toBeLessThan(MAX_SWIM);
    // Mesma pose, mesmo quadro: nenhuma textura redesenhada, nada muda com o tempo (tempo preso).
    expect(d.again[region], `quadro reproduzível em ${region}`).toBe(0);
  }
  await frameAt(page, MOVED, 0.28);
  await expect(page).toHaveScreenshot("cinza-entrada-movimento.png", { maxDiffPixelRatio: 0.02, animations: "disabled" });
});

// Ruling 9: sombra sem acne em ângulo rasante e objeto baixo com sombra encostada. Com `normalBias` 0,2 a
// auto-sombra some por completo (e a sombra de contato descola); a diferença para a receita da sala é então:
// zero nas superfícies sem nada na frente (acne = diferença ali) e > 0 em volta do caderno (a sombra existe).
const GRAZE: Pose = { x: 1.8, y: 1.6, z: 1.8, yaw: 0.29, pitch: 0 };
const GRAZE_REGIONS = { "parede-norte": [80, 200, 300, 240], "parede-leste": [740, 150, 500, 300] } as const;
const LOW: Pose = { x: -1.75, y: 1.15, z: -0.75, yaw: -0.35, pitch: -1.0 };
const NOTEBOOK_REGION = { caderno: [560, 0, 300, 120] } as const;

test("luz pendente: sem acne em parede rasante e caderno com sombra encostada", async ({ page }, testInfo) => {
  await openShot(page);
  await page.evaluate(() => (window as unknown as CriptaWindow).__cripta?.hands(false));
  const recipe = await page.evaluate(() => (window as unknown as CriptaWindow).__cripta?.setShadow({}));
  expect(recipe?.normalBias).toBeCloseTo(0.0045, 6);
  const shot = async (pose: Pose, normalBias: number) => {
    await page.evaluate(([p, nb]) => {
      const c = (window as unknown as CriptaWindow).__cripta;
      c?.setCamera(p);
      c?.setShadow({ normalBias: nb });
    }, [pose, normalBias] as const);
    await nextFrames(page);
    return page.screenshot();
  };
  const grazeRecipe = await shot(GRAZE, recipe?.normalBias ?? 0);
  const grazeNone = await shot(GRAZE, 0.2);
  const lowRecipe = await shot(LOW, recipe?.normalBias ?? 0);
  const lowNone = await shot(LOW, 0.2);
  await shot(GRAZE, recipe?.normalBias ?? 0);
  await testInfo.attach("rasante.png", { body: grazeRecipe, contentType: "image/png" });
  await testInfo.attach("caderno.png", { body: lowRecipe, contentType: "image/png" });
  const acne = await meanDiff(page, { graze: [grazeRecipe, grazeNone] }, GRAZE_REGIONS);
  const contact = await meanDiff(page, { low: [lowRecipe, lowNone] }, NOTEBOOK_REGION);
  await testInfo.attach("sombra.json", { body: JSON.stringify({ acne, contact }, null, 2), contentType: "application/json" });
  for (const region of Object.keys(GRAZE_REGIONS)) expect(acne.graze[region], `acne em ${region}`).toBeLessThan(0.05);
  expect(contact.low.caderno, "sombra do caderno no tampo").toBeGreaterThan(1);
});
