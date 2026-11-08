/** Hoarder path: hide coin with a neighbour, see the chest, hear the night's news, reach the hoard ending. */
import { test, expect, type Page } from '@playwright/test';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const H = (): Any => (window as Any).__hearth;

async function boot(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('[data-id=new]').click();
  await page.locator('[data-id=arch-marrow]').click();
  await page.locator('[data-id=world-known]').click(); // the world you know (seed 42)
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => !!(window as Any).__hearth, null, { timeout: 20_000 });
}

test('hide coin, see the stash, and meet the hoard ending', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await boot(page);

  // A stash town: the one the run starts in (every town has a stash site).
  const where = await page.evaluate(() => {
    const st = (window as Any).__hearth.session.getState();
    const site = st.data.stashSites.sites.find((s: Any) => s.townId === st.player.townId);
    return { townId: st.player.townId as string, siteId: site?.id as string | undefined };
  });
  expect(where.siteId).toBeTruthy();

  await page.evaluate((townId) => {
    const h = (window as Any).__hearth;
    h.dev.give('coin', 50);
    h.dev.arriveAt(townId);
  }, where.townId);
  const pid = await page.evaluate(() => {
    const h = (window as Any).__hearth;
    const st = h.session.getState();
    return Object.keys(st.people).sort().find((id) => st.people[id].townId === st.player.townId) as string;
  });

  const chips = await page.evaluate((p) => (window as Any).__hearth.dev.chips(p), pid);
  expect(chips).toContainEqual(expect.objectContaining({ id: `stash_hide@${pid}`, label: 'Hide coin here' }));

  // Hide it through the ring, as a player would. Midday, so they are outdoors (at boot, before 0.12 of the
  // day, everyone with a house is still inside and the ring will not open on them).
  await page.evaluate(() => (window as Any).__hearth.interior.setHour(0.5));
  const opened = await page.evaluate((p) => (window as Any).__hearth.dev.ring(p), pid);
  expect(opened).toBe(true);
  await page.evaluate((p) => {
    const h = (window as Any).__hearth;
    h.scene.commit(p, h.scene.people.byId.get(p).sprite, () => h.scene.people.headOf(p), { id: `stash_hide@${p}`, label: 'Hide coin here', savage: false });
  }, pid);

  const stash = await page.evaluate((siteId) => {
    const h = (window as Any).__hearth;
    const st = h.session.getState();
    const chest = h.scene.children.list.find((o: Any) => o.getData?.('stashSite') === siteId);
    const tally = h.scene.children.list.find((o: Any) => o.getData?.('stashTally') === siteId);
    return { coin: st.hoard.stash[siteId]?.coin ?? 0, chest: !!chest, tally: tally?.text ?? '' };
  }, where.siteId!);
  expect(stash.coin).toBe(25);
  expect(stash.chest).toBe(true);
  expect(stash.tally).toContain('25c');

  // Guard it, then let dawns pass until the hoard ending is offered.
  const hasGuard = await page.evaluate((p) => (window as Any).__hearth.dev.chips(p).some((c: Any) => c.id === `stash_guard_hire@${p}`), pid);
  if (hasGuard) await page.evaluate((p) => (window as Any).__hearth.session.act(`stash_guard_hire@${p}`), pid);
  await page.evaluate(() => {
    const h = (window as Any).__hearth;
    for (let i = 0; i < 4; i++) {
      h.session.getState().player.spark = 100;
      h.dev.dawn();
    }
  });

  const overlay = page.locator('#hoard-ending-screen');
  await expect(overlay).toBeVisible({ timeout: 5_000 });
  await expect(overlay).toContainText('The hoard');
  await expect(overlay).toContainText('It bought you quiet');
  await expect(overlay).toContainText('Meanwhile:');
  await expect(overlay.locator('button[data-choice=continue]')).toHaveText('Carry on');
  await expect(overlay.locator('button[data-choice=quit]')).toHaveText('Let it rest');
  await page.screenshot({ path: 'test-results/hoarder-ending.png' });

  await overlay.locator('button[data-choice=quit]').click();
  await expect(overlay).toContainText('The hoard keeps.');
  const ended = await page.evaluate(() => {
    const st = (window as Any).__hearth.session.getState();
    return { ended: st.ended, ending: st.flags.ending };
  });
  expect(ended).toEqual({ ended: 'rest', ending: 'ash_hoard' });
  await overlay.locator('button[data-choice=close]').click();
  await expect(overlay).toBeHidden();

  expect(errors).toEqual([]);
});
