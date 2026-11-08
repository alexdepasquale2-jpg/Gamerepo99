// The map's realm tab: the district grid renders and tapping a district reads it out.
import { bootToPlay, expect, test } from './support';

test('realm tab renders and a district can be picked', async ({ page }) => {
  await bootToPlay(page);
  await page.locator('[data-id=minimap]').click();
  await expect(page.locator('[data-id=world-map]')).toBeVisible();

  await page.locator('[data-id=map-view-realm]').click();
  const realm = page.locator('[data-id=realm-map]');
  await expect(realm).toBeVisible();
  const info = page.locator('[data-id=realm-info]');
  await expect(info).not.toBeEmpty();
  // The canvas has really been drawn on (not a blank sheet).
  const inked = await realm.evaluate((c: HTMLCanvasElement) => {
    const g = c.getContext('2d')!;
    const px = g.getImageData(0, 0, c.width, c.height).data;
    let lit = 0;
    for (let i = 3; i < px.length; i += 4 * 97) if (px[i] > 0) lit++;
    return lit;
  });
  expect(inked).toBeGreaterThan(10);

  // Opening on the home district; a tap near a corner picks another one.
  const homeLine = await info.textContent();
  const box = (await realm.boundingBox())!;
  const spots = [[0.12, 0.12], [0.88, 0.88], [0.12, 0.88], [0.88, 0.12], [0.3, 0.5]];
  let picked = homeLine;
  for (const [fx, fy] of spots) {
    await realm.click({ position: { x: box.width * fx, y: box.height * fy } });
    picked = await info.textContent();
    if (picked && picked !== homeLine && !/^Tap a district/.test(picked)) break;
  }
  expect(picked).not.toBe(homeLine);
  expect(picked).not.toMatch(/^Tap a district/);

  await page.locator('[data-id=map-close]').click();
  await expect(realm).toBeHidden();
});
