import { defineConfig, devices } from "@playwright/test";

// E2E do site e do jogo: sobe o build de produção numa porta própria (3200) para não brigar com o `pnpm dev`.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
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
