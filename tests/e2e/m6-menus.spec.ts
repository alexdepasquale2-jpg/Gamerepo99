import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const SHOTS = 'docs/qa/reports/m6';
const status = (page: import('@playwright/test').Page) =>
  page.locator('#hf-status').evaluate((el) => ({ day: (el as HTMLElement).dataset.day, fp: (el as HTMLElement).dataset.fingerprint, text: el.textContent }));

test.describe('M6 saves and menus', () => {
  test('title -> play dawns -> save -> reload -> continue; world file round trip', async ({ page }) => {
    fs.mkdirSync(SHOTS, { recursive: true });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.goto('/');
    await expect(page.locator('#hf-title-menu')).toBeVisible();
    await expect(page.locator('[data-id=continue]')).toBeDisabled();
    await page.screenshot({ path: `${SHOTS}/title.png` });

    await page.locator('[data-id=new]').click();
    await expect(page.locator('#game canvas')).toBeVisible({ timeout: 20_000 });
    await page.keyboard.press('Escape');
    await expect(page.locator('#hf-pause-menu')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/pause.png` });
    for (let i = 0; i < 3; i++) await page.locator('#hf-pause-menu [data-id=rest]').click();
    await page.locator('#hf-pause-menu [data-id=save]').click();
    await page.locator('[data-id=slot-1]').click();
    await expect(page.locator('#hf-save-menu .hf-note')).toHaveText('Saved.');
    await page.screenshot({ path: `${SHOTS}/save.png` });
    await expect(page.locator('#hf-pause-menu')).toBeVisible();
    const before = await status(page);
    expect(before.text).toBe('Day 4');

    await page.reload();
    await expect(page.locator('[data-id=continue]')).toBeEnabled();
    await page.locator('[data-id=continue]').click();
    await expect(page.locator('#game canvas')).toBeVisible({ timeout: 20_000 });
    const after = await status(page);
    expect(after).toEqual(before);

    // World file: export then import.
    await page.keyboard.press('Escape');
    await page.locator('#hf-pause-menu [data-id=world]').click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-id=export]').click()]);
    expect(download.suggestedFilename()).toMatch(/^hearthfall-42-\d+\.world\.json$/);
    const file = `${SHOTS}/_exported.world.json`;
    await download.saveAs(file);
    await page.screenshot({ path: `${SHOTS}/world-file.png` });
    await page.locator('#hf-world-input').setInputFiles(file);
    await expect(page.locator('#hf-world-menu')).toHaveCount(0);
    expect((await status(page)).day).toBe(before.day);
    fs.rmSync(file);

    // Corrupt file is refused with a message.
    await page.keyboard.press('Escape');
    await page.locator('#hf-pause-menu [data-id=world]').click();
    await page.locator('#hf-world-input').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"nope":1}') });
    await expect(page.locator('#hf-world-menu .hf-note')).toContainText('Not a Hearthfall world file');
    expect(errors).toEqual([]);
  });
});
