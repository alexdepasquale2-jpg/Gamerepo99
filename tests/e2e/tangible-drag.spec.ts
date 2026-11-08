import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { pickInhabitant } from './support/game';

const OUT = path.join('tests', 'e2e', 'artifacts', 'tangible');

type Scene = {
  player: { setPosition: (x: number, y: number) => void };
  cameras: { main: { centerOn: (x: number, y: number) => void; scrollX: number; scrollY: number; zoom: number } };
  people: { people: { id: string; sprite: { x: number; y: number } }[] };
  session: { getState: () => { inventory?: Record<string, number>; groundItems?: unknown[] } };
  children: { list: unknown[] };
  scale: { width: number; height: number };
};
type W = { hs: () => Scene };

test('drag bread from hotbar to a villager and to the ground', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.addInitScript(() => { (window as unknown as { hs: () => unknown }).hs = () => (window as unknown as { __hearth: { scene: unknown } }).__hearth.scene; });
  await page.goto('/');
  await pickInhabitant(page);
  const setup = await page.evaluate(() => {
    const s = (window as unknown as W).hs();
    const p = s.people.people[0]!;
    s.player.setPosition(p.sprite.x - 60, p.sprite.y);
    s.cameras.main.centerOn(p.sprite.x, p.sprite.y);
    const st = s.session.getState();
    st.inventory = { ...(st.inventory ?? {}), bread: 3 };
    return { id: p.id };
  });
  await page.waitForTimeout(500);
  const pos = await page.evaluate((id) => {
    const s = (window as unknown as W).hs(), cam = s.cameras.main;
    const p = s.people.people.find((q) => q.id === id)!;
    const canvas = document.querySelector('canvas')!.getBoundingClientRect();
    const k = canvas.width / s.scale.width;
    return {
      sx: canvas.left + (p.sprite.x - cam.scrollX) * cam.zoom * k,
      sy: canvas.top + (p.sprite.y - 14 - cam.scrollY) * cam.zoom * k,
      l: canvas.left, t: canvas.top, w: canvas.width, h: canvas.height, k,
    };
  }, setup.id);
  const hotX = (i: number) => pos.l + pos.w / 2 + (-120 + (i + 0.5) * 30) * pos.k;
  const hotY = pos.t + pos.h - 21 * pos.k;
  // Hover each slot until the tooltip reads Bread.
  let idx = -1;
  for (let i = 0; i < 8 && idx < 0; i++) {
    await page.mouse.move(hotX(i), hotY);
    await page.waitForTimeout(100);
    const txt = await page.evaluate(() => (window as unknown as W).hs().children.list.map((c) => (c as { text?: string }).text ?? '').find((t) => /^Bread x\d+$/.test(t)));
    if (txt) idx = i;
  }
  expect(idx).toBeGreaterThanOrEqual(0);
  await page.screenshot({ path: path.join(OUT, 'drag-tooltip.png') });
  const before = await page.evaluate(() => (window as unknown as W).hs().session.getState().inventory!.bread!);

  // Drop on the villager = gift.
  await page.mouse.down();
  await page.mouse.move(pos.sx - 30, pos.sy + 10, { steps: 6 });
  await page.mouse.move(pos.sx, pos.sy, { steps: 6 });
  await page.screenshot({ path: path.join(OUT, 'drag-over-villager.png') });
  await page.mouse.up();
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => (window as unknown as W).hs().session.getState().inventory!.bread!)).toBe(before - 1);
  await page.screenshot({ path: path.join(OUT, 'drag-gifted.png') });

  // Drop on empty ground = world object.
  await page.mouse.move(hotX(idx), hotY);
  await page.mouse.down();
  await page.mouse.move(pos.l + 120, pos.t + 120, { steps: 6 });
  await page.mouse.up();
  expect(await page.evaluate(() => (window as unknown as W).hs().session.getState().groundItems?.length)).toBe(1);
  expect(await page.evaluate(() => (window as unknown as W).hs().session.getState().inventory!.bread!)).toBe(before - 2);
  await page.screenshot({ path: path.join(OUT, 'drag-ground.png') });

  // Esc cancels.
  await page.mouse.move(hotX(idx), hotY);
  await page.mouse.down();
  await page.mouse.move(pos.l + 200, pos.t + 200, { steps: 4 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(await page.evaluate(() => (window as unknown as W).hs().session.getState().inventory!.bread!)).toBe(before - 2);
});
