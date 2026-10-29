import { defineConfig } from "@playwright/test";

/**
 * Testes das telas contra o projeto Supabase de testes (nunca a produção).
 * Precisa de E2E_* no ambiente; o servidor sobe com `next start` (rode `next build` antes).
 */
const PORT = Number(process.env.E2E_PORT ?? 3210);

export default defineConfig({
  testDir: "e2e",
  timeout: 240_000,
  expect: { timeout: 20_000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
