/**
 * Player changes the land: stand on a bank, X lays stepping stones into the shallows (a ford you can
 * walk onto), and the chunk redraws at once. Uses window.__hearth.dev for setup only; the act is a key press.
 */
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join('tests', 'e2e', 'artifacts', 'land');
type Tile = { biome: string; edit: string | null; passable: boolean };
type Dev = {
  where: () => { q: number; r: number; biome: string };
  teleport: (q: number, r: number) => void;
  towns: () => { id: string; q: number; r: number }[];
  give: (itemId: string, n: number) => void;
  tile: (q: number, r: number) => Tile;
  lastSay: () => string;
};
type Hook = { dev: Dev; session: { getState: () => { inventory?: Record<string, number> } }; scene: { player: { x: number; y: number } } };

const dev = <T,>(page: Page, fn: (d: Dev, h: Hook) => T, arg?: unknown): Promise<T> =>
  page.evaluate(([src, a]) => {
    const h = (window as unknown as { __hearth: Hook }).__hearth;
    return (new Function('d', 'h', 'a', `return (${src})(d, h, a)`))(h.dev, h, a);
  }, [fn.toString(), arg] as const);

test('lay stepping stones across shallow water with X', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await page.locator('[data-id=new]').click();
  await page.locator('[data-id=arch-marrow]').click();
  await page.locator('[data-id=world-known]').click(); // the world you know (seed 42)
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => !!(window as unknown as { __hearth?: { dev?: unknown } }).__hearth?.dev, undefined, { timeout: 20_000 });

  // A bank: dry walkable tile with impassable water just south of it, outside the town.
  const bank = await dev(page, (d) => {
    const home = d.where();
    for (let rad = 16; rad < 260; rad++) for (let dq = -rad; dq <= rad; dq++) for (const dr of [-rad, rad]) {
      for (const [q, r] of [[home.q + dq, home.r + dr], [home.q + dr, home.r + dq]]) {
        const here = d.tile(q!, r!), below = d.tile(q!, r! + 1);
        if (here.passable && here.biome !== 'water' && !here.edit && below.biome === 'water' && !below.passable) return { q: q!, r: r! };
      }
    }
    return null;
  });
  expect(bank).not.toBeNull();
  const { q, r } = bank!;
  await dev(page, (d, _h, a) => { const b = a as { q: number; r: number }; d.teleport(b.q, b.r); d.give('stone', 5); }, bank);
  await page.waitForTimeout(500);
  expect(await dev(page, (_d, h) => ({ q: Math.floor(h.scene.player.x / 32), r: Math.floor((h.scene.player.y - 2) / 32) }))).toEqual({ q, r });
  // Face south (the water), then stop.
  await page.keyboard.down('s'); await page.waitForTimeout(60); await page.keyboard.up('s');
  await dev(page, (d, _h, a) => { const b = a as { q: number; r: number }; d.teleport(b.q, b.r); }, bank);
  await page.waitForTimeout(300);
  await page.locator('#game canvas').screenshot({ path: path.join(OUT, 'before.png') });
  expect(await dev(page, (d, _h, a) => { const b = a as { q: number; r: number }; return d.tile(b.q, b.r + 1); }, bank)).toMatchObject({ biome: 'water', passable: false, edit: null });

  const stone0 = await dev(page, (_d, h) => h.session.getState().inventory?.stone ?? 0);
  expect(stone0).toBeGreaterThanOrEqual(5);
  await page.keyboard.press('x');
  await page.waitForTimeout(300);

  const after = await dev(page, (d, _h, a) => { const b = a as { q: number; r: number }; return d.tile(b.q, b.r + 1); }, bank);
  expect(after).toMatchObject({ edit: 'ford', passable: true });
  expect(await dev(page, (_d, h) => h.session.getState().inventory?.stone ?? 0)).toBe(stone0 - 3);
  expect(await dev(page, (d) => d.lastSay())).toMatch(/stones into the shallows/);
  await page.locator('#game canvas').screenshot({ path: path.join(OUT, 'after.png') });

  // The new ford can be walked onto.
  const y0 = await dev(page, (_d, h) => h.scene.player.y);
  await page.keyboard.down('s'); await page.waitForTimeout(700); await page.keyboard.up('s');
  expect(await dev(page, (_d, h) => h.scene.player.y)).toBeGreaterThan(y0 + 8);
  expect(errors).toEqual([]);
});
