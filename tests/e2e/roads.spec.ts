import { test, expect, type Page } from '@playwright/test';

type Hearth = {
  session: { snapshot(): { day: number; townId: string }; roads(): Array<{ routeId: string; toId: string; offers: Array<{ tradeId: string }> }> };
  scene: { player: { x: number; y: number } };
  dev: {
    teleport(q: number, r: number): void;
    towns(): Array<{ id: string; q: number; r: number }>;
    signpost(townId: string): { q: number; r: number } | null;
    lastSay(): string;
  };
};
const h = <T>(page: Page, fn: (h: Hearth) => T): Promise<T> =>
  page.evaluate(`(${fn.toString()})(window.__hearth)`) as Promise<T>;

test('signpost opens the road menu; hiring a traveller runs the days and lands you at the far town', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await page.locator('[data-id=new]').click();
  await page.locator('[data-id=arch-marrow]').click();
  await page.waitForFunction(() => !!(window as unknown as { __hearth?: unknown }).__hearth);
  await page.waitForTimeout(800);

  const start = await h(page, (x) => x.session.snapshot());
  const post = await h(page, (x) => x.dev.signpost(x.session.snapshot().townId));
  expect(post).not.toBeNull();
  await page.evaluate(([q, r]) => (window as unknown as { __hearth: Hearth }).__hearth.dev.teleport(q, r), [post!.q, post!.r]);
  await page.waitForTimeout(300);
  await page.keyboard.press('e');

  const menu = page.locator('#hf-road-menu');
  await expect(menu).toBeVisible();
  const roads = await h(page, (x) => x.session.roads());
  await expect(menu.locator('[data-id^=walk-]')).toHaveCount(roads.length);
  expect(await menu.locator('[data-id^=hire-]').count()).toBeGreaterThan(0);
  await expect(menu).toContainText('spark');
  await page.screenshot({ path: test.info().outputPath('road-menu.png') });
  await page.screenshot({ path: '/tmp/claude-0/-home-user-Gamerepo99/bc3eef81-621b-52eb-9a56-ad75b6a46112/scratchpad/road-menu.png' });

  const pick = menu.locator('[data-id^=hire-]:not([disabled])').first();
  const pickId = (await pick.getAttribute('data-id'))!;
  const road = roads.find((r) => pickId.startsWith(`hire-${r.routeId}-`))!;
  expect(road).toBeDefined();
  await pick.click();
  await expect(menu).toBeHidden();

  await expect.poll(() => h(page, (x) => x.session.snapshot().townId), { timeout: 40_000 }).toBe(road.toId);
  await expect.poll(() => h(page, (x) => x.dev.lastSay()), { timeout: 40_000 }).toMatch(/^Day \d+\./);
  const end = await h(page, (x) => x.session.snapshot());
  expect(end.day).toBeGreaterThan(start.day);
  await expect(page.locator('#hf-status')).toHaveText(`Day ${end.day}`);

  // The sprite stands at the destination's hearth side.
  const at = await h(page, (x) => {
    const t = x.dev.towns().find((y) => y.id === x.session.snapshot().townId)!;
    return { dq: x.scene.player.x / 32 - t.q, dr: x.scene.player.y / 32 - t.r };
  });
  expect(Math.hypot(at.dq, at.dr)).toBeLessThan(4);

  // Then the journey itself, told as lines.
  await expect.poll(() => h(page, (x) => x.dev.lastSay()), { timeout: 40_000 }).toMatch(/on the road to|on foot to/);
  await page.screenshot({ path: test.info().outputPath('road-arrived.png') });
  await page.screenshot({ path: '/tmp/claude-0/-home-user-Gamerepo99/bc3eef81-621b-52eb-9a56-ad75b6a46112/scratchpad/road-arrived.png' });
  expect(errors).toEqual([]);
});
