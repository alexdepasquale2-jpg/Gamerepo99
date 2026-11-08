// A wild prop (tree, rock …) out past the town: its ring offers props.json verbs and one changes spark or the satchel.
import { dev, bootToPlay, expect, hearth, settle, test } from './support';

const WOODY_OR_STONY = /^prop:(tree|rock|boulder|log|stump)@(\d+),(\d+)$/;

test('a tree or rock gives what its verb says', async ({ page }) => {
  await bootToPlay(page);
  // Find one: nearThing walks (teleports) toward the nearest prop, then look around there for a tree or rock.
  await dev(page, 'nearThing', 'prop');
  await settle(page);
  const near = await dev<{ key: string; kind: string }[]>(page, 'things', 2000);
  const prop = near.map((t) => t.key.match(WOODY_OR_STONY)).find(Boolean);
  expect(prop, 'a tree or rock within sight of the first prop').toBeTruthy();
  const [key, , q, r] = prop!;
  await dev(page, 'teleport', Number(q), Number(r) + 1); // stand just below it, as nearThing does
  await settle(page);

  const ring = await dev<{ chips: { id: string; label: string }[] }>(page, 'openRing', key);
  expect(ring.chips.length).toBeGreaterThan(0);
  expect(ring.chips.every((c) => c.id.startsWith('prop.'))).toBe(true);

  const before = await hearth(page, (h) => ({ spark: h.session.getState().player.spark, inv: { ...h.session.getState().inventory } }));
  const chip = page.locator(`.ix-chip[data-id="${ring.chips[0].id}"]`);
  await expect(chip).toBeVisible();
  await chip.click();

  // Either warmth or an item: every tree/rock verb does one of the two.
  await expect
    .poll(() => hearth(page, (h, b: typeof before) => {
      const st = h.session.getState();
      return st.player.spark !== b.spark || JSON.stringify(st.inventory) !== JSON.stringify(b.inv);
    }, before))
    .toBe(true);
  // And once a day: the same verb on the same prop type is spent now.
  const again = await dev<{ chips: { id: string }[] } | null>(page, 'openRing', key);
  expect((again?.chips ?? []).map((c) => c.id)).not.toContain(ring.chips[0].id);
});
