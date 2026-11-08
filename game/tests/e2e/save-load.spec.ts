// Saving inside a foreign district: a blob round-trip restores the day and satchel, and the autosave the
// crossing wrote brings a reloaded page (title → Continue) back into that district, not home.
import { bootToPlay, crossTrunkRoad, district, expect, hearth, test, towns } from './support';

test('save and load inside a district', async ({ page }) => {
  await bootToPlay(page);
  const trunks = await hearth(page, (h) => h.session.trunkRoads() as { to: { col: number; row: number }; days: number }[]);
  const out = [...trunks].sort((a, b) => a.days - b.days)[0];
  await crossTrunkRoad(page, out.to);
  const awayTowns = await towns(page);

  // Save, change the world (a night passes, the satchel shifts), load: back to the saved moment.
  const saved = await hearth(page, (h) => {
    const blob = JSON.parse(JSON.stringify(h.session.saveBlob())); // as a slot stores it
    (window as any).__u9blob = blob;
    const st = h.session.getState();
    return { day: st.day as number, inv: JSON.stringify(st.inventory), district: h.session.district() };
  });
  await hearth(page, (h) => {
    h.session.tick();
    h.session.getState().inventory.stone = 99;
  });
  expect(await hearth(page, (h) => h.session.getState().day)).toBe(saved.day + 1);
  const loaded = await hearth(page, (h) => {
    h.session.loadBlob((window as any).__u9blob);
    const st = h.session.getState();
    return { day: st.day as number, inv: JSON.stringify(st.inventory), district: h.session.district() };
  });
  expect(loaded).toEqual(saved);

  // The crossing autosaved; a fresh page continues from it, in the far district.
  await page.reload();
  await expect(page.locator('[data-id=continue]')).toBeEnabled();
  await bootToPlay(page, { goto: false }); // Enter picks Continue now
  expect(await district(page)).toEqual(out.to);
  expect(await towns(page)).toEqual(awayTowns);
});
