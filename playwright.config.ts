import { defineConfig, devices } from "@playwright/test";

// E2E do site e do jogo: sobe o build de produção numa porta própria (3200) para não brigar com o `pnpm dev`.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // Um worker: o jogo agora abre a sala cinza de verdade (T8) e, no SwiftShader desta máquina (4 núcleos), um quadro
  // 1280×800 custa ~160 ms sozinho; com duas páginas WebGL em paralelo passa dos 250 ms que o runtime trata como
  // pausa e os testes de ciclo de vida (fps, navegação por trás) estouram o tempo. Medido na T8; ver o relatório.
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3200",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm build && pnpm start -p 3200",
    port: 3200,
    reuseExistingServer: true,
    timeout: 240_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
