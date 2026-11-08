// A phone plays the whole game: the on-screen pad shows, a tap on the ground walks, A opens a ring, B backs out.
import { devices } from '@playwright/test';
import { bootToPlay, dev, expect, hearth, settle, test } from './support';

const { defaultBrowserType: _browser, ...pixel } = devices['Pixel 7'];
test.use(pixel);

test('phone viewport: pad, tap to walk, A and B', async ({ page }) => {
  await bootToPlay(page);
  const bar = page.locator('#hf-pad');
  await expect(bar).toBeVisible();
  for (const b of ['a', 'b', 'x', 'y', 'start', 'select']) await expect(bar.locator(`[data-btn=${b}]`)).toBeInViewport();

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
  const act = bar.locator('[data-btn=a]');
  await expect(act).toBeVisible();
  await act.tap();
  await expect(page.locator('.ix-ring')).toBeVisible();
  expect(await hearth(page, (h) => h.dev.ring()?.chips?.length ?? 0)).toBeGreaterThan(0);
  await bar.locator('[data-btn=b]').tap();
  await expect(page.locator('.ix-ring')).toBeHidden();
});
