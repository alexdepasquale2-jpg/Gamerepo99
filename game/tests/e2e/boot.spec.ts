// Boot and the title flow: a fresh browser (no saves) reaches play by Enter alone.
import { bootToPlay, dev, expect, test } from './support';

test('title flow reaches play on day 1 in the home district', async ({ page }) => {
  await page.goto('/');
  // The title menu comes first, with nothing to continue yet.
  await expect(page.getByText('The Last Spark').first()).toBeVisible();
  await expect(page.locator('[data-id=continue]')).toBeDisabled();
  await bootToPlay(page, { goto: false });

  const where = await dev<{ q: number; r: number; day: number; room: string | null }>(page, 'where');
  expect(where.day).toBe(1);
  expect(where.room).toBeNull();
  expect((await dev<string[]>(page, 'towns')).length).toBeGreaterThan(1);
  // Things to use stand around the spawn: the home town's hearth at least.
  const kinds = (await dev<{ kind: string }[]>(page, 'things', 400)).map((t) => t.kind);
  expect(kinds).toContain('hearth');
  // No blocking menu is left over the scene.
  expect(await page.evaluate(() => (window as any).__hearth.dev.ui.blocking())).toBeFalsy();
});
