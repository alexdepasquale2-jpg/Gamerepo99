// A wild prop (tree, rock …) out past the town: what it offers is a physical verb (it gives an item), and
// standing still by it sits the player down for a little spark instead of a "rest" chip.
import { dev, bootToPlay, expect, hearth, settle, test } from './support';

const WOODY_OR_STONY = /^prop:(tree|rock|boulder|log|stump)@(\d+),(\d+)$/;

test('a tree or rock gives what its verb says, and lingering by it warms', async ({ page }) => {
  await bootToPlay(page);
  await dev(page, 'nearThing', 'prop');
  await settle(page);
  const near = await dev<{ key: string; kind: string }[]>(page, 'things', 2000);
  const prop = near.map((t) => t.key.match(WOODY_OR_STONY)).find(Boolean);
  expect(prop, 'a tree or rock within sight of the first prop').toBeTruthy();
  const [key, , q, r] = prop!;
  await dev(page, 'teleport', Number(q), Number(r) + 1);
  await settle(page);

  // Its verbs: only prop verbs, and none of the old spark-only rests.
  const id = key.slice('prop:'.length);
  const verbs = await hearth(page, (h, i: string) => h.session.listVerbs({ kind: 'prop', id: i }).map((v: { id: string }) => v.id), id);
  expect(verbs.length).toBeGreaterThan(0);
  expect(verbs.every((v) => v.startsWith('prop.'))).toBe(true);
  expect(verbs.some((v) => /shade|\.sit|climb|rings/.test(v))).toBe(false);

  const before = await hearth(page, (h) => ({ ...h.session.getState().inventory }));
  const out = await dev<{ ok: boolean }>(page, 'act', key, verbs[0]);
  expect(out.ok).toBe(true);
  await expect.poll(() => hearth(page, (h, b: typeof before) => JSON.stringify(h.session.getState().inventory) !== JSON.stringify(b), before)).toBe(true);

  // Lingering: sit a while by shade and spark rises (under the daily prop cap).
  const sat = await dev<{ gain: number; spark: number }>(page, 'linger', 'shade', 30);
  expect(sat.gain).toBeGreaterThan(0);
});
