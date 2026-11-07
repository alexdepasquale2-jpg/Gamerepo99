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
    standBesideResident: () => boolean;
    ringChips: () => string | null;
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

test('the world keeps running indoors and the satchel, map, letters and ring work', async ({ page }) => {
  const errors = await boot(page);
  const house = await hook(page, (h) => h.interior.buildings().find((x) => x.kind === 'house')!);
  const H = (fn: string) => page.evaluate(fn);
  await page.evaluate(() => (window as unknown as { __hearth: Hook }).__hearth.interior.setHour(0.9));
  await page.evaluate((id) => (window as unknown as { __hearth: Hook }).__hearth.interior.enter(id), house.id);
  await page.waitForTimeout(600);
  const clock = () => page.evaluate(() => (window as unknown as { __hearth: { scene: { life: { phase: () => number } } } }).__hearth.scene.life.phase());
  const c0 = await clock();
  await page.waitForTimeout(1500);
  expect(await clock()).toBeGreaterThan(c0); // day clock advances while inside
  // E beside the resident opens the same action ring (deeds + a Chat chip); Esc closes it, staying in the room.
  expect(await page.evaluate(() => (window as unknown as { __hearth: Hook }).__hearth.interior.standBesideResident())).toBe(true);
  await page.waitForTimeout(400);
  await page.keyboard.press('e');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as unknown as { __hearth: Hook }).__hearth.interior.ringChips())).not.toBeNull();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as unknown as { __hearth: Hook }).__hearth.interior.ringChips())).toBeNull();
  expect(await page.evaluate(() => (window as unknown as { __hearth: Hook }).__hearth.interior.state())).not.toBeNull();
  // Satchel opens and closes with I; Esc closes it first and does NOT leave the room.
  await page.keyboard.press('i');
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => (window as unknown as { __hearth: { scene: { goods: { overlayOpen: () => boolean } } } }).__hearth.scene.goods.overlayOpen())).toBe(true);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as unknown as { __hearth: Hook }).__hearth.interior.state())).not.toBeNull();
  // Map likewise.
  await page.keyboard.press('m');
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => (window as unknown as { __hearth: { scene: { goods: { overlayOpen: () => boolean } } } }).__hearth.scene.goods.overlayOpen())).toBe(true);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  // Letters dialog opens indoors.
  await page.keyboard.press('l');
  await expect(page.locator('dialog[open]')).toBeVisible();
  await page.locator('dialog button', { hasText: 'Close' }).click();
  await H('0');
  expect(await page.evaluate(() => (window as unknown as { __hearth: Hook }).__hearth.interior.state())).not.toBeNull();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(900);
  expect(await page.evaluate(() => (window as unknown as { __hearth: Hook }).__hearth.interior.state())).toBeNull();
  expect(errors).toEqual([]);
});

test('a resident leaves the room when the day moves on, while you are inside', async ({ page }) => {
  const errors = await boot(page);
  const shop = await hook(page, (h) => h.interior.buildings().find((x) => x.kind === 'house')!);
  await page.evaluate(() => (window as unknown as { __hearth: Hook }).__hearth.interior.setHour(0.9));
  await page.evaluate((id) => (window as unknown as { __hearth: Hook }).__hearth.interior.enter(id), shop.id);
  await page.waitForTimeout(600);
  expect((await page.evaluate(() => (window as unknown as { __hearth: Hook }).__hearth.interior.state()))?.occupantId).not.toBeNull();
  // Morning comes: the schedule sends house residents out to work; the room notices.
  await page.evaluate(() => (window as unknown as { __hearth: { scene: { life: { setPhase: (n: number) => void } } } }).__hearth.scene.life.setPhase(0.2));
  await page.waitForTimeout(2500);
  expect((await page.evaluate(() => (window as unknown as { __hearth: Hook }).__hearth.interior.state()))?.occupantId).toBeNull();
  expect(errors).toEqual([]);
});

test('G lights the lantern in a room', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  const errors = await boot(page);
  const placed = await page.evaluate(() => (window as unknown as { __hearth: Hook }).__hearth.interior.enter('house'));
  expect(placed).toBeTruthy();
  await page.waitForTimeout(700);
  await page.locator('#game canvas').screenshot({ path: path.join(OUT, 'lantern-unlit.png') });
  await page.keyboard.press('g');
  await page.waitForTimeout(300);
  await page.locator('#game canvas').screenshot({ path: path.join(OUT, 'lantern-lit.png') });
  expect(errors).toEqual([]);
});
