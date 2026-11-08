/** Kingdom patrons in real play: a doctrine voice brokers the Wardens' deal; the deal's man comes asking at dawn. */
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';

const OUT = process.env.E2E_UPDATE_SHOTS ? 'docs/qa/reports/patrons' : 'test-results/shots/patrons';
const BROKER = 'leon_march';

type Chip = { id: string; label: string };
type Win = {
  __hearth?: {
    scene: { children: { list: { type: string; visible: boolean; text?: string }[] } };
    session: { getState(): { hoard?: { notoriety: number }; player: { coin?: number }; patronDeals?: Record<string, { status: string }> } };
    dev: { chips(id: string): Chip[]; ring(id: string): boolean; arriveAt(t: string): void; rest(): Promise<string[]> };
  };
};

async function boot(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('[data-id=new]').click();
  await page.locator('[data-id=arch-marrow]').click();
  await page.locator('[data-id=world-known]').click(); // the world you know (seed 42)
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => !!(window as unknown as Win).__hearth, null, { timeout: 20_000 });
}

/** Open the ring on the broker and pick a chip with the number keys, paging with More… like a player. */
async function pick(page: Page, chipId: string): Promise<void> {
  const chips = await page.evaluate((id) => (window as unknown as Win).__hearth!.dev.chips(id), BROKER);
  const i = chips.findIndex((c) => c.id === chipId);
  expect(i, `${chipId} on offer`).toBeGreaterThanOrEqual(0);
  expect(await page.evaluate((id) => (window as unknown as Win).__hearth!.dev.ring(id), BROKER)).toBe(true);
  const paged = chips.length > 8;
  const per = paged ? 7 : 8;
  for (let p = 0; p < Math.floor(i / per); p++) await page.keyboard.press('Digit8');
  await page.keyboard.press(`Digit${(i % per) + 1}`);
}

const bubbles = (page: Page) =>
  page.evaluate(() => (window as unknown as Win).__hearth!.scene.children.list.filter((o) => o.type === 'Text' && o.visible).map((o) => o.text ?? ''));

test('a doctrine voice brokers the Wardens deal; the deadline comes at dawn', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await boot(page);
  await page.evaluate(() => (window as unknown as Win).__hearth!.dev.arriveAt('peat_ladder'));
  await page.waitForTimeout(600);

  const labels = (await page.evaluate((id) => (window as unknown as Win).__hearth!.dev.chips(id), BROKER)).map((c) => c.label);
  expect(labels).toContain('Hear the Wardens offer');
  expect(labels.some((l) => l.startsWith('Accept the Wardens'))).toBe(false); // nobody says your name yet

  await pick(page, `hear_patron_strand_wardens@${BROKER}`);
  await expect.poll(async () => (await bubbles(page)).some((t) => t.includes('Strand Road Wardens'))).toBe(true);

  // A name that carries (the hoard path raises it); then the deal is on the table.
  await page.evaluate(() => {
    (window as unknown as Win).__hearth!.session.getState().hoard!.notoriety = 0.5;
  });
  await page.waitForTimeout(2800);
  await pick(page, `hear_patron_strand_wardens@${BROKER}`);
  await expect.poll(async () => (await bubbles(page)).some((t) => t.includes('ride guard on their caravan'))).toBe(true);
  await page.screenshot({ path: `${OUT}/01-offer.png` });

  await page.waitForTimeout(2800);
  await pick(page, `patron_accept_warden_guard@${BROKER}`);
  const st = () => page.evaluate(() => {
    const s = (window as unknown as Win).__hearth!.session.getState();
    return { status: s.patronDeals?.deal_warden_guard_caravan?.status, coin: s.player.coin ?? 0 };
  });
  expect(await st()).toEqual({ status: 'active', coin: 15 });
  await expect.poll(async () => (await bubbles(page)).some((t) => /Wardens/.test(t) && !/offers/.test(t))).toBe(true);
  await page.screenshot({ path: `${OUT}/02-deal.png` });
  const after = (await page.evaluate((id) => (window as unknown as Win).__hearth!.dev.chips(id), BROKER)).map((c) => c.label);
  expect(after).toContain('Deliver on the deal (caravan)');

  // Rest toward the deadline: three days out is quiet, two days out the Wardens' man is asking.
  const rest = () => page.evaluate(() => (window as unknown as Win).__hearth!.dev.rest());
  const day1 = await rest();
  expect(day1.some((l) => l.includes('Wardens'))).toBe(false);
  const day2 = await rest();
  expect(day2.find((l) => l.startsWith("The Strand Road Wardens' man"))).toMatch(/Two days left/);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/03-dawn.png` });
  expect(errors).toEqual([]);
});
