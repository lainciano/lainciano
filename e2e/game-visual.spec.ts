import { expect, test, type Page } from "@playwright/test";

// T6 (Ruling 2): fotos do PSX portado na cena de referência de debug `psx-ref` (piso, paredes, balcão e luz
// pendente do protótipo 7), em 1280×800, nos três modos do pós. A referência é gerada na primeira execução;
// a aceitação visual (comparação com o protótipo 7 na mesma moldura) é do dono.

type CriptaWindow = Window & {
  __cripta?: {
    renderer: { frames: number; frameErrors: number; postMode: number; compileMs: number | null; programs: number; quality: number; autoQuality: boolean };
    setPostMode(m: 0 | 1 | 2): void;
    setCamera(p: Pose): void;
    setPsx(o: { snap?: boolean; affine?: number }): void;
  };
};
type Pose = { x: number; y: number; z: number; yaw: number; pitch: number };

async function hydrated(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => {
    const main = document.querySelector("main");
    return !!main && Object.keys(main).some((key) => key.startsWith("__reactFiber"));
  });
}

const info = (page: Page) => page.evaluate(() => (window as unknown as CriptaWindow).__cripta?.renderer ?? null);

// O botão de sair é DOM por cima do canvas: fica fora da foto (o texto nunca passa pelo pós).
const HIDE_UI = "[data-game-exit] { visibility: hidden !important; }";

// SwiftShader é lento: as fotos rodam uma de cada vez (dois WebGL em paralelo estouram o tempo) e com folga.
test.describe.configure({ mode: "serial", timeout: 120_000 });

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "fotos só na moldura de referência 1280×800");
  await page.route("**/api/run", (route) =>
    route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ runId: "e2e", issuedAt: 0, token: "e2e" }) }));
  await page.addInitScript(() => {
    if (!localStorage.getItem("lainciano:som:v1")) localStorage.setItem("lainciano:som:v1", "off");
  });
});

test("psx-ref: compila antes do 1º quadro e fotografa os modos PSX, gravura e ASCII", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/?jogo=1&debug=1&shot=psx-ref");
  await hydrated(page);
  await expect(page.locator("[data-game-loading]")).toHaveCount(0, { timeout: 20_000 });
  await expect.poll(async () => (await info(page))?.frames ?? 0, { timeout: 10_000 }).toBeGreaterThan(3);

  await page.addStyleTag({ content: HIDE_UI });

  const ready = await info(page);
  // O compileAsync rodou (cena + pós) antes de o loop ligar; os programas do PSX existem.
  expect(ready?.compileMs).not.toBeNull();
  expect(ready?.programs).toBeGreaterThan(1);
  expect(ready?.postMode).toBe(1);

  for (const mode of [1, 0, 2] as const) {
    await page.evaluate((m) => (window as unknown as CriptaWindow).__cripta?.setPostMode(m), mode);
    const before = (await info(page))?.frames ?? 0;
    await expect.poll(async () => (await info(page))?.frames ?? 0).toBeGreaterThan(before + 2);
    expect((await info(page))?.postMode).toBe(mode);
    await expect(page).toHaveScreenshot(`psx-ref-modo-${mode}.png`, { maxDiffPixelRatio: 0.02, animations: "disabled" });
  }

  expect((await info(page))?.frameErrors).toBe(0);
  // A cena de referência prende a qualidade do aparelho: as fotos não mudam de resolução no meio.
  expect(await info(page)).toMatchObject({ quality: 480, autoQuality: false });
  // Erro de compilação de shader o three registra no console: nenhum aqui.
  expect(errors).toEqual([]);
});

// Instrução do dono (19:43): cintilação/nado de textura se fotografa em movimento. Dois quadros com a câmera
// deslocada (x +0,05 m, yaw +0,02 rad) e, em cada um, a distorção afim medida contra o mesmo quadro com a
// textura corrigida (afim 0): uma caixa grande sem subdivisão faz a distorção (e o nado entre os quadros)
// crescer — no tampo, 0,22 → 1,0 nível médio quando as caixas voltam a 1 segmento.
const BASE: Pose = { x: 0.15, y: 1.6, z: 1.0, yaw: -0.4636, pitch: -0.08 };
const MOVED: Pose = { ...BASE, x: BASE.x + 0.05, yaw: BASE.yaw + 0.02 };
/** Regiões de 1280×800 que ficam na mesma superfície nas duas poses. */
const REGIONS = { tampo: [640, 600, 260, 100], piso: [20, 700, 310, 90], parede: [100, 450, 300, 150] } as const;
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
  const before = (await info(page))?.frames ?? 0;
  await expect.poll(async () => (await info(page))?.frames ?? 0).toBeGreaterThan(before + 2);
  return page.screenshot();
}

/** Diferença média absoluta (0–255, média dos 3 canais) entre pares de imagens, por região. */
function meanDiff(page: Page, pairs: Record<string, [Buffer, Buffer]>) {
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
    { encoded, regions: REGIONS },
  );
}

test("psx-ref em movimento: textura presa à superfície (sem nado) e quadro reproduzível", async ({ page }, testInfo) => {
  await page.goto("/?jogo=1&debug=1&shot=psx-ref");
  await hydrated(page);
  await expect(page.locator("[data-game-loading]")).toHaveCount(0, { timeout: 20_000 });
  await page.addStyleTag({ content: HIDE_UI });

  const a = await frameAt(page, BASE, 0.28);
  const a0 = await frameAt(page, BASE, 0);
  const b = await frameAt(page, MOVED, 0.28);
  const b0 = await frameAt(page, MOVED, 0);
  const again = await frameAt(page, BASE, 0.28);
  await testInfo.attach("quadro-base.png", { body: a, contentType: "image/png" });
  await testInfo.attach("quadro-deslocado.png", { body: b, contentType: "image/png" });

  expect(await info(page)).toMatchObject({ quality: 480, autoQuality: false });
  const d = await meanDiff(page, { base: [a, a0], moved: [b, b0], again: [a, again] });
  await testInfo.attach("distorcao.json", { body: JSON.stringify(d, null, 2), contentType: "application/json" });
  for (const region of Object.keys(REGIONS)) {
    expect(d.base[region], `distorção afim em ${region} (base)`).toBeLessThan(MAX_DISTORTION);
    expect(d.moved[region], `distorção afim em ${region} (deslocada)`).toBeLessThan(MAX_DISTORTION);
    expect(Math.abs(d.base[region] - d.moved[region]), `nado em ${region}`).toBeLessThan(MAX_SWIM);
    // Mesma pose, mesmo quadro: nada redesenha textura nem muda com o tempo (tempo preso na cena de referência).
    expect(d.again[region], `quadro reproduzível em ${region}`).toBe(0);
  }
  // O quadro deslocado também vira referência (o par fica anexado ao relatório do teste).
  await frameAt(page, MOVED, 0.28);
  await expect(page).toHaveScreenshot("psx-ref-movimento.png", { maxDiffPixelRatio: 0.02, animations: "disabled" });
});
