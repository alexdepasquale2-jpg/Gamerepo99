/** M6 step 8: reignite flash + despair desaturation screenshots (docs/qa/screenshots). */
import { test, expect } from '@playwright/test';
import { shotsDir, startGame } from './support/game';

test('capture reignite + despair', async ({ page }) => {
  const OUT = shotsDir('juice', 'docs/qa/screenshots');
  await startGame(page);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/baseline.png` });
  await page.evaluate(() => {
    const h = (window as any).__hearth;
    const p = h.scene.player;
    h.scene.bus.emit('vfx.reignite', { x: p.x, y: p.y, warmthBefore: 0.2, warmthAfter: 0.8 });
  });
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}/reignite.png` });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const h = (window as any).__hearth;
    for (const t of h.towns) h.surface.setDespairOverride(t, 1);
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/despair.png` });
});
