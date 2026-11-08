import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const SHOTS = 'tests/e2e/artifacts/world-file-migrations';

test('importing an old (v1) world file migrates it and names who came across', async ({ page }) => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/');
  await page.locator('[data-id=new]').click();
  await page.locator('[data-id=arch-marrow]').click();
  await page.locator('[data-id=world-known]').click(); // the world you know (seed 42)
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => !!(window as unknown as { __hearth?: unknown }).__hearth);

  await page.keyboard.press('Escape');
  await page.locator('#hf-pause-menu [data-id=world]').click();
  await page.locator('#hf-world-input').setInputFiles('tests/fixtures/world-v1.world.json');

  // The world file menu gives way to "What came across", listing the legends the file carried.
  await expect(page.locator('#hf-world-menu')).toHaveCount(0);
  const arrival = page.locator('#hf-world-arrival');
  await expect(arrival).toBeVisible();
  await expect(arrival.locator('.hf-arrival li').first()).toHaveText("Two names you don't know are spoken of in Marrow's Den: Elias Boone and Marrow.");
  await expect(arrival).toContainText('Elias Boone (Ivy Quill), second of their line.');
  await expect(arrival).toContainText("carried other people's burdens");
  await expect(arrival).toContainText('Marrow: a stone in');
  await page.screenshot({ path: `${SHOTS}/arrival.png` });

  // Walk on (Esc does the same, without bouncing into the pause menu): the imported world (day 9) is live.
  await page.keyboard.press('Escape');
  await expect(page.locator('.hf-menu')).toHaveCount(0);
  await expect(page.locator('#hf-status')).toHaveText('Day 9');
  const legend = await page.evaluate(() => {
    const h = (window as unknown as { __hearth: { session: { getState(): { legacy?: { lastImprint?: { generation?: number; archetypeId?: string } } } } } }).__hearth;
    return h.session.getState().legacy?.lastImprint;
  });
  expect(legend).toMatchObject({ generation: 2, archetypeId: 'ivy_quill' });
  await page.evaluate(() => (window as unknown as { __hearth: { session: { act(id: string): void } } }).__hearth.session.act('advance:dawn'));
  await page.screenshot({ path: `${SHOTS}/after-walk-on.png` });

  // A file from a newer game is refused, kindly, and the menu stays open.
  const newer = JSON.parse(fs.readFileSync('tests/fixtures/world-v1.world.json', 'utf8'));
  newer.version = 99;
  await page.keyboard.press('Escape');
  await page.locator('#hf-pause-menu [data-id=world]').click();
  await page.locator('#hf-world-input').setInputFiles({ name: 'future.world.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(newer)) });
  await expect(page.locator('#hf-world-menu .hf-note')).toContainText('newer version of the game');
  expect(errors).toEqual([]);
});
