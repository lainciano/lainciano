import type { Page, TestInfo } from "@playwright/test";
import { DEFAULT_SETTINGS, initialSave } from "../../src/game/save/schema";

/**
 * Jogo "leve" para os specs de CICLO DE VIDA (abrir/fechar, navegação por trás, contexto perdido, quadro que lança),
 * que não dependem da imagem. Medido no SwiftShader desta máquina (sala cinza real, ~420 chamadas de desenho): um
 * quadro em 1280×800 e 480 linhas custa ~290 ms da thread principal, e cada asserção do Playwright espera alguns
 * quadros (ele sonda por requestAnimationFrame): ~0,9 s por ação, 30 s de teste estouram com ~35 asserções. Com a
 * qualidade 240 salva e a janela em 800×500 o quadro cai a ~110 ms. Em GPU de verdade o quadro é assíncrono e o
 * problema não existe: é artefato do teste, não do produto (a navegação por trás leva < 1 s medida de fora).
 * Chamar ANTES do `page.goto`. `extra` sobrescreve campos do save (ex.: `place`).
 */
export async function lightGame(page: Page, testInfo: TestInfo, extra: Partial<ReturnType<typeof initialSave>> = {}) {
  if (testInfo.project.name === "desktop") await page.setViewportSize({ width: 800, height: 500 });
  const save = { ...initialSave(0), settings: { ...DEFAULT_SETTINGS, quality: 240 as const }, ...extra };
  await page.addInitScript((json) => localStorage.setItem("lainciano:jogo:save:v1", json), JSON.stringify(save));
}
