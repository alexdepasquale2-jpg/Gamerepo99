import { defineConfig } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * E2E for the v2 game (game/). `npm run game:e2e` builds game/ into a temp dir and serves it statically;
 * the specs drive the built game through the QA hooks on window.__hearth. The old game's suite is the
 * root playwright.config.ts (tests/e2e) and is untouched by this one.
 *
 * Environment:
 * - GAME_E2E_PORT: static server port (default 4183). Give parallel runs different ports.
 * - GAME_E2E_OUT: where the build goes (default <tmp>/last-spark-game-e2e-<port>).
 * - GAME_E2E_REUSE=1: reuse a server already on that port (skips the build).
 * - PW_CHROMIUM_PATH: the Chromium binary to launch; defaults to a preinstalled headless shell when one is
 *   on disk, because the pinned Playwright may expect a newer browser build than the container has.
 */
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.GAME_E2E_PORT ?? 4183);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const OUT = process.env.GAME_E2E_OUT ?? path.join(os.tmpdir(), `last-spark-game-e2e-${PORT}`);

const PREINSTALLED = [
  '/opt/pw-browsers/chromium_headless_shell-1243/chrome-linux/headless_shell',
  '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell',
];
const chromium = process.env.PW_CHROMIUM_PATH ?? PREINSTALLED.find((p) => fs.existsSync(p));

export default defineConfig({
  testDir: './tests/e2e',
  // Only the e2e specs: vitest's *.test.ts files under game/tests are not Playwright's.
  testMatch: '**/*.spec.ts',
  outputDir: path.join(OUT, '..', `last-spark-game-e2e-results-${PORT}`),
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // Each spec boots a whole world (WebGL in software); two at once keeps the run short without starving it.
  workers: Number(process.env.GAME_E2E_WORKERS ?? 2),
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1280, height: 800 },
    trace: 'off',
    ...(chromium ? { launchOptions: { executablePath: chromium } } : {}),
  },
  webServer: {
    command: `npm run game:build -- --outDir "${OUT}" --emptyOutDir && npx vite preview --config game/vite.config.ts --outDir "${OUT}" --host 127.0.0.1 --port ${PORT} --strictPort`,
    cwd: ROOT,
    url: BASE_URL,
    reuseExistingServer: !!process.env.GAME_E2E_REUSE,
    timeout: 180_000,
  },
});
