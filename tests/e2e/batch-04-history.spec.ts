/** Unit 4: the past, spoken. Ask someone about the old days through the ring; their retelling shows over their head. */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { pickVerb } from './support/game';

const OUT = 'test-results';
const LABEL = 'Ask about the old days';

type H = {
  session: {
    onJuice(h: (id: string, p: unknown) => void): () => void;
    listPeople(): { id: string; townId?: string }[];
    snapshot(): { townId: string };
  };
  dev: { chips(id: string): { id: string; label: string }[]; ring(id: string): boolean };
  scene: { children: { list: { text?: string; visible?: boolean }[] } };
};
type W = { __hearth?: H; __told?: string[] };

test('ask about the old days: a history beat retold as the person\'s bubble', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await page.locator('[data-id=new]').click();
  await page.locator('[data-id=arch-marrow]').click();
  await page.locator('[data-id=world-known]').click(); // the world you know (seed 42)
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => !!(window as unknown as W).__hearth, null, { timeout: 20_000 });

  // Someone in the starting town with a story left to tell; open their ring as if E was pressed.
  const found = await page.evaluate((label) => {
    const w = window as unknown as W;
    const h = w.__hearth!;
    w.__told = [];
    h.session.onJuice((id, p) => {
      if (id === 'history.told') w.__told!.push((p as { line: string }).line);
    });
    const town = h.session.snapshot().townId;
    const people = h.session.listPeople();
    for (const p of [...people.filter((x) => x.townId === town), ...people]) {
      const chips = h.dev.chips(p.id);
      const chip = chips.find((c) => c.label === label);
      if (chip) return { who: p.id, id: chip.id };
    }
    return null;
  }, LABEL);
  expect(found).not.toBeNull();

  // Open their ring as if E was pressed and pick the chip with the number keys (family, then verb).
  await pickVerb(page, found!.who, found!.id);

  await page.waitForFunction(() => ((window as unknown as W).__told ?? []).length > 0, null, { timeout: 5000 });
  const line = await page.evaluate(() => (window as unknown as W).__told![0]!);
  expect(line.length).toBeGreaterThan(10);

  // The surface layer shows it over the teller's head (a Phaser text with exactly that line).
  await page.waitForFunction(
    (l) => (window as unknown as W).__hearth!.scene.children.list.some((o) => o.text === l && o.visible !== false),
    line,
    { timeout: 5000 },
  );
  await page.waitForTimeout(300);
  await page.locator('#game canvas').screenshot({ path: `${OUT}/batch-04-history-bubble.png` });
  expect(errors).toEqual([]);
});
