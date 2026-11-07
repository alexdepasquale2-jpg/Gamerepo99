/**
 * Enterable interiors: walk up to a door (E), see the room, leave (E at the mat / Esc).
 * Uses window.__hearth.interior (QA hook) to reach each building kind for screenshots.
 */
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join('tests', 'e2e', 'artifacts', 'interiors');
type Hook = {
  interior: {
    buildings: () => { id: string; townId: string; kind: string; door: { x: number; y: number } }[];
    enter: (spec?: unknown) => { id: string; kind: string } | null;
    exit: () => void;
    state: () => { active: boolean; kind: string; occupantId: string | null; player: { col: number; row: number } } | null;
    residents: (buildingId: string) => string[];
    setHour: (p01: number) => void;
    whereabouts: () => { id: string; inside: string | null; visible: boolean }[];
  };
  scene: { player: { x: number; y: number } };
};

const hook = <T,>(page: Page, fn: (h: Hook) => T): Promise<T> =>
  page.evaluate((src) => (new Function('h', `return (${src})(h)`))((window as unknown as { __hearth: Hook }).__hearth), fn.toString());

async function boot(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/');
  await page.locator('[data-id=new]').click();
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => !!(window as unknown as { __hearth?: unknown }).__hearth, undefined, { timeout: 20_000 });
  return errors;
}

test('enter and leave houses, shop and inn', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  const errors = await boot(page);
  const kinds = await hook(page, (h) => [...new Set(h.interior.buildings().map((b) => b.kind))]);
  expect(kinds).toContain('house');
  for (const kind of ['house', 'shop', 'inn']) {
    const placed = await page.evaluate((k) => (window as unknown as { __hearth: Hook }).__hearth.interior.enter(k), kind);
    if (!placed) continue; // this seed may not have that kind
    await page.waitForTimeout(700);
    const st = await page.evaluate(() => (window as unknown as { __hearth: Hook }).__hearth.interior.state());
    expect(st?.active).toBe(true);
    expect(st?.kind).toBe(kind);
    await page.locator('#game canvas').screenshot({ path: path.join(OUT, `${kind}.png`) });
    // Esc leaves back to the overworld.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(900);
    expect(await page.evaluate(() => (window as unknown as { __hearth: Hook }).__hearth.interior.state())).toBeNull();
    expect(await page.evaluate(() => (window as unknown as { __hearth: Hook }).__hearth.scene.scene.isActive())).toBe(true);
    expect(await page.locator('.hf-menu').count()).toBe(0);
  }
  expect(errors).toEqual([]);
});

test('E at a door enters; E at the exit mat leaves', async ({ page }) => {
  const errors = await boot(page);
  const b = await hook(page, (h) => h.interior.buildings().find((x) => x.kind === 'house')!);
  await page.evaluate((door) => {
    const p = (window as unknown as { __hearth: Hook }).__hearth.scene.player;
    p.x = door.x; p.y = door.y + 14;
  }, b.door);
  await page.waitForTimeout(300);
  await page.keyboard.press('e');
  await page.waitForTimeout(900);
  const inside = await page.evaluate(() => (window as unknown as { __hearth: Hook }).__hearth.interior.state());
  expect(inside?.active).toBe(true);
  // The player spawns by the door: E leaves.
  await page.keyboard.press('e');
  await page.waitForTimeout(900);
  expect(await page.evaluate(() => (window as unknown as { __hearth: Hook }).__hearth.interior.state())).toBeNull();
  // The overworld is awake again (not stuck asleep) and no pause menu popped up.
  expect(await page.evaluate(() => (window as unknown as { __hearth: Hook }).__hearth.scene.scene.isActive())).toBe(true);
  expect(await page.locator('.hf-menu').count()).toBe(0);
  const pos = await page.evaluate(() => { const p = (window as unknown as { __hearth: Hook }).__hearth.scene.player; return { x: p.x, y: p.y }; });
  expect(Math.hypot(pos.x - b.door.x, pos.y - b.door.y)).toBeLessThan(40);
  expect(errors).toEqual([]);
});

test('residents follow the day: indoors means not outdoors, and rooms show who is home', async ({ page }) => {
  const errors = await boot(page);
  const house = await hook(page, (h) => h.interior.buildings().find((x) => x.kind === 'house')!);
  // Night: the resident is home, hidden outdoors, and present in the room.
  await page.evaluate(() => (window as unknown as { __hearth: Hook }).__hearth.interior.setHour(0.9));
  let who = await page.evaluate((id) => (window as unknown as { __hearth: Hook }).__hearth.interior.residents(id), house.id);
  expect(who.length).toBe(1);
  const night = await page.evaluate(() => (window as unknown as { __hearth: Hook }).__hearth.interior.whereabouts());
  for (const w of night) expect(w.inside !== null, `${w.id} indoors xor visible`).toBe(!w.visible);
  const placed = await page.evaluate((id) => (window as unknown as { __hearth: Hook }).__hearth.interior.enter(id), house.id);
  expect(placed).not.toBeNull();
  await page.waitForTimeout(700);
  expect((await page.evaluate(() => (window as unknown as { __hearth: Hook }).__hearth.interior.state()))?.occupantId).toBe(who[0]);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(900);
  // Midday: house residents are out working, visible outdoors, and the room is empty.
  await page.evaluate(() => (window as unknown as { __hearth: Hook }).__hearth.interior.setHour(0.3));
  who = await page.evaluate((id) => (window as unknown as { __hearth: Hook }).__hearth.interior.residents(id), house.id);
  expect(who).toEqual([]);
  const day = await page.evaluate(() => (window as unknown as { __hearth: Hook }).__hearth.interior.whereabouts());
  for (const w of day) expect(w.inside !== null, `${w.id} indoors xor visible`).toBe(!w.visible);
  await page.evaluate((id) => (window as unknown as { __hearth: Hook }).__hearth.interior.enter(id), house.id);
  await page.waitForTimeout(700);
  expect((await page.evaluate(() => (window as unknown as { __hearth: Hook }).__hearth.interior.state()))?.occupantId).toBeNull();
  expect(errors).toEqual([]);
});
