/** Unit 6 (tree B5): ask a favor, show up, empty cheer and return are ring chips that act in real play. */
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join('tests', 'e2e', 'artifacts', 'verbs');

type Chip = { id: string; label: string };
type Hearth = {
  session: {
    listPeople(): { id: string }[];
    onJuice(h: (id: string, p: unknown) => void): () => void;
    getState(): { loans?: { fromPersonId: string; itemId: string }[]; cargo?: { fromPersonId: string }[] };
  };
  scene: { children: { list: { type: string; text?: string }[] } };
  dev: { chips(id: string): Chip[]; ring(id: string): boolean; lastSay(): string };
};
type W = { __hearth?: Hearth; __juice?: { id: string; personId?: string; line?: string }[] };

async function boot(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('[data-id=new]').click();
  await page.locator('[data-id=arch-marrow]').click();
  await page.locator('[data-id=world-known]').click(); // the world you know (seed 42)
  await page.waitForFunction(() => !!(window as unknown as W).__hearth, null, { timeout: 20_000 });
  await page.evaluate(() => {
    const w = window as unknown as W;
    w.__juice = [];
    w.__hearth!.session.onJuice((id, p) => {
      const q = p as { personId?: string; line?: string };
      w.__juice!.push({ id, personId: q.personId, line: q.line });
    });
  });
}

const chips = (page: Page, pid: string): Promise<Chip[]> =>
  page.evaluate((id) => (window as unknown as W).__hearth!.dev.chips(id), pid);

/** Open the ring on a person and pick a chip with the number keys, paging with More… (slot 8). */
async function pick(page: Page, pid: string, chipId: string): Promise<void> {
  const all = await chips(page, pid);
  const idx = all.findIndex((c) => c.id === chipId);
  expect(idx, `${chipId} on offer`).toBeGreaterThanOrEqual(0);
  expect(await page.evaluate((id) => (window as unknown as W).__hearth!.dev.ring(id), pid)).toBe(true);
  await page.waitForTimeout(150);
  const per = all.length > 8 ? 7 : 8;
  for (let p = 0; p < Math.floor(idx / per); p++) {
    await page.keyboard.press('Digit8'); // More…
    await page.waitForTimeout(120);
  }
  await page.keyboard.press(`Digit${(idx % per) + 1}`);
}

/** The reaction (or refusal) line the act produced, and that a bubble with it is on screen. */
async function reaction(page: Page, pid: string, from: number): Promise<string> {
  const line = await page.evaluate(
    ([id, n]) => (window as unknown as W).__juice!.slice(n as number).find((j) => (j.id === 'person.reaction' || j.id === 'refusal.coal_flicker') && j.personId === id)?.line ?? '',
    [pid, from] as const,
  );
  expect(line).not.toBe('');
  await page.waitForFunction(
    (l) => (window as unknown as W).__hearth!.scene.children.list.some((o) => o.type === 'Text' && typeof o.text === 'string' && o.text.includes(l.slice(0, 18))),
    line,
    // Bubbles queue one per person (2.6 s of game time each), and headless frames are slow.
    { timeout: 60_000 },
  );
  return line;
}

const juiceLen = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as W).__juice!.length);

test('missing verbs are ring chips that act: ask a favor, show up, empty cheer, return', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  fs.mkdirSync(OUT, { recursive: true });
  await boot(page);

  // Someone who will be asked a favor (trust gate) and offers the new chips.
  const people = await page.evaluate(() => (window as unknown as W).__hearth!.session.listPeople().map((p) => p.id));
  let pid = '';
  for (const id of people) {
    const c = (await chips(page, id)).map((x) => x.id);
    if (c.includes(`favor_ask@${id}`) && c.includes(`show_up@${id}`) && c.includes(`talk_empty_cheer@${id}`)) { pid = id; break; }
  }
  expect(pid).not.toBe('');
  const labels = (await chips(page, pid)).map((c) => c.label);
  expect(labels).toEqual(expect.arrayContaining(['Ask a favor', 'Show up', 'Cheer up (empty words)']));
  expect(labels).not.toContain("Return what's theirs");
  expect((await chips(page, pid)).length).toBeGreaterThan(8); // the new chips live past page one

  // Show up.
  let n = await juiceLen(page);
  await pick(page, pid, `show_up@${pid}`);
  await reaction(page, pid, n);
  await page.screenshot({ path: path.join(OUT, 'show-up.png') });
  expect((await chips(page, pid)).map((c) => c.id)).not.toContain(`show_up@${pid}`); // once a day

  // Ask a favor: they may lend you something of theirs.
  n = await juiceLen(page);
  await pick(page, pid, `favor_ask@${pid}`);
  await reaction(page, pid, n);
  await page.screenshot({ path: path.join(OUT, 'ask-favor.png') });
  expect((await chips(page, pid)).map((c) => c.id)).not.toContain(`favor_ask@${pid}`);

  // Empty cheer.
  n = await juiceLen(page);
  await pick(page, pid, `talk_empty_cheer@${pid}`);
  await reaction(page, pid, n);
  await page.screenshot({ path: path.join(OUT, 'empty-cheer.png') });

  // Return: a loan from the favor, or else cargo they hand you to carry (a real ring deed).
  const lent = await page.evaluate((id) => !!(window as unknown as W).__hearth!.session.getState().loans?.some((l) => l.fromPersonId === id), pid);
  if (!lent) {
    await pick(page, pid, `carry_goods@${pid}`);
    await page.waitForTimeout(200);
    expect(await page.evaluate((id) => !!(window as unknown as W).__hearth!.session.getState().cargo?.some((c) => c.fromPersonId === id), pid)).toBe(true);
  }
  expect((await chips(page, pid)).map((c) => c.label)).toContain("Return what's theirs");
  n = await juiceLen(page);
  await pick(page, pid, `return_item@${pid}`);
  const line = await reaction(page, pid, n);
  expect(line).toMatch(/brought it back|could have kept it/);
  await page.screenshot({ path: path.join(OUT, 'return.png') });
  expect((await chips(page, pid)).map((c) => c.id)).not.toContain(`return_item@${pid}`);

  expect(errors).toEqual([]);
});
