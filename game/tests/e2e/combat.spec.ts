import { bootToPlay, expect, hearth, settle, test } from './support';

/**
 * The action layer: out in the wilds a foe is fought with the real keys (Space to attack, Q for Cleave),
 * it dies and pays experience; the hero sheet opens on C; a lair's mark stands where the sim says.
 * Screenshots go to GAME_E2E_SHOTS when set (for a look at the fight).
 */
const SHOTS = process.env.GAME_E2E_SHOTS;

test('fight a foe in the wilds with the keyboard', async ({ page }) => {
  await bootToPlay(page);
  // Somewhere open, out of town.
  await hearth(page, (h) => {
    const w = h.ctx.world, p0 = h.ctx.actors.player.pos();
    for (let r = 900; r < 3200; r += 150) for (let a = 0; a < 24; a++) {
      const p = { x: p0.x + Math.cos((a / 24) * 6.283) * r, y: p0.y + Math.sin((a / 24) * 6.283) * r };
      const ok = (q: { x: number; y: number }) => w.passable(q) && !w.townAt(q);
      if (ok(p) && ok({ x: p.x + 140, y: p.y }) && ok({ x: p.x + 70, y: p.y })) { h.ctx.actors.player.setPos(p); return; }
    }
  });
  await settle(page, 800);
  const before = await hearth(page, (h) => h.dev.combat.hero());
  expect(before.level).toBe(1);
  await hearth(page, (h) => h.dev.combat.spawn('wolf', 1));
  await settle(page, 700);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/combat-1-wolf.png` });
  // Fight: Q (Cleave) and Space until it is down.
  await page.keyboard.press('KeyQ');
  for (let i = 0; i < 40; i++) {
    const left = await hearth(page, (h) => h.dev.combat.foes().filter((f: { uid: string }) => f.uid.startsWith('dev:')).length);
    if (!left) break;
    await page.keyboard.down('Space');
    await page.waitForTimeout(250);
    await page.keyboard.up('Space');
    if (i === 2 && SHOTS) await page.screenshot({ path: `${SHOTS}/combat-2-swing.png` });
  }
  const after = await hearth(page, (h) => h.dev.combat.hero());
  expect(after.kills.beast ?? 0).toBeGreaterThanOrEqual(1);
  expect(after.xp + (after.level - 1) * 1000).toBeGreaterThan(before.xp);
  // The hero sheet on C.
  await page.keyboard.press('KeyC');
  await expect(page.locator('[data-id=hero-tab-skills]')).toBeVisible();
  await page.locator('[data-id=hero-tab-gear]').click();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/combat-3-sheet.png` });
  await page.keyboard.press('Escape');
});

test('a boss and its guard at a lair', async ({ page }) => {
  await bootToPlay(page);
  const lair = await hearth(page, (h) => h.dev.combat.lairs()[0] ?? null);
  test.skip(!lair, 'no lair placed in this district');
  await hearth(page, (h, at) => h.ctx.actors.player.setPos({ x: at.x - 420, y: at.y }), lair.at);
  await settle(page, 1500);
  await hearth(page, (h, at) => h.ctx.actors.player.setPos({ x: at.x - 260, y: at.y + 20 }), lair.at);
  await settle(page, 1500);
  const foes = await hearth(page, (h) => h.dev.combat.foes());
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/combat-4-lair.png` });
  expect(foes.length).toBeGreaterThanOrEqual(4);
});
