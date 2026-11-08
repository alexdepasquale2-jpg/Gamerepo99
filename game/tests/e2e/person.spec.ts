// Acting on a person through the ring's real chips: Speak → Speak gently, and they answer in a bubble.
import { bootToPlay, dev, expect, hearth, settle, shown, test } from './support';

test('ring verbs on a person draw a reaction line', async ({ page }) => {
  await bootToPlay(page);
  const people = await dev<{ id: string; townId: string; inside: string | null }[]>(page, 'people');
  const home = await hearth(page, (h) => h.session.snapshot().townId as string);
  const who = people.find((p) => p.townId === home && !p.inside) ?? people[0];
  expect(who, 'someone lives in the home town').toBeTruthy();
  await dev(page, 'teleportTo', who.id);
  await settle(page);

  // Open their ring (as a tap on them does) and check it offers the ways to treat a person.
  const ring = await dev<{ chips: { id: string }[] }>(page, 'openRing', `person:${who.id}`);
  const ids = ring.chips.map((c) => c.id);
  expect(ids).toContain('family:speak');
  expect(ids).toContain('family:help');
  await expect(page.locator('.ix-ring')).toBeVisible();

  const sparkBefore = await hearth(page, (h) => h.session.getState().player.spark as number);
  await page.locator('.ix-chip[data-id="family:speak"]').click();
  const gentle = page.locator(`.ix-chip[data-id="talk_gentle@${who.id}"]`);
  await expect(gentle).toBeVisible();
  await gentle.click();

  // The ring closes on a pick, the act lands in the sim, and the person says something back.
  await expect.poll(async () => (await shown(page)).some((b) => b.key === who.id && b.text.length > 0)).toBe(true);
  expect(await hearth(page, (h) => h.session.getState().player.spark as number)).not.toBe(sparkBefore);
  await expect(page.locator('.ix-ring')).toBeHidden();
});
