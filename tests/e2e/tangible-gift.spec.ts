import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join('tests', 'e2e', 'artifacts', 'tangible');

type Scene = {
  player: { x: number; y: number; setPosition: (x: number, y: number) => void };
  people: { people: { id: string; sprite: { x: number; y: number } }[] };
  goods: { beforeDeed: (m: string, id: string) => { ok: boolean } };
  children: { getByName: (n: string) => { x: number } | null };
  session: { getState: () => { inventory?: Record<string, number> } };
};

test('gift handoff shows the item between player and villager', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.goto('/');
  await page.locator('[data-id=new]').click();
  await page.locator('[data-id=arch-marrow]').click(); // pick who you are
  await page.locator('[data-id=world-known]').click(); // the world you know (seed 42)
  await page.waitForFunction(() => !!(window as unknown as { __hearth?: unknown }).__hearth, undefined, { timeout: 20_000 });
  const res = await page.evaluate(() => {
    const s = (window as unknown as { __hearth: { scene: Scene } }).__hearth.scene;
    const p = s.people.people[0]!;
    s.player.setPosition(p.sprite.x - 90, p.sprite.y);
    const st = s.session.getState();
    st.inventory = { ...(st.inventory ?? {}), bread: (st.inventory?.bread ?? 0) + 1 };
    return { ok: s.goods.beforeDeed('gift_give', p.id).ok, px: s.player.x, vx: p.sprite.x };
  });
  expect(res.ok).toBe(true);
  await page.waitForTimeout(300);
  const mid = await page.evaluate(() =>
    (window as unknown as { __hearth: { scene: Scene } }).__hearth.scene.children.getByName('handoff')?.x ?? null);
  await page.screenshot({ path: path.join(OUT, 'gift-midflight.png') });
  expect(mid).not.toBeNull();
  expect(mid!).toBeGreaterThan(res.px);
  expect(mid!).toBeLessThan(res.vx);
});
