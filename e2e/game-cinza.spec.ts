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
    setShadow(o: { light?: "main" | "flash"; normalBias?: number; bias?: number; near?: number }): { normalBias: number; bias: number; near: number } | null;
    setVisible(id: string, visible: boolean): void;
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
  await expect(page).toHaveScreenshot("cinza-entrada.png", { maxDiffPixelRatio: 0.005, animations: "disabled" });
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
  await expect(page).toHaveScreenshot("cinza-entrada-movimento.png", { maxDiffPixelRatio: 0.005, animations: "disabled" });
});

// Ruling 9: sombra sem acne em ângulo rasante. Com `normalBias` 0,2 a auto-sombra some por completo: a diferença
// para a receita é zero nas superfícies sem nada na frente (acne = diferença ali). Vale para a luz pendente e
// para a lanterna acesa varrendo uma parede de raspão.
const GRAZE: Pose = { x: 1.8, y: 1.6, z: 1.8, yaw: 0.29, pitch: 0 };
const GRAZE_REGIONS = { "parede-norte": [80, 200, 300, 240], "parede-leste": [740, 150, 500, 300] } as const;
const FLASH_GRAZE: Pose = { x: -1.55, y: 1.5, z: 1.7, yaw: 0.12, pitch: -0.1 };
/** Parede oeste sob o facho da lanterna (a mesa e a porta ficam de fora). */
const FLASH_REGIONS = { "parede-oeste": [420, 280, 200, 220] } as const;

async function shotWith(page: Page, pose: Pose, o: { light?: "main" | "flash"; normalBias?: number; bias?: number }) {
  await page.evaluate(([p, opts]) => {
    const c = (window as unknown as CriptaWindow).__cripta;
    c?.setCamera(p);
    c?.setShadow(opts);
  }, [pose, o] as const);
  await nextFrames(page);
  return page.screenshot();
}

test("sem acne em parede rasante: luz pendente e lanterna acesa", async ({ page }, testInfo) => {
  await openShot(page);
  await page.evaluate(() => (window as unknown as CriptaWindow).__cripta?.hands(false));
  const main = await page.evaluate(() => (window as unknown as CriptaWindow).__cripta?.setShadow({}));
  const flash = await page.evaluate(() => (window as unknown as CriptaWindow).__cripta?.setShadow({ light: "flash" }));
  expect(main?.normalBias).toBeCloseTo(0.0045, 6);
  expect(flash?.normalBias).toBeCloseTo(0.005, 6);
  // near da lanterna fica 0,1 (não o 0,5 da pendente): medido na T8, com 0,5 a mesa a < 0,5 m da lente deixa de
  // barrar o facho e a parede atrás acende (ver o relatório).
  expect(flash?.near).toBeCloseTo(0.1, 6);

  const grazeRecipe = await shotWith(page, GRAZE, { normalBias: main?.normalBias });
  const grazeNone = await shotWith(page, GRAZE, { normalBias: 0.2 });
  await shotWith(page, GRAZE, { normalBias: main?.normalBias });
  const flashRecipe = await shotWith(page, FLASH_GRAZE, { light: "flash", normalBias: flash?.normalBias });
  const flashNone = await shotWith(page, FLASH_GRAZE, { light: "flash", normalBias: 0.2 });
  await shotWith(page, FLASH_GRAZE, { light: "flash", normalBias: flash?.normalBias });
  await testInfo.attach("rasante-pendente.png", { body: grazeRecipe, contentType: "image/png" });
  await testInfo.attach("rasante-lanterna.png", { body: flashRecipe, contentType: "image/png" });
  const acne = await meanDiff(page, { graze: [grazeRecipe, grazeNone] }, GRAZE_REGIONS);
  const flashAcne = await meanDiff(page, { graze: [flashRecipe, flashNone] }, FLASH_REGIONS);
  await testInfo.attach("acne.json", { body: JSON.stringify({ acne, flashAcne }, null, 2), contentType: "application/json" });
  for (const region of Object.keys(GRAZE_REGIONS)) expect(acne.graze[region], `acne da pendente em ${region}`).toBeLessThan(0.05);
  expect(flashAcne.graze["parede-oeste"], "acne da lanterna na parede oeste").toBeLessThan(0.05);
});

// Sombra ENCOSTADA (não só "existe"): máscara do objeto = quadro com o caderno − quadro sem ele (os dois com
// normalBias 0,2, sem sombra de contato); máscara da sombra = o que a receita escurece em volta. Conta os pixels
// de sombra a ≤ 2 px do caderno. Controles medidos na T8: receita 447 de 547 encostados; normalBias 0,008 → 268;
// bias −0,004 (o do protótipo) → 175; normalBias 0,03 → 0. A lanterna fica apagada (a sombra dela é outra).
const NOTEBOOK: Pose = { x: -1.45, y: 1.31, z: -0.87, yaw: 0, pitch: -0.785 };
const MIN_TOUCHING = 300;

function contact(page: Page, frames: { recipe: Buffer; detached: Buffer; withObj: Buffer; withoutObj: Buffer }) {
  const b64 = Object.fromEntries(Object.entries(frames).map(([k, v]) => [k, v.toString("base64")]));
  return page.evaluate(async (f) => {
    const load = async (s: string) => {
      const img = new Image();
      img.src = `data:image/png;base64,${s}`;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const g = canvas.getContext("2d");
      if (!g) throw new Error("sem 2D");
      g.drawImage(img, 0, 0);
      return g.getImageData(0, 0, img.width, img.height);
    };
    const [recipe, detached, withObj, withoutObj] = await Promise.all([f.recipe, f.detached, f.withObj, f.withoutObj].map(load));
    const W = recipe.width;
    const H = recipe.height;
    const lum = (img: ImageData, i: number) => (img.data[i * 4] + img.data[i * 4 + 1] + img.data[i * 4 + 2]) / 3;
    const obj = new Uint8Array(W * H);
    let [x0, y0, x1, y1] = [W, H, 0, 0];
    for (let i = 0; i < W * H; i++) {
      if (Math.abs(lum(withObj, i) - lum(withoutObj, i)) <= 10) continue;
      obj[i] = 1;
      const x = i % W;
      const y = Math.floor(i / W);
      [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
    }
    const measure = (shaded: ImageData) => {
      let shadow = 0;
      let touching = 0;
      for (let y = Math.max(2, y0 - 40); y <= Math.min(H - 3, y1 + 40); y++) {
        for (let x = Math.max(2, x0 - 40); x <= Math.min(W - 3, x1 + 40); x++) {
          const i = y * W + x;
          if (obj[i] || lum(withObj, i) - lum(shaded, i) <= 8) continue;
          shadow += 1;
          let near = false;
          for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2 && !near; dx++) near = obj[i + dy * W + dx] === 1;
          if (near) touching += 1;
        }
      }
      return { shadow, touching };
    };
    return { objectPx: obj.reduce((s, v) => s + v, 0), recipe: measure(recipe), detached: measure(detached) };
  }, b64);
}

test("objeto baixo: o caderno (1,8 cm) tem sombra encostada nele, e a métrica pega a sombra descolada", async ({ page }, testInfo) => {
  await openShot(page);
  await page.evaluate(() => (window as unknown as CriptaWindow).__cripta?.hands(false));
  await page.keyboard.press("KeyF");
  const frame = async (o: { normalBias: number; bias?: number }, visible: boolean) => {
    await page.evaluate(
      ([p, opts, v]) => {
        const cr = (window as unknown as CriptaWindow).__cripta;
        cr?.setCamera(p);
        cr?.setShadow(opts);
        cr?.setVisible("caderno", v);
      },
      [NOTEBOOK, o, visible] as const,
    );
    await nextFrames(page);
    return page.screenshot();
  };
  const recipe = await frame({ normalBias: 0.0045, bias: -0.0005 }, true);
  // controle: o bias de profundidade do protótipo (−0,004) descola a sombra de contato
  const detached = await frame({ normalBias: 0.0045, bias: -0.004 }, true);
  const withObj = await frame({ normalBias: 0.2, bias: -0.0005 }, true);
  const withoutObj = await frame({ normalBias: 0.2, bias: -0.0005 }, false);
  await frame({ normalBias: 0.0045, bias: -0.0005 }, true);
  await testInfo.attach("caderno.png", { body: recipe, contentType: "image/png" });
  const r = await contact(page, { recipe, detached, withObj, withoutObj });
  await testInfo.attach("contato.json", { body: JSON.stringify(r, null, 2), contentType: "application/json" });
  expect(r.objectPx, "o caderno está no quadro").toBeGreaterThan(5000);
  expect(r.recipe.touching, "pixels de sombra encostados no caderno").toBeGreaterThanOrEqual(MIN_TOUCHING);
  expect(r.recipe.touching / Math.max(1, r.recipe.shadow), "a sombra é colada, não solta").toBeGreaterThanOrEqual(0.6);
  expect(r.detached.touching, "controle: com o bias do protótipo a métrica acusa").toBeLessThan(MIN_TOUCHING);
});
