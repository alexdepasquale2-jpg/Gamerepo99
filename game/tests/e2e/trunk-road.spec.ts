// The signpost's trunk road into a neighbouring district and back: the world is rebuilt each way, the
// arrival is told, and home comes back as it was left (its people, its towns).
import { bootToPlay, crossTrunkRoad, district, expect, hearth, shown, test, towns } from './support';

const told = (page: Parameters<typeof shown>[0], re: RegExp) =>
  expect.poll(async () => (await shown(page)).some((b) => b.key === 'player' && re.test(b.text)), { timeout: 20_000 }).toBe(true);

test('trunk road out to a district and back home', async ({ page }) => {
  await bootToPlay(page);
  const home = await district(page);
  const homeTowns = await towns(page);
  const homeFolk = await hearth(page, (h) => Object.keys(h.session.getState().people).sort());
  const dayBefore = await hearth(page, (h) => h.session.snapshot().day as number);

  // The shortest trunk road out keeps the run quick.
  const trunks = await hearth(page, (h) => h.session.trunkRoads() as { to: { col: number; row: number }; days: number }[]);
  expect(trunks.length).toBeGreaterThan(0);
  const out = [...trunks].sort((a, b) => a.days - b.days)[0];

  await crossTrunkRoad(page, out.to);
  const awayTowns = await towns(page);
  expect(awayTowns.some((t) => homeTowns.includes(t))).toBe(false);
  expect(await hearth(page, (h) => h.session.snapshot().day as number)).toBe(dayBefore + out.days);
  await told(page, /days on the trunk road, and you come down into/);

  // Back the way we came: a trunk road home is always offered from a neighbour.
  await crossTrunkRoad(page, home);
  expect(await towns(page)).toEqual(homeTowns);
  await told(page, /^Home\./);
  // The district we left kept its people while frozen.
  const folkNow = await hearth(page, (h) => Object.keys(h.session.getState().people).sort() as string[]);
  expect(folkNow.filter((id) => homeFolk.includes(id)).length).toBeGreaterThan(homeFolk.length * 0.8);
});
