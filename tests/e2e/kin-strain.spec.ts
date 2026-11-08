/** The Drift: families split across the gap are heard at dawn, and strained people's lines carry it. */
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';

const OUT = 'docs/qa/reports/kin-strain';

type Person = { id: string; townId?: string; name?: string };
type Hearth = {
  session: {
    listPeople(): Person[];
    act(id: string): void;
    getState(): { player: { spark: number; townId?: string }; people: Record<string, Person> } | undefined;
    onJuice(fn: (id: string, p: unknown) => void): () => void;
  };
  dev: {
    rest(): Promise<string[]>;
    kinStrain(id: string): number;
    ring(id: string): boolean;
    arriveAt(townId: string): void;
  };
};
declare global {
  interface Window {
    __hearth?: Hearth;
    __said?: Record<string, string>;
  }
}

async function boot(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('[data-id=new]').click();
  await page.locator('[data-id=arch-marrow]').click();
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => !!window.__hearth, null, { timeout: 20_000 });
}

test.describe('kin strain across the gap', () => {
  test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));

  test('dawn tells of split families; a strained person answers with it', async ({ page }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => {
      errors.push(String(e));
      console.log('pageerror', String(e));
    });
    await boot(page);

    // A few real rests: the drift line rotates, never the same family twice in a row.
    const drift: string[] = [];
    for (let i = 0; i < 3; i++) {
      const lines = await page.evaluate(() => window.__hearth!.dev.rest());
      console.log('rest', i, lines);
      const names = await page.evaluate(() => Object.values(window.__hearth!.session.getState()!.people).map((p) => p.name ?? ''));
      const told = lines.filter((l) => names.some((n) => n && l.includes(n)) && /letter|wrote|writes|grew up|table|supper|coin|picture|wedding/.test(l));
      expect(told.length).toBeGreaterThan(0);
      drift.push(told[0]!);
      await page.waitForTimeout(400);
    }
    for (let i = 1; i < drift.length; i++) expect(drift[i]).not.toEqual(drift[i - 1]);

    // Talk to the most strained person here (an authored anchor if one is strained) and hear the drift.
    const pick = await page.evaluate(() => {
      const h = window.__hearth!;
      const people = h.session.listPeople().map((p) => ({ ...p, s: h.dev.kinStrain(p.id) }));
      people.sort((a, b) => b.s - a.s);
      const calm = people.find((p) => p.s === 0)!;
      return { hot: people[0]!, calm };
    });
    expect(pick.hot.s).toBeGreaterThanOrEqual(0.35);
    if (pick.hot.townId) await page.evaluate((t) => window.__hearth!.dev.arriveAt(t), pick.hot.townId);
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      window.__said = {};
      window.__hearth!.session.onJuice((id, p) => {
        const q = p as { personId?: string; line?: string };
        if (id === 'person.reaction' && q.personId) window.__said![q.personId] = q.line ?? '';
      });
    });
    for (const id of [pick.hot.id, pick.calm.id]) {
      await page.evaluate((pid) => {
        const st = window.__hearth!.session.getState()!;
        st.player.spark = 100;
        window.__hearth!.session.act(`inspire@${pid}`);
      }, id);
    }
    const said = await page.evaluate(() => window.__said!);
    expect(said[pick.hot.id]).toMatch(/[Ff]amily/);
    expect(said[pick.calm.id] ?? '').not.toMatch(/[Ff]amily makes/);
    await page.waitForTimeout(600);
    await page.locator('#game canvas').screenshot({ path: `${OUT}/strained-reaction.png` });
    expect(errors).toEqual([]);
  });
});
