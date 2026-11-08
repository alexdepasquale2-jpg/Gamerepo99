/** Households and births are live: a child who comes of age walks out into the town, named, actable, and told of at dawn. */
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';

const OUT = 'tests/e2e/artifacts/births';

type Hearth = {
  session: {
    getState(): {
      day: number;
      player: { townId?: string };
      people: Record<string, { id: string; name?: string; townId?: string }>;
      kin?: { households: unknown[]; children: { id: string; status: string; personId?: string }[]; lineages: Record<string, unknown>; next: number };
    };
    listPeople(): { id: string; name?: string }[];
  };
  scene: { people: { byId: Map<string, { label: { text: string }; sprite: { visible: boolean } }> } };
  interior: { whereabouts(): { id: string; inside: string | null; visible: boolean }[]; setHour(p: number): void };
  dev: { rest(): Promise<string[]>; chips(id: string): { id: string; label: string }[]; ring(id: string): boolean };
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

test('a child who comes of age appears in town with their name, can be acted on, and a parent tells you at dawn', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  fs.mkdirSync(OUT, { recursive: true });
  await boot(page);

  // A household of two villagers in the town you start in, with a daughter who comes of age at the next dawn.
  const planted = await page.evaluate(() => {
    const st = window.__hearth!.session.getState();
    const townId = st.player.townId!;
    const folk = Object.values(st.people).filter((p) => p.townId === townId).map((p) => p.id).sort();
    const adults = [folk[0]!, folk[1]!];
    const kin = (st.kin ??= { households: [], children: [], lineages: {}, next: 1 });
    (kin.households as unknown[]).push({ id: 'hh_e2e', townId, adults, surname: 'Tallow', generation: 1, formed: st.day, kids: ['kid_e2e'] });
    kin.lineages.Tallow = { surname: 'Tallow', founders: adults, founded: st.day, generation: 1 };
    (kin.children as unknown[]).push({ id: 'kid_e2e', householdId: 'hh_e2e', townId, given: 'Wren', surname: 'Tallow', sex: 'f', parents: adults, born: st.day + 1 - 80, status: 'child' });
    return { townId, before: window.__hearth!.session.listPeople().length };
  });

  const lines = await page.evaluate(() => window.__hearth!.dev.rest());
  const id = 'born_kid_e2e';
  expect(await page.evaluate((pid) => window.__hearth!.session.listPeople().find((p) => p.id === pid)?.name, id)).toBe('Wren Tallow');

  // A body in the world, labelled with her real name.
  expect(await page.evaluate((pid) => window.__hearth!.scene.people.byId.get(pid)?.label.text, id)).toBe('Wren');
  await page.evaluate(() => window.__hearth!.interior.setHour(0.45)); // midday: out and about
  const where = await page.evaluate((pid) => window.__hearth!.interior.whereabouts().find((w) => w.id === pid), id);
  expect(where).toBeTruthy();
  expect(where!.visible || !!where!.inside).toBe(true);

  // Chips are offered for her, and the ring opens on her like anyone else.
  const chips = await page.evaluate((pid) => window.__hearth!.dev.chips(pid), id);
  expect(chips.length).toBeGreaterThan(0);
  expect(chips.some((c) => c.id === `inspire@${id}`)).toBe(true);

  // A parent carries the news at dawn.
  expect(lines.some((l) => l.includes('Wren Tallow is grown now'))).toBe(true);

  if (!where!.inside) {
    expect(await page.evaluate((pid) => window.__hearth!.dev.ring(pid), id)).toBe(true);
    await page.waitForTimeout(400);
  }
  await page.screenshot({ path: `${OUT}/newcomer-ring.png` });
  expect(errors).toEqual([]);
});
