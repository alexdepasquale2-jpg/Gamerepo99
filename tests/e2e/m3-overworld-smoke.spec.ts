/**
 * M3 overworld Playwright smoke — Probe gate for Task 6/8.
 *
 * Durable signals (no pixel-motion heuristics):
 * - canvas boots at main.ts size (640×360)
 * - no console/page errors through boot + nearest-town Enter
 *
 * Headless limits (tip has no window/registry test hook; HUD/methodMenu are
 * in-memory only, not DOM):
 * - town chip count is not readable from the page; ≥3 towns from seed-42
 *   session dump is covered by tests/ui/play-boot.test.ts
 * - method menu open state is not exposeable without a window helper; town
 *   scene opens it in-registry on enter — we only assert Enter does not throw
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const ARTIFACTS = path.join('tests', 'e2e', 'artifacts');
/** Matches src/main.ts Phaser.Game width/height. */
const OVERWORLD_W = 640;
const OVERWORLD_H = 360;

test.describe('M3 overworld smoke', () => {
  test('boots overworld canvas, no console errors, Enter nearest town', async ({
    page,
  }) => {
    fs.mkdirSync(ARTIFACTS, { recursive: true });
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => {
      pageErrors.push(String(err));
    });

    const flushLogs = () => {
      fs.writeFileSync(
        path.join(ARTIFACTS, 'm3-console.json'),
        JSON.stringify({ consoleErrors, pageErrors }, null, 2),
      );
    };

    await page.goto('/');
    await page.locator('[data-id=new]').click(); // title menu first (M6)
    await page.locator('[data-id=arch-marrow]').click(); // pick who you are
    await expect(page.locator('#game')).toBeVisible();

    const canvas = page.locator('#game canvas');
    await expect(canvas).toBeVisible({ timeout: 20_000 });

    // Wait for BootScene → OverworldScene create (session + town chips).
    await page.waitForTimeout(500);

    const size = await canvas.evaluate((el: HTMLCanvasElement) => ({
      width: el.width,
      height: el.height,
    }));
    expect(size.width, 'canvas width matches overworld').toBe(OVERWORLD_W);
    expect(size.height, 'canvas height matches overworld').toBe(OVERWORLD_H);

    fs.writeFileSync(
      path.join(ARTIFACTS, 'm3-boot.json'),
      JSON.stringify(
        {
          size,
          note: 'Town chip count not window-exposed; see play-boot vitest. Method menu not DOM-exposed.',
        },
        null,
        2,
      ),
    );

    // Player spawns one tile below first town; nearestTown radius allows Enter.
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);

    flushLogs();

    expect(
      [...consoleErrors, ...pageErrors],
      `console/page errors: ${JSON.stringify({ consoleErrors, pageErrors })}`,
    ).toEqual([]);
  });
});
