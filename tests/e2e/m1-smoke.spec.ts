import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const ARTIFACTS = path.join('tests', 'e2e', 'artifacts');
const MAP_W = 16 * 32; // 512
const MAP_H = 12 * 32; // 384

test.describe('M1 smoke', () => {
  test('boots, renders tile map, people wander, no console errors', async ({ page }) => {
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
        path.join(ARTIFACTS, 'm1-console.json'),
        JSON.stringify({ consoleErrors, pageErrors }, null, 2),
      );
    };

    await page.goto('/');
    await expect(page.locator('#game')).toBeVisible();

    const canvas = page.locator('#game canvas');
    await expect(canvas).toBeVisible({ timeout: 20_000 });

    const size = await canvas.evaluate((el: HTMLCanvasElement) => ({
      width: el.width,
      height: el.height,
    }));
    expect(size.width, 'canvas width matches map').toBe(MAP_W);
    expect(size.height, 'canvas height matches map').toBe(MAP_H);

    const shotA = path.join(ARTIFACTS, 'm1-wander-t0.png');
    const shotB = path.join(ARTIFACTS, 'm1-wander-t1.png');
    await page.waitForTimeout(400);
    await canvas.screenshot({ path: shotA });
    await page.waitForTimeout(1500);
    await canvas.screenshot({ path: shotB });

    const bufA = fs.readFileSync(shotA);
    const bufB = fs.readFileSync(shotB);
    const motion = {
      bytesA: bufA.length,
      bytesB: bufB.length,
      buffersDiffer: bufA.compare(bufB) !== 0,
      size,
    };
    fs.writeFileSync(path.join(ARTIFACTS, 'm1-motion.json'), JSON.stringify(motion, null, 2));
    flushLogs();

    expect(bufA.length, 'screenshot t0 non-trivial').toBeGreaterThan(10_000);
    expect(bufB.length, 'screenshot t1 non-trivial').toBeGreaterThan(10_000);
    expect(motion.buffersDiffer, 'expected people to wander (screenshots differ)').toBe(true);

    expect(
      [...consoleErrors, ...pageErrors],
      `console/page errors: ${JSON.stringify({ consoleErrors, pageErrors })}`,
    ).toEqual([]);
  });
});
