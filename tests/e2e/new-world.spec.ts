/** A new world each run (tree F16 / F9): New Game -> who you are -> which world. */
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join('tests', 'e2e', 'artifacts', 'new-world');

type Hearth = {
  session: { getSeed(): number; listPeople(): { id: string }[]; snapshot(): { day: number } };
  scene: { people: { people: { id: string }[] } };
  dev: {
    towns(): { id: string }[];
    chips(personId: string): { id: string; label: string }[];
    rest(): Promise<string[]>;
  };
};
const hearth = (page: Page) => page.waitForFunction(() => !!(window as unknown as { __hearth?: unknown }).__hearth, null, { timeout: 20_000 });

async function toWorldMenu(page: Page, errors: string[]): Promise<void> {
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await page.locator('[data-id=new]').click();
  await page.locator('[data-id=arch-marrow]').click(); // pick who you are
  await expect(page.locator('#hf-world-pick-menu')).toBeVisible();
}

test.describe('a new world each run', () => {
  test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));

  test('"A new world" boots its shown world number, with towns and people to act on', async ({ page }) => {
    const errors: string[] = [];
    await toWorldMenu(page, errors);
    const hint = await page.locator('[data-id=world-new] .hf-hint').textContent();
    const shown = Number(/World (\d+)/.exec(hint ?? '')?.[1]);
    expect(shown).toBeGreaterThan(0);
    expect(shown).not.toBe(42);
    await page.screenshot({ path: path.join(OUT, 'world-menu.png') });
    await page.locator('[data-id=world-new]').click();
    await expect(page.locator('#game canvas')).toBeVisible({ timeout: 20_000 });
    await hearth(page);

    const info = await page.evaluate(() => {
      const h = (window as unknown as { __hearth: Hearth }).__hearth;
      const seed = h.session.getSeed();
      const people = h.session.listPeople();
      const onScreen = h.scene.people.people.map((p) => p.id);
      return {
        seed,
        towns: h.dev.towns().length,
        gen: people.filter((p) => p.id.startsWith(`gen_p_${seed}_`)).length,
        stale: people.filter((p) => p.id.startsWith('gen_p_42_')).length,
        withChips: onScreen.filter((id) => h.dev.chips(id).length > 0).length,
        onScreen: onScreen.length,
        day: h.session.snapshot().day,
      };
    });
    expect(info.seed).toBe(shown);
    expect(info.seed).not.toBe(42);
    expect(info.towns).toBeGreaterThan(0);
    expect(info.gen).toBeGreaterThan(0);
    expect(info.stale).toBe(0);
    expect(info.onScreen).toBeGreaterThan(0);
    expect(info.withChips).toBeGreaterThan(0);

    await page.evaluate(() => (window as unknown as { __hearth: Hearth }).__hearth.dev.rest());
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __hearth: Hearth }).__hearth.session.snapshot().day), { timeout: 20_000 })
      .toBeGreaterThan(info.day);
    await expect(page.locator('#hf-status')).toHaveAttribute('data-world', String(shown));
    await page.screenshot({ path: path.join(OUT, 'new-world-after-rest.png') });

    // The pause menu names the world so it can be found again.
    await page.keyboard.press('Escape');
    await expect(page.locator('#hf-pause-menu .hf-note')).toHaveText(`World ${shown}`);
    expect(errors).toEqual([]);
  });

  test('"This world" is still world 42', async ({ page }) => {
    const errors: string[] = [];
    await toWorldMenu(page, errors);
    await page.locator('[data-id=world-known]').click();
    await hearth(page);
    const seed = await page.evaluate(() => (window as unknown as { __hearth: Hearth }).__hearth.session.getSeed());
    expect(seed).toBe(42);
    expect(errors).toEqual([]);
  });

  test('"Enter a world number" boots that world; a bad number is refused', async ({ page }) => {
    const errors: string[] = [];
    await toWorldMenu(page, errors);
    await page.locator('[data-id=world-enter]').click();
    const field = page.locator('[data-id=world-seed-input]');
    await expect(field).toBeFocused();
    await field.fill('not a world');
    await field.press('Enter');
    await expect(page.locator('#hf-world-pick-menu .hf-note')).toContainText('whole number');
    await field.fill('31337');
    await page.locator('[data-id=world-seed-go]').click();
    await hearth(page);
    const seed = await page.evaluate(() => (window as unknown as { __hearth: Hearth }).__hearth.session.getSeed());
    expect(seed).toBe(31337);
    expect(errors).toEqual([]);
  });
});
