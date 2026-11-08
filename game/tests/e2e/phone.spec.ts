// A phone plays the whole game: the touch bar shows, a tap on the ground walks, the Act button opens a ring.
import { devices } from '@playwright/test';
import { bootToPlay, dev, expect, hearth, settle, test } from './support';

const { defaultBrowserType: _browser, ...pixel } = devices['Pixel 7'];
test.use(pixel);

test('phone viewport: touch bar, tap to walk, act button', async ({ page }) => {
  await bootToPlay(page);
  const bar = page.locator('#hf-touch');
  // The bar itself is a zero-height dock (its groups are positioned), so check it is shown and its buttons are.
  await expect(bar).not.toHaveAttribute('hidden');
  for (const id of ['satchel', 'map', 'letters', 'menu']) await expect(bar.locator(`[data-id=${id}]`)).toBeInViewport();

  // Tap the ground a little way off the player (the camera centres on them): they walk there.
  const start = await dev<{ q: number; r: number }>(page, 'where');
  const canvas = page.locator('#game canvas');
  const box = (await canvas.boundingBox())!;
  const walked = async (fx: number, fy: number): Promise<boolean> => {
    await canvas.tap({ position: { x: box.width * fx, y: box.height * fy } });
    await settle(page, 1500);
    const now = await dev<{ q: number; r: number }>(page, 'where');
    return now.q !== start.q || now.r !== start.r;
  };
  let moved = false;
  for (const [fx, fy] of [[0.7, 0.5], [0.3, 0.5], [0.5, 0.3], [0.5, 0.7]]) if ((moved = await walked(fx, fy))) break;
  expect(moved, 'a tap on the ground moved the player').toBe(true);

  // Stand by someone: the Act button names them, and a tap on it opens their ring.
  const people = await dev<{ id: string; inside: string | null }[]>(page, 'people');
  const who = people.find((p) => !p.inside) ?? people[0];
  await dev(page, 'teleportTo', who.id);
  const act = bar.locator('[data-id=act]');
  await expect(act).toBeVisible();
  await act.tap();
  await expect(page.locator('.ix-ring')).toBeVisible();
  expect(await hearth(page, (h) => h.dev.ring()?.chips?.length ?? 0)).toBeGreaterThan(0);
});
