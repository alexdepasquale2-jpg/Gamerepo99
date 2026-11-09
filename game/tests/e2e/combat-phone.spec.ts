// On a phone the fight is played with the combat bar: hold Attack until the foe is down.
import { devices } from '@playwright/test';
import { bootToPlay, expect, hearth, settle, test } from './support';

const { defaultBrowserType: _browser, ...pixel } = devices['Pixel 7'];
test.use(pixel);
const SHOTS = process.env.GAME_E2E_SHOTS;

test('phone: the combat bar sits above the pad and Attack fights', async ({ page }) => {
  await bootToPlay(page);
  await hearth(page, (h) => {
    const w = h.ctx.world, p0 = h.ctx.actors.player.pos();
    for (let r = 900; r < 3200; r += 150) for (let a = 0; a < 24; a++) {
      const p = { x: p0.x + Math.cos((a / 24) * 6.283) * r, y: p0.y + Math.sin((a / 24) * 6.283) * r };
      const ok = (q: { x: number; y: number }) => w.passable(q) && !w.townAt(q);
      if (ok(p) && ok({ x: p.x + 140, y: p.y }) && ok({ x: p.x + 70, y: p.y })) { h.ctx.actors.player.setPos(p); return; }
    }
  });
  await settle(page, 900);
  const attack = page.locator('.hf-ar-btn.is-main');
  await expect(attack).toBeInViewport();
  // The bar does not cover the pad's buttons.
  const a = (await attack.boundingBox())!;
  const y = (await page.locator('#hf-pad [data-btn=y]').boundingBox())!;
  expect(a.y + a.height).toBeLessThanOrEqual(y.y + 1);
  await hearth(page, (h) => h.dev.combat.spawn('wolf', 1));
  await settle(page, 600);
  for (let i = 0; i < 30; i++) {
    const left = await hearth(page, (h) => h.dev.combat.foes().filter((f: { uid: string }) => f.uid.startsWith('dev:')).length);
    if (!left) break;
    await attack.dispatchEvent('pointerdown');
    await page.waitForTimeout(300);
    await attack.dispatchEvent('pointerup');
    if (i === 1 && SHOTS) await page.screenshot({ path: `${SHOTS}/combat-5-phone.png` });
  }
  const hero = await hearth(page, (h) => h.dev.combat.hero());
  expect(hero.kills.beast ?? 0).toBeGreaterThanOrEqual(1);
});
