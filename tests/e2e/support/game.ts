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
