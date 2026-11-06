import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join('artifacts', '25d');

test('capture continuous overworld screenshots', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.goto('/');
  const canvas = page.locator('#game canvas');
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, 'overworld-boot.png'), fullPage: false });
  // Walk a bit east to show road corridor streaming
  for (let i = 0; i < 40; i++) {
    await page.keyboard.down('D');
    await page.waitForTimeout(50);
  }
  await page.keyboard.up('D');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'overworld-walk-east.png'), fullPage: false });
  await canvas.screenshot({ path: path.join(OUT, 'overworld-canvas.png') });
});
