/**
 * Shared helpers for the v2 game's e2e specs. The built game exposes QA hooks on `window.__hearth`
 * (`dev` = every registerDevHook in game/src, `session` = the PlaySession); specs drive the game through
 * those plus the real DOM (ring chips, sheets, touch bar) so a broken button still fails a spec.
 */
import { expect, test as base, type Page } from '@playwright/test';

/** Every spec fails on an uncaught page error: the `pageErrors` fixture is automatic. */
export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(`${e.name}: ${e.message}`));
      await use(errors);
      expect(errors, 'uncaught page errors').toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

/** Call `window.__hearth.dev[name](...args)` in the page (awaits a returned promise). */
export function dev<T = any>(page: Page, name: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(
    ([n, a]) => {
      const d = (window as any).__hearth?.dev;
      if (!d || typeof d[n as string] !== 'function') throw new Error(`no dev hook ${n}`);
      return d[n as string](...(a as unknown[]));
    },
    [name, args] as const,
  ) as Promise<T>;
}

/** Run `fn(window.__hearth)` in the page; `fn` is serialised, so it must be self-contained. */
export function hearth<T, A = undefined>(page: Page, fn: (h: any, arg: A) => T, arg?: A): Promise<Awaited<T>> {
  return page.evaluate(
    ([src, a]) => new Function('h', 'a', `return (${src})(h, a)`)((window as any).__hearth, a),
    [fn.toString(), arg] as const,
  ) as Promise<Awaited<T>>;
}

/** True once a play scene has installed its hooks (the title menus have none). */
const inPlay = (page: Page): Promise<boolean> => page.evaluate(() => !!(window as any).__hearth?.dev?.things);

/**
 * Open the game and walk the title flow the way a keyboard player does: Enter on each menu (Continue when
 * a save exists, else New game → the first inhabitant → the known world) until the play scene is up.
 */
export async function bootToPlay(page: Page, opts: { goto?: boolean } = {}): Promise<void> {
  if (opts.goto !== false) await page.goto('/');
  await expect(page.locator('#game')).toBeAttached();
  await expect
    .poll(async () => {
      if (await inPlay(page)) return true;
      await page.keyboard.press('Enter');
      return false;
    }, { timeout: 30_000, intervals: [300, 1200] })
    .toBe(true);
  await waitForWorld(page);
}

/** The scene is up and the player stands among things (chunks drawn around the spawn). */
export async function waitForWorld(page: Page): Promise<void> {
  await expect(page.locator('#game canvas')).toBeVisible();
  await expect.poll(() => dev<unknown[]>(page, 'things', 400).then((t) => t.length), { timeout: 20_000 }).toBeGreaterThan(0);
}

/** Wait a beat of game time (camera follow, chunk sync, bubbles). */
export const settle = (page: Page, ms = 600): Promise<void> => page.waitForTimeout(ms);

/** Every speech bubble / tell on screen right now (the voice hook is an object, so read `shown()` on it). */
export const shown = (page: Page): Promise<{ kind: string; key: string; text: string }[]> =>
  hearth(page, (h) => h.dev.voice.shown());

/** The town ids of the district the scene was built for (changes when the game rebuilds after a crossing). */
export const towns = (page: Page): Promise<string[]> => dev<string[]>(page, 'towns');

export type DistrictRef = { col: number; row: number };
export const district = (page: Page): Promise<DistrictRef> => hearth(page, (h) => h.session.district());

/**
 * Take a trunk road from the signpost's road sheet (the real button), then wait until the game has been
 * rebuilt around the far district: the session's district is `to` and the scene's towns are new.
 */
export async function crossTrunkRoad(page: Page, to: DistrictRef): Promise<void> {
  const before = await towns(page);
  const trunks = await hearth(page, (h) => h.session.trunkRoads() as { id: string; to: DistrictRef }[]);
  const road = trunks.find((t) => t.to.col === to.col && t.to.row === to.row);
  expect(road, `a trunk road to ${to.col},${to.row}`).toBeTruthy();
  await dev(page, 'roads'); // opens the road sheet for the current town, as the signpost's ring does
  const btn = page.locator(`[data-id="trunk-${road!.id}"]`);
  await expect(btn).toBeVisible();
  await btn.click();
  await expect.poll(() => district(page), { timeout: 30_000 }).toEqual(to);
  await expect.poll(() => towns(page).catch(() => before), { timeout: 30_000 }).not.toEqual(before);
  await waitForWorld(page);
}
