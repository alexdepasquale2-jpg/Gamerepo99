/** Authored moments in play: shaming a child is refused, and the refusal-coal moment's line surfaces once. */
import { test, expect } from '@playwright/test';

type Beat = { momentId: string; personId: string; line: string };
type Hearth = {
  session: {
    act(id: string): void;
    listPeople(): { id: string; tags?: string[]; woundId?: string }[];
    onJuice(h: (id: string, p: unknown) => void): () => void;
  };
  dev: { ring(id: string): boolean };
};

test('refusal coal moment surfaces its authored line once', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await page.locator('[data-id=new]').click();
  await page.locator('[data-id=arch-marrow]').click();
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => !!(window as unknown as { __hearth?: unknown }).__hearth, null, { timeout: 20_000 });

  // Walk up to the boy first so the bubble is on screen.
  if (await page.evaluate(() => (window as unknown as { __hearth: Hearth }).__hearth.dev.ring('jonah_pike'))) await page.keyboard.press('Escape');

  const result = await page.evaluate(() => {
    const h = (window as unknown as { __hearth: Hearth }).__hearth;
    const beats: Beat[] = [];
    const juice: string[] = [];
    h.session.onJuice((id, p) => {
      juice.push(id);
      if (id === 'moment.beat') beats.push(p as Beat);
    });
    const people = h.session.listPeople();
    const child = people.find((p) => p.id === 'jonah_pike') ?? people.find((p) => p.tags?.includes('child'));
    if (!child) return { child: null, beats, juice, second: 0 };
    h.session.act(`approach@${child.id}`);
    h.session.act(`shame@${child.id}`);
    const first = beats.length;
    h.session.act(`shame@${child.id}`);
    return { child: child.id, beats, juice, first, second: beats.length - first };
  });

  expect(result.child).toBeTruthy();
  expect(result.juice).toContain('refusal.coal_flicker');
  expect(result.beats).toEqual([{ momentId: 'moment_refusal_coal', personId: result.child, line: 'You stopped. Nobody ever stops.', title: 'Refusal coal' }]);
  expect(result.second).toBe(0);
  // Let the bubble draw, then keep a picture of it.
  await page.waitForTimeout(400);
  await page.screenshot({ path: info.outputPath('moment-refusal-coal.png') });
  expect(errors).toEqual([]);
});
