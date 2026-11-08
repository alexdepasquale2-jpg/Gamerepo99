/** Facilities on the roads: walk to one, work a shift with E, see it on the map. */
import { test, expect, type Page } from '@playwright/test';

type Fac = { id: string; name: string; type: string; state: string; q: number; r: number };
type H = {
  session: { getState(): { inventory?: Record<string, number>; towns?: Record<string, { stock: Record<string, number> }>; flags: Record<string, unknown>; day: number } };
  dev: { facilities(): Fac[]; teleport(q: number, r: number): void; lastSay(): string };
};
const hearth = (page: Page) => page.evaluate(() => !!(window as unknown as { __hearth?: H }).__hearth);

async function boot(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('[data-id=new]').click();
  await page.locator('[data-id=arch-marrow]').click();
  await page.locator('[data-id=world-known]').click(); // the world you know (seed 42)
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => hearth(page), { timeout: 20_000 }).toBe(true);
}

test('work a shift at a mill on the road, then find it on the map', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await boot(page);

  const facs = await page.evaluate(() => (window as unknown as { __hearth: H }).__hearth.dev.facilities());
  expect(facs.length).toBeGreaterThanOrEqual(3);
  const mill = facs.find((f) => f.type === 'mill') ?? facs[0]!;

  await page.evaluate(({ q, r }) => (window as unknown as { __hearth: H }).__hearth.dev.teleport(q, r + 1), mill);
  await page.waitForTimeout(5000);
  await page.screenshot({ path: test.info().outputPath('facility-overworld.png') });

  const before = await page.evaluate(() => {
    const s = (window as unknown as { __hearth: H }).__hearth.session.getState();
    return { inv: { ...(s.inventory ?? {}) }, stock: JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(s.towns ?? {}).map(([k, t]) => [k, t.stock])))) as Record<string, Record<string, number>> };
  });
  await page.keyboard.press('e');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __hearth: H }).__hearth.dev.lastSay()), { timeout: 5_000 }).toContain(`You work a shift at ${mill.name}`);
  await page.screenshot({ path: test.info().outputPath('facility-shift.png') });

  const after = await page.evaluate(() => {
    const s = (window as unknown as { __hearth: H }).__hearth.session.getState();
    return { inv: { ...(s.inventory ?? {}) }, stock: Object.fromEntries(Object.entries(s.towns ?? {}).map(([k, t]) => [k, t.stock])) as Record<string, Record<string, number>>, worked: s.flags.facilityShiftDay === s.day };
  });
  expect(after.worked).toBe(true);
  const gained = Object.entries(after.inv).some(([k, n]) => k !== 'coin' && n > (before.inv[k] ?? 0)) || (after.inv.coin ?? 0) > (before.inv.coin ?? 0);
  expect(gained).toBe(true);
  const stockUp = Object.entries(after.stock).some(([t, st]) => Object.entries(st).some(([r, n]) => n > (before.stock[t]?.[r] ?? 0)));
  if (mill.type !== 'waystation') expect(stockUp).toBe(true);

  // A second shift the same day is refused.
  await page.keyboard.press('e');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __hearth: H }).__hearth.dev.lastSay())).toContain('already done a day');

  await page.keyboard.press('m');
  await page.waitForTimeout(600);
  await page.screenshot({ path: test.info().outputPath('facility-map.png') });
  const onMap = await page.evaluate((name) => {
    const scene = (window as unknown as { __hearth: { scene: { children: { list: { name?: string; text?: string; list?: { name?: string; text?: string }[] }[] } } } }).__hearth.scene;
    const texts: string[] = [];
    for (const o of scene.children.list) for (const c of o.list ?? []) if (c.name === 'map-facility' && c.text) texts.push(c.text);
    return texts.some((t) => t.startsWith(name));
  }, mill.name);
  expect(onMap).toBe(true);
  expect(errors).toEqual([]);
});
