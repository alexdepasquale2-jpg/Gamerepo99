import { defineConfig } from '@playwright/test';

/**
 * E2E runs against `vite preview` of the built game (run `npm run build` first; `npm run test:e2e` does).
 *
 * Environment:
 * - E2E_PORT: preview port (default 4173). Give parallel runs (separate worktrees) different ports.
 * - E2E_REUSE_SERVER=1: reuse a preview server already on that port. Off by default so a run never
 *   tests some other checkout's build by accident.
 * - PW_CHROMIUM_PATH: use this Chromium binary instead of Playwright's download (e.g. a preinstalled
 *   browser whose version doesn't match this Playwright).
 * - E2E_UPDATE_SHOTS=1: write screenshots into the committed QA folders (see tests/e2e/support/game.ts).
 */
const PORT = Number(process.env.E2E_PORT ?? 4173);
const URL = `http://127.0.0.1:${PORT}`;
const chromium = process.env.PW_CHROMIUM_PATH;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: URL,
    viewport: { width: 1280, height: 800 },
    trace: 'on-first-retry',
    ...(chromium ? { launchOptions: { executablePath: chromium } } : {}),
  },
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: URL,
    reuseExistingServer: !!process.env.E2E_REUSE_SERVER,
    timeout: 60_000,
  },
});
