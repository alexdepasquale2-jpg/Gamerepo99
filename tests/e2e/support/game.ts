/**
 * Shared e2e helpers: start a game the way a player does, collect errors, reach the QA hook, and
 * decide where screenshots go. Every spec should use these instead of repeating the boot steps.
 */
import { expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/** Collect uncaught page errors (and console errors unless `console: false`) for an end-of-test check. */
export function collectErrors(page: Page, opts: { console?: boolean } = {}): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  if (opts.console !== false) page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return errors;
}

/** From the title menu: New game → pick who you are → which world → wait for the overworld and its QA hook. */
export async function pickInhabitant(page: Page, archetypeId = 'marrow', world: 'known' | 'new' = 'known'): Promise<void> {
  await page.locator('[data-id=new]').click();
  await page.locator(`[data-id=arch-${archetypeId}]`).click();
  await page.locator(`[data-id=world-${world}]`).click();
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => !!(window as unknown as { __hearth?: unknown }).__hearth, undefined, { timeout: 20_000 });
}

/** Open the game and start a new run as `archetypeId`. Returns the error list being collected. */
export async function startGame(page: Page, opts: { archetype?: string; console?: boolean } = {}): Promise<string[]> {
  const errors = collectErrors(page, { console: opts.console });
  await page.goto('/');
  await pickInhabitant(page, opts.archetype ?? 'marrow');
  return errors;
}

/** Run `fn(window.__hearth)` in the page. `fn` must be self-contained (it is serialised). */
export function hearth<T, H = any>(page: Page, fn: (h: H) => T): Promise<T> {
  return page.evaluate((src) => new Function('h', `return (${src})(h)`)((window as unknown as { __hearth: unknown }).__hearth), fn.toString()) as Promise<T>;
}

/**
 * Where a spec writes screenshots. Normal runs write under test-results/shots/<name> (ignored by git),
 * so running the suite never dirties the tree. Set E2E_UPDATE_SHOTS=1 (npm run qa:shots) to refresh
 * the committed QA evidence folder instead.
 */
export function shotsDir(name: string, committedDir: string): string {
  const dir = process.env.E2E_UPDATE_SHOTS ? committedDir : path.join('test-results', 'shots', name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

type RingView = { family: string | null; chips: { id: string; label: string; verbs?: string[] }[] };

/**
 * Pick a verb from a person's ring with the number keys, like a player: open the ring beside them
 * (dev.ring), press the family chip's number when the verb sits inside a family, then the verb's.
 * Rings show at most 6 chips and never page.
 */
export async function pickVerb(page: Page, personId: string, actionId: string): Promise<void> {
  const view = (): Promise<RingView | null> =>
    page.evaluate(() => (window as unknown as { __hearth: { dev: { ringView(): RingView | null } } }).__hearth.dev.ringView());
  expect(await page.evaluate((id) => (window as unknown as { __hearth: { dev: { ring(id: string): boolean } } }).__hearth.dev.ring(id), personId)).toBe(true);
  await page.waitForTimeout(150);
  let v = await view();
  expect(v, 'ring open').not.toBeNull();
  expect(v!.chips.length).toBeLessThanOrEqual(6);
  let i = v!.chips.findIndex((c) => c.id === actionId);
  if (i < 0) {
    const fam = v!.chips.findIndex((c) => c.verbs?.includes(actionId));
    expect(fam, `${actionId} in the ring of ${personId}`).toBeGreaterThanOrEqual(0);
    await page.keyboard.press(`Digit${fam + 1}`);
    await page.waitForTimeout(120);
    v = await view();
    i = v!.chips.findIndex((c) => c.id === actionId);
  }
  expect(i, `${actionId} on offer`).toBeGreaterThanOrEqual(0);
  await page.keyboard.press(`Digit${i + 1}`);
}
