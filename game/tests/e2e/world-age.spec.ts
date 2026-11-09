// New game in an older world: pick an age (a custom number of dawns), watch it bake, pick a storyteller,
// and land in a realm with a past: on the map, on the board, and in the save.
import { dev, expect, hearth, test, waitForWorld } from './support';

test('a custom age is baked for every district, and the chosen storyteller tells the tale', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-id=new]').click();
  await page.locator('#hf-inhabitant-menu .hf-item').first().click();
  await page.locator('[data-id=world-known]').click();

  // How old is the world? Out of range is refused; 5,000 dawns bakes.
  await expect(page.locator('#hf-age-menu')).toBeVisible();
  await page.locator('[data-id=age-enter]').click();
  await page.locator('[data-id=age-input]').fill('100001');
  await page.locator('[data-id=age-go]').click();
  await expect(page.locator('#hf-age-menu .hf-note')).toContainText('0 to 100,000');
  await page.locator('[data-id=age-input]').fill('5000');
  await page.locator('[data-id=age-go]').click();
  await expect(page.locator('#hf-age-told-menu')).toBeVisible();
  await expect(page.locator('#hf-age-told-menu .hf-note')).toContainText('5,000 dawns of history');
  await page.locator('[data-id=age-begin]').click();

  await expect(page.locator('#hf-teller-menu')).toBeVisible();
  await page.locator('[data-id=teller-gale]').click();
  await expect.poll(() => page.evaluate(() => !!(window as any).__hearth?.dev?.things), { timeout: 30_000 }).toBe(true);
  await waitForWorld(page);

  const st = await hearth(page, (h) => {
    const s = h.session.getState();
    return { bake: s.realm?.bake?.dawns, teller: s.storyteller?.teller, relations: Object.keys(s.realm?.polity?.relations ?? {}).length, beats: (s.history ?? []).filter((x: any) => x.tags?.includes('bake')).length, day: s.day };
  });
  expect(st).toMatchObject({ bake: 5000, teller: 'gale', relations: 180, day: 1 });
  expect(st.beats).toBeGreaterThan(0);

  // The map's realm view names the ages and tells the picked district's past.
  await page.locator('[data-id=minimap]').click();
  await page.locator('[data-id=map-view-realm]').click();
  await expect(page.locator('[data-id=realm-ages]')).toContainText('years old');
  await expect(page.locator('[data-id=realm-past]')).toContainText('seat-holders');
  await page.locator('[data-id=map-close]').click();

  // A dawn passes under the Gale without error, and the save carries both choices.
  await hearth(page, (h) => h.session.tick());
  expect((await dev<{ day: number }>(page, 'where')).day).toBe(2);
  const saved = await hearth(page, (h) => { const b = h.session.saveBlob(); return { bake: b.sim.realm.bake.dawns, teller: b.sim.storyteller.teller }; });
  expect(saved).toEqual({ bake: 5000, teller: 'gale' });
});
