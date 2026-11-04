import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { ANTESSALA_PLACES, FURNITURE_COLLIDERS, PLAYER_RADIUS, ROOM } from "../src/game/layers/antessala/places";
import { lightGame } from "./helpers/light";

// B8: a casca da Antessala (a sala vazia, composta e andável). Ciclo de vida em jogo leve (`lightGame`); fotos e
// métricas de imagem (`@slow`) na moldura de referência 1280×800, com `?shot=antessala-*` (lugar fixo, tempo preso,
// janela à noite).
//
// BASELINE: as comparações de pixel (`toHaveScreenshot`) só rodam com `CRIPTA_ACEITE_ANTESSALA=1`, DEPOIS do ok do
// dono nas fotos do marco (nenhuma referência é gravada antes). Para gerar, com o ok dado:
//   CRIPTA_ACEITE_ANTESSALA=1 pnpm exec playwright test e2e/game-antessala.spec.ts --grep @slow --project=desktop --update-snapshots
// As fotos de revisão saem com `CRIPTA_CAPTURAS=<pasta>` (o teste "fotos de revisão" só roda com ela).

type Pose = { x: number; y: number; z: number; yaw: number; pitch: number };
type Frame = { calls: number; triangles: number; shadow: { calls: number; triangles: number }; scene: { calls: number; triangles: number }; post: { calls: number } };
type CriptaWindow = Window & {
  __cripta?: {
    layer: string;
    place: string | null;
    camera: { position: [number, number, number] };
    renderer: { frames: number; frameErrors: number; quality: number; autoQuality: boolean; frame: Frame; memory: { geometries: number; textures: number } };
    setCamera(p: Pose): void;
    setPsx(o: { snap?: boolean; affine?: number }): void;
    setShadow(o: { light?: "main" | "flash"; normalBias?: number; bias?: number; near?: number }): { normalBias: number; bias: number; near: number } | null;
    setVisible(id: string, visible: boolean): void;
    hands(visible: boolean): void;
  };
};

const ACCEPT = process.env.CRIPTA_ACEITE_ANTESSALA === "1";
const CAPTURES = process.env.CRIPTA_CAPTURAS ?? "";

/** Avisos do navegador headless que não são do jogo (SwiftShader, tela cheia sem gesto). */
const BENIGN = [/requestFullscreen/, /GL Driver Message/, /KHR_parallel_shader_compile/, /GPU stall/];

function collectConsole(page: Page) {
  const out: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error" && msg.type() !== "warning") return;
    if (BENIGN.some((re) => re.test(msg.text()))) return;
    out.push(`${msg.type()}: ${msg.text()}`);
  });
  page.on("pageerror", (error) => out.push(`pageerror: ${error.message}`));
  return out;
}

async function hydrated(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => {
    const main = document.querySelector("main");
    return !!main && Object.keys(main).some((key) => key.startsWith("__reactFiber"));
  });
}

const cripta = (page: Page) => page.evaluate(() => {
  const c = (window as unknown as CriptaWindow).__cripta;
  return c ? { layer: c.layer, place: c.place, position: c.camera.position, frames: c.renderer.frames, frameErrors: c.renderer.frameErrors, frame: c.renderer.frame } : null;
});

async function open(page: Page, query: string) {
  await page.goto(`/?jogo=1&debug=1${query}`);
  await hydrated(page);
  await expect(page.locator("[data-game-loading]")).toHaveCount(0, { timeout: 40_000 });
  await expect.poll(async () => (await cripta(page))?.frames ?? 0, { timeout: 30_000 }).toBeGreaterThan(3);
}

async function nextFrames(page: Page) {
  const before = (await cripta(page))?.frames ?? 0;
  await expect.poll(async () => (await cripta(page))?.frames ?? 0).toBeGreaterThan(before + 2);
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/run", (route) =>
    route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ runId: "e2e", issuedAt: 0, token: "e2e" }) }));
  await page.addInitScript(() => {
    if (!localStorage.getItem("lainciano:som:v1")) localStorage.setItem("lainciano:som:v1", "off");
  });
});

/* ================================================================== ciclo de vida (desktop e mobile) */

test.describe("antessala · abrir e andar", () => {
  test.describe.configure({ timeout: 150_000 });

  test("o jogo abre na Antessala, no lugar entrada, sem erro nem aviso no console", async ({ page }, testInfo) => {
    await lightGame(page, testInfo);
    const logs = collectConsole(page);
    await open(page, "");
    const c = await cripta(page);
    expect(c?.layer).toBe("antessala");
    expect(c?.place).toBe("entrada");
    await nextFrames(page);
    expect((await cripta(page))?.frameErrors).toBe(0);
    expect(logs, logs.join("\n")).toEqual([]);
  });

  test("um save da sala cinza (1A) abre a Antessala na entrada, com os ajustes de antes", async ({ page }, testInfo) => {
    await lightGame(page, testInfo, { layer: "cinza", place: "mesa", items: ["chave"] });
    await open(page, "");
    const c = await cripta(page);
    expect(c?.layer).toBe("antessala");
    expect(c?.place).toBe("entrada");
    const save = await page.evaluate(() => JSON.parse(localStorage.getItem("lainciano:jogo:save:v1") ?? "{}"));
    expect(save.settings.quality).toBe(240);
    expect(save.items).toEqual([]);
  });

  test("L lista os lugares e Enter em “o balcão” leva até lá", async ({ page, isMobile }, testInfo) => {
    test.skip(isMobile, "teclado só no desktop");
    await lightGame(page, testInfo);
    await open(page, "");
    await page.keyboard.press("KeyL");
    const list = page.getByRole("navigation", { name: "Lugares" });
    await expect(list).toBeVisible();
    await expect(list.getByRole("button", { name: /a entrada · aqui/ })).toBeDisabled();
    // o canto atrás do balcão aparece; o fundo (passagem) não
    await expect(list.getByRole("button", { name: "atrás do balcão" })).toHaveCount(1);
    await expect(list.getByRole("button", { name: "o fundo" })).toHaveCount(0);
    await list.getByRole("button", { name: "o balcão", exact: true }).press("Enter");
    await expect(list).toHaveCount(0);
    await expect.poll(async () => (await cripta(page))?.place, { timeout: 60_000 }).toBe("balcao");
    const [x, , z] = (await cripta(page))?.position ?? [NaN, 0, NaN];
    expect(Math.hypot(x - ANTESSALA_PLACES.balcao.x, z - ANTESSALA_PLACES.balcao.z)).toBeLessThan(0.3);
  });

  test("WASD não atravessa as paredes nem os móveis (pegadas)", async ({ page, isMobile }, testInfo) => {
    test.skip(isMobile, "teclado só no desktop");
    await lightGame(page, testInfo);
    await open(page, "");
    const inside = async () => {
      const [x, , z] = (await cripta(page))?.position ?? [NaN, 0, NaN];
      const eps = 0.02;
      expect(x).toBeGreaterThanOrEqual(ROOM.minX + PLAYER_RADIUS - eps);
      expect(x).toBeLessThanOrEqual(ROOM.maxX - PLAYER_RADIUS + eps);
      expect(z).toBeGreaterThanOrEqual(ROOM.minZ + PLAYER_RADIUS - eps);
      expect(z).toBeLessThanOrEqual(ROOM.maxZ - PLAYER_RADIUS + eps);
      for (const b of FURNITURE_COLLIDERS) {
        const d = Math.hypot(Math.max(b.minX - x, 0, x - b.maxX), Math.max(b.minZ - z, 0, z - b.maxZ));
        expect(d, `dentro de uma pegada em (${x.toFixed(2)}, ${z.toFixed(2)})`).toBeGreaterThanOrEqual(PLAYER_RADIUS - eps);
      }
      return { x, z };
    };
    // para trás, contra a porta do pátio (fechada): para no raio
    await page.keyboard.down("KeyS");
    await page.waitForTimeout(2500);
    await page.keyboard.up("KeyS");
    const back = await inside();
    expect(back.z).toBeGreaterThan(ROOM.maxZ - PLAYER_RADIUS - 0.08);
    // para a esquerda (oeste), ao longo da parede sul: o aquecedor segura
    await page.keyboard.down("KeyA");
    await page.waitForTimeout(3000);
    await page.keyboard.up("KeyA");
    await inside();
    // para a frente até a porta norte (fechada) e para a direita, contra a parede leste
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(6000);
    await page.keyboard.up("KeyW");
    await inside();
    await page.keyboard.down("KeyD");
    await page.waitForTimeout(5000);
    await page.keyboard.up("KeyD");
    await inside();
  });
});

/* ================================================================== fotos e métricas de imagem (@slow) */

test.describe("@slow antessala · imagem", () => {
  test.describe.configure({ mode: "serial", timeout: 240_000 });
  test.skip(({ isMobile }) => isMobile, "fotos só na moldura de referência 1280×800 (desktop)");

  const HIDE_UI = "[data-game-exit] { visibility: hidden !important; }";
  async function openShot(page: Page, shot: string, extra = "") {
    await open(page, `&shot=${shot}${extra}`);
    await page.addStyleTag({ content: HIDE_UI });
  }

  test("antessala-entrada: lugar entrada, tempo preso, orçamento medido", async ({ page }, testInfo) => {
    const logs = collectConsole(page);
    await openShot(page, "antessala-entrada");
    await nextFrames(page);
    const c = await cripta(page);
    expect(c?.place).toBe("entrada");
    const withHands = c?.frame;
    await page.evaluate(() => (window as unknown as CriptaWindow).__cripta?.hands(false));
    await nextFrames(page);
    const shell = (await cripta(page))?.frame;
    const memory = await page.evaluate(() => (window as unknown as CriptaWindow).__cripta?.renderer.memory);
    await testInfo.attach("orcamento.json", { body: JSON.stringify({ withHands, shell, memory }, null, 2), contentType: "application/json" });
    // casca vazia com sombras, sem as mãos (B14 cuida delas): meta indicativa ≤ 40 chamadas; sala ≤ 25 mil triângulos
    expect(shell?.calls ?? Infinity).toBeLessThanOrEqual(45);
    expect(shell?.scene.triangles ?? Infinity).toBeLessThanOrEqual(25_000);
    expect(logs, logs.join("\n")).toEqual([]);
    if (ACCEPT) await expect(page).toHaveScreenshot("antessala-entrada.png", { maxDiffPixelRatio: 0.005, animations: "disabled" });
  });

  // Nado de textura se fotografa em movimento (x +0,05 m, yaw +0,02), contra o mesmo quadro com a UV corrigida (afim 0).
  const E = ANTESSALA_PLACES.entrada;
  const BASE: Pose = { x: E.x, y: 1.6, z: E.z, yaw: Math.atan2(-E.face.x, -E.face.z), pitch: E.pitch };
  const MOVED: Pose = { ...BASE, x: BASE.x + 0.05, yaw: BASE.yaw + 0.02 };
  /** Regiões de 1280×800 que ficam na mesma superfície nas duas poses (sem as mãos). */
  const REGIONS = {
    piso: [470, 690, 330, 80],
    "parede-norte": [250, 250, 190, 140],
    "parede-leste": [920, 470, 260, 140],
    porta: [500, 330, 120, 240],
    teto: [520, 30, 300, 60],
  } as const;

  async function frameAt(page: Page, pose: Pose, affine: number): Promise<Buffer> {
    await page.evaluate(
      ([p, a]) => {
        const c = (window as unknown as CriptaWindow).__cripta;
        c?.setCamera(p);
        c?.setPsx({ affine: a });
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

  test("antessala-entrada em movimento: textura presa à superfície (sem nado) e quadro reproduzível", async ({ page }, testInfo) => {
    await openShot(page, "antessala-entrada");
    await page.evaluate(() => (window as unknown as CriptaWindow).__cripta?.hands(false));
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
      expect(d.base[region], `distorção afim em ${region} (base)`).toBeLessThan(0.5);
      expect(d.moved[region], `distorção afim em ${region} (deslocada)`).toBeLessThan(0.5);
      expect(Math.abs(d.base[region] - d.moved[region]), `nado em ${region}`).toBeLessThan(0.25);
      expect(d.again[region], `quadro reproduzível em ${region}`).toBe(0);
    }
    if (ACCEPT) {
      await frameAt(page, MOVED, 0.28);
      await expect(page).toHaveScreenshot("antessala-entrada-movimento.png", { maxDiffPixelRatio: 0.005, animations: "disabled" });
    }
  });

  // Ruling 9: sem acne em parede rasante. Com `normalBias` 0,2 a auto-sombra some: a diferença para a receita é zero
  // nas superfícies sem nada na frente (acne = diferença ali). Do canto sudoeste, olhando a parede norte e a leste.
  const GRAZE: Pose = { x: -1.9, y: 1.6, z: 2.1, yaw: -0.55, pitch: 0.05 };
  const GRAZE_REGIONS = { "parede-norte": [180, 300, 260, 160], "parede-leste": [800, 330, 320, 250] } as const;

  async function shotWith(page: Page, pose: Pose, o: { normalBias?: number; bias?: number }) {
    await page.evaluate(([p, opts]) => {
      const c = (window as unknown as CriptaWindow).__cripta;
      c?.setCamera(p);
      c?.setShadow(opts);
    }, [pose, o] as const);
    await nextFrames(page);
    return page.screenshot();
  }

  test("sem acne em parede rasante (lâmpada âmbar)", async ({ page }, testInfo) => {
    await openShot(page, "antessala-entrada");
    await page.evaluate(() => (window as unknown as CriptaWindow).__cripta?.hands(false));
    const main = await page.evaluate(() => (window as unknown as CriptaWindow).__cripta?.setShadow({}));
    expect(main?.normalBias).toBeCloseTo(0.0045, 6);
    expect(main?.bias).toBeCloseTo(-0.0005, 6);
    expect(main?.near).toBeCloseTo(0.5, 6);
    const recipe = await shotWith(page, GRAZE, { normalBias: main?.normalBias });
    const none = await shotWith(page, GRAZE, { normalBias: 0.2 });
    await shotWith(page, GRAZE, { normalBias: main?.normalBias });
    await testInfo.attach("rasante.png", { body: recipe, contentType: "image/png" });
    const acne = await meanDiff(page, { graze: [recipe, none] }, GRAZE_REGIONS);
    await testInfo.attach("acne.json", { body: JSON.stringify(acne, null, 2), contentType: "application/json" });
    for (const region of Object.keys(GRAZE_REGIONS)) expect(acne.graze[region], `acne em ${region}`).toBeLessThan(0.05);
  });

  // Sombra ENCOSTADA do objeto baixo de teste (um livro de 1,8 cm, placeholder) no tampo do balcão (placeholder):
  // máscara do objeto = com − sem (os dois com normalBias 0,2); sombra = o que a receita escurece em volta.
  // Do lado norte do balcão, olhando para o sul: a lâmpada fica do outro lado do livro (o corpo do jogador, que também
// projeta sombra, não fica entre a lâmpada e o tampo).
const BOOK: Pose = { x: 0.99, y: 1.42, z: -1.45, yaw: Math.PI, pitch: -1.0 };

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

  test("objeto baixo de teste no balcão: sombra encostada, sem acne no tampo", async ({ page }, testInfo) => {
    await openShot(page, "antessala-balcao", "&placeholders=1");
    await page.evaluate(() => (window as unknown as CriptaWindow).__cripta?.hands(false));
    const frame = async (o: { normalBias: number; bias?: number }, visible: boolean) => {
      await page.evaluate(
        ([p, opts, v]) => {
          const c = (window as unknown as CriptaWindow).__cripta;
          c?.setCamera(p);
          c?.setShadow(opts);
          c?.setVisible("placeholder:teste-sombra", v);
        },
        [BOOK, o, visible] as const,
      );
      await nextFrames(page);
      return page.screenshot();
    };
    const recipe = await frame({ normalBias: 0.0045, bias: -0.0005 }, true);
    const detached = await frame({ normalBias: 0.0045, bias: -0.004 }, true);
    const withObj = await frame({ normalBias: 0.2, bias: -0.0005 }, true);
    const withoutObj = await frame({ normalBias: 0.2, bias: -0.0005 }, false);
    // acne no tampo: a receita contra 0,2 sem o objeto (nada na frente: a diferença tem de ser zero)
    const bare = await frame({ normalBias: 0.0045, bias: -0.0005 }, false);
    await frame({ normalBias: 0.0045, bias: -0.0005 }, true);
    await testInfo.attach("livro.png", { body: recipe, contentType: "image/png" });
    const r = await contact(page, { recipe, detached, withObj, withoutObj });
    const acne = await meanDiff(page, { tampo: [bare, withoutObj] }, { tampo: [330, 360, 600, 330] });
    await testInfo.attach("contato.json", { body: JSON.stringify({ ...r, acne }, null, 2), contentType: "application/json" });
    expect(r.objectPx, "o livro está no quadro").toBeGreaterThan(3000);
    expect(r.recipe.touching, "pixels de sombra encostados no livro").toBeGreaterThanOrEqual(200);
    // a sombra aqui é comprida (~1,2 cm, ~12 px): só a faixa de 2 px junto do livro conta como encostada, então a fração
    // esperada é ~2/12; descolada (peter-panning) ela cai a ~0 (o controle abaixo)
    expect(r.recipe.touching / Math.max(1, r.recipe.shadow), "a sombra começa no livro").toBeGreaterThanOrEqual(0.12);
    expect(r.detached.touching, "controle: com o bias do protótipo a métrica acusa").toBeLessThan(r.recipe.touching);
    expect(acne.tampo.tampo, "acne no tampo").toBeLessThan(0.05);
  });

  test("fotos de revisão (só com CRIPTA_CAPTURAS)", async ({ page }) => {
    test.skip(!CAPTURES, "defina CRIPTA_CAPTURAS=<pasta> para gravar as fotos do marco");
    mkdirSync(CAPTURES, { recursive: true });
    const metrics: Record<string, unknown> = {};
    const take = async (name: string, hands: boolean) => {
      await page.evaluate((h) => (window as unknown as CriptaWindow).__cripta?.hands(h), hands);
      await nextFrames(page);
      writeFileSync(`${CAPTURES}/${name}.png`, await page.screenshot());
      metrics[name] = (await cripta(page))?.frame;
    };
    for (const luz of ["noite", "entardecer", "dia"] as const) {
      await openShot(page, "antessala-entrada", `&luz=${luz}`);
      await take(`01-plano-de-entrada-${luz}`, true);
      if (luz === "noite") await take("02-plano-de-entrada-noite-sem-maos", false);
      await openShot(page, "antessala-janela", `&luz=${luz}`);
      await take(`05-janela-${luz}`, false);
    }
    await openShot(page, "antessala-balcao");
    await take("03-balcao", false);
    await openShot(page, "antessala-entrada", "&placeholders=1");
    await take("04-plano-de-entrada-com-placeholders", false);
    writeFileSync(`${CAPTURES}/metricas.json`, `${JSON.stringify(metrics, null, 2)}\n`);
  });
});
