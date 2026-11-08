/** Power on the noticeboard: the compact, land quarrels and neighbours read in real play; news told at dawn. */
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';

const OUT = 'test-results/power-board';

type Hearth = {
  session: { getState(): { player: { townId?: string } } };
  scene: { children: { list: unknown[] } };
  dev: { dawn(): void; rest(): Promise<string[]>; board(townId: string, page?: number | string): void };
};
declare global {
  interface Window {
    __hearth?: Hearth;
  }
}

async function boot(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('[data-id=new]').click();
  await page.locator('[data-id=arch-marrow]').click();
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => !!window.__hearth, null, { timeout: 20_000 });
}

/** Every visible Text in the overworld scene, containers included. */
async function sceneText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const out: string[] = [];
    const walk = (list: unknown[]): void => {
      for (const o of list as { type?: string; text?: string; visible?: boolean; list?: unknown[] }[]) {
        if (o.visible === false) continue;
        if (o.type === 'Text' && o.text) out.push(o.text);
        if (Array.isArray(o.list)) walk(o.list);
      }
    };
    walk(window.__hearth!.scene.children.list);
    return out.join('\n');
  });
}

test('the Power page reads the compact, land and neighbours; dawn tells the news through a person', async ({ page }) => {
  test.setTimeout(300_000);
  fs.mkdirSync(OUT, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await boot(page);

  // First rest: the town starts listening. Then days pass; the next rest carries the news.
  await page.evaluate(() => window.__hearth!.dev.rest());
  await page.evaluate(() => { for (let i = 0; i < 12; i++) window.__hearth!.dev.dawn(); });
  const lines = await page.evaluate(() => window.__hearth!.dev.rest());
  expect(lines.some((l) => / says .*(plot|turned to the|trade pact|marched|fallen|workshops)/.test(l))).toBe(true);
  // The first news line is spoken over the scene after "Dawn. Day N."
  await page.waitForFunction(() => / says /.test((window.__hearth!.dev as unknown as { lastSay(): string }).lastSay()), null, { timeout: 90_000 });

  const home = await page.evaluate(() => window.__hearth!.session.getState().player.townId!);
  await page.evaluate((t) => window.__hearth!.dev.board(t, 'power'), home);
  let text = await sceneText(page);
  expect(text).toContain('Noticeboard · Power');
  expect(text).toContain('Who holds sway');
  expect(text).toContain('Word from the road');
  expect(text).toContain('Land in dispute');
  expect(text).toContain('Neighbours');
  expect(text).toMatch(/Faith: /);
  expect(text).toMatch(/Crafts: /);
  await page.screenshot({ path: `${OUT}/power-home.png` });

  await page.evaluate(() => window.__hearth!.dev.board('city_reach', 'power'));
  text = await sceneText(page);
  expect(text).toMatch(/The Reach.* · Noticeboard · Power/);
  expect(text).toMatch(/People say|Nobody believes|Nobody says|A few still say/);
  expect(text).toMatch(/the neighbours judged|turned away|contests|No one is quarrelling/);
  await page.screenshot({ path: `${OUT}/power-reach.png` });

  expect(errors).toEqual([]);
});
