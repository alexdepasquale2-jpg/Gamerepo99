// The living world is drawn, not only simulated: each sim system that changes through the day (work, haulers,
// town stores, spoilage, sickness, the young, war, road wear, lost carts, district letters, season and
// weather, graves, building sites, despair) shows up in the running game. Every layer reports what it drew
// this frame through `__hearth.dev.visuals()`; this spec brings each condition about (waiting days, standing
// near the thing, or setting the state the sim would reach) and asserts its counter, with a screenshot each.
import type { Page, TestInfo } from '@playwright/test';
import { bootToPlay, dev, expect, hearth, settle, test } from './support';

type Counts = Record<string, number>;
const visuals = (page: Page): Promise<Counts> => dev<Counts>(page, 'visuals');
/** The count each layer showed when its condition was brought about (reported at the end). */
const proven: Counts = {};

/** Poll one counter until it is above zero (layers count on their next frame or refresh). */
async function seen(page: Page, name: string, info: TestInfo, shot?: string): Promise<number> {
  await expect.poll(async () => (await visuals(page))[name] ?? 0, { message: `visuals().${name}`, timeout: 15_000 }).toBeGreaterThan(0);
  if (shot) await page.screenshot({ path: info.outputPath(`${shot}.png`) });
  const n = (await visuals(page))[name] ?? 0;
  proven[name] = Math.max(proven[name] ?? 0, n);
  return n;
}

const standAt = (page: Page, x: number, y: number, dy = 1) => dev(page, 'teleport', Math.floor(x / 32), Math.floor(y / 32) + dy);

/** Let days pass with the player's spark kept up, so the fire going out (succession) does not cover the view. */
const rest = (page: Page, days: number) => hearth(page, (h, n: number) => {
  for (let i = 0; i < n; i++) { const p = h.session.getState().player; p.spark = p.sparkMax ?? 100; h.session.wait(1); }
}, days);

test('every living system has a visual in the running game', async ({ page }, info) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await bootToPlay(page);
  await dev(page, 'setPhase', 0.3); // working hours

  // Work at a task spot: the pot by the hearth steams, its bar shows today's share.
  const spot = await hearth(page, (h) => { const p = h.dev.where(); return h.dev.workSpots().sort((a: any, b: any) => Math.hypot(a.x / 32 - p.q, a.y / 32 - p.r) - Math.hypot(b.x / 32 - p.q, b.y / 32 - p.r))[0]; });
  expect(spot, 'a work spot near the start').toBeTruthy();
  await standAt(page, spot.x, spot.y);
  await seen(page, 'workFx', info, 'work-fx');
  await seen(page, 'workBars', info);
  await seen(page, 'caravans', info); // the trader in the square on day 1
  await seen(page, 'siteMarks', info);
  await seen(page, 'warmth', info); // a hopeful town's palette runs warm
  // Where the start town's stores stand (found once the town is drawn), to come back to later.
  await expect.poll(async () => (await dev<any[]>(page, 'storeHeaps')).length).toBeGreaterThan(0);
  const heap0 = (await dev<{ townId: string; x: number; y: number }[]>(page, 'storeHeaps'))[0]!;

  // Days pass: plots go up, stores fill, carts are lost on the road, the season turns.
  await rest(page, 10);
  await dev(page, 'setPhase', 0.3);
  await settle(page, 1500);
  await seen(page, 'scaffolds', info);
  expect(await hearth(page, (h) => h.dev.season().season)).toBe('summer');

  // Winter: wait day by day for snow; the greenery whitens and snow falls over the view.
  for (let i = 0; i < 30; i++) {
    const s = await hearth(page, (h) => h.dev.season());
    if (s.season === 'winter' && s.weather === 'snow') break;
    await rest(page, 1);
  }
  expect(await hearth(page, (h) => h.dev.season())).toMatchObject({ season: 'winter', weather: 'snow' });
  await dev(page, 'setPhase', 0.3);
  await settle(page, 4000);
  await seen(page, 'seasonTint', info);
  await seen(page, 'weather', info, 'winter-snow');

  // Traffic: a village cart on the road with its load, a visitor walking between towns.
  const cart = (await dev<any[]>(page, 'traffic')).find((t) => t.kind === 'cart');
  if (cart) { await standAt(page, cart.x, cart.y); await seen(page, 'carts', info, 'cart'); }
  // Visitors set out on their own days: let a dawn or two pass until one is on the road.
  let walker: any[] = [];
  for (let i = 0; i < 10 && !walker.length; i++) {
    await settle(page, 1200);
    walker = await dev<any[]>(page, 'roadFolk');
    if (!walker.length) await rest(page, 1);
  }
  expect(walker.length, 'a visitor on the road').toBeGreaterThan(0);
  await standAt(page, walker[0].x, walker[0].y);
  await seen(page, 'roadFolk', info, 'visitor');

  // The town stores: heaps by the plaza; spoiled food draws crows; an emptied granary looks lean.
  const town = await hearth(page, (h) => h.session.getState().player.townId as string);
  const heap = heap0;
  expect(heap.townId, 'still in the start town').toBe(town);
  await standAt(page, heap.x, heap.y, 2);
  await seen(page, 'storeHeaps', info);
  const fire = (await dev<any[]>(page, 'things', 4000)).find((x) => x.kind === 'hearth');
  await standAt(page, fire.x, fire.y, 2);
  await seen(page, 'storePiles', info); // the heavy-goods piles by the hearth (sim/carry)
  await standAt(page, heap.x, heap.y, 2);
  await hearth(page, (h, t: string) => {
    const s = h.session.getState();
    s.townStores.log.entries.push({ day: s.day, from: `${t}:yard`, to: 'sink:spoiled', item: 'grain', qty: 3, why: 'spoiled' });
  }, town);
  await seen(page, 'crows', info, 'stores-crows');
  await hearth(page, (h, t: string) => {
    const s = h.session.getState();
    s.townStores.towns[t].granary.items = {};
    s.villageEconomy.towns[t].need.food = Math.max(4, s.villageEconomy.towns[t].need.food ?? 0);
  }, town);
  await seen(page, 'leanGranaries', info, 'granary-lean');

  // Haulers: a working site beside the town with two haulers and goods on its shelves.
  const haulers = await hearth(page, (h, a: { t: string; q: number; r: number }) => {
    const s = h.session.getState(), t = a.t;
    const site: any = Object.values(s.civic.sites).find((x: any) => x.townId === t && x.status === 'working');
    const free = Object.values(s.people).filter((p: any) => p.townId === t && (p.age ?? 30) >= 18 && !(p.tags ?? []).length).map((p: any) => p.id);
    site.plot = { q: a.q + 7, r: a.r - 1 };
    site.haulers = free.slice(0, 2);
    site.store.items = { ...site.store.items, grain: 24 };
    return site.haulers as string[];
  }, { t: town, q: Math.floor(heap.x / 32), r: Math.floor(heap.y / 32) });
  expect(haulers.length).toBeGreaterThan(0);
  await expect.poll(async () => {
    const who = (await dev<any[]>(page, 'people')).find((p) => p.id === haulers[0] && p.drawn);
    if (who) await standAt(page, who.x, who.y);
    return (await visuals(page)).haulers ?? 0;
  }, { timeout: 40_000, intervals: [2000] }).toBeGreaterThan(0);
  await page.screenshot({ path: info.outputPath('haulers.png') });
  proven.haulers = (await visuals(page)).haulers ?? 0;

  // The sick walk pale and slow; a household's child trots at a parent's heels.
  const pair = await hearth(page, (h, t: string) => {
    const s = h.session.getState();
    const out = h.dev.people().filter((p: any) => p.townId === t && p.drawn && !p.inside);
    const [a, b] = [out[2] ?? out[0], out[3] ?? out[1]];
    s.people[a.id].tags = [...(s.people[a.id].tags ?? []), 'sick'];
    s.kin ??= { households: [], children: [], lineages: {}, next: 1 };
    s.kin.children.push({ id: 'e2e_child', householdId: 'e2e', townId: t, given: 'Wren', surname: 'Hale', sex: 'f', parents: [b.id, a.id], born: s.day - 3, status: 'child' });
    return { sick: a.id, parent: b.id };
  }, town);
  await dev(page, 'teleportTo', pair.sick);
  await seen(page, 'sickFolk', info, 'sick');
  await dev(page, 'teleportTo', pair.parent);
  await seen(page, 'children', info, 'child');

  // Graves, gloom and an empty stall in the town.
  await hearth(page, (h, t: string) => {
    const s = h.session.getState();
    (s.legacy ??= {} as any).graves = [...(s.legacy.graves ?? []), { personId: 'e2e_dead', name: 'Old Tom', townId: t, day: s.day }];
    s.towns[t].despair = 0.8;
    for (const k of Object.keys(s.villageEconomy.towns[t].goods)) s.villageEconomy.towns[t].goods[k] = 0;
  }, town);
  await standAt(page, heap.x, heap.y, 2);
  await seen(page, 'graves', info);
  await seen(page, 'gloom', info, 'gloom');
  await seen(page, 'emptyStalls', info);
  await seen(page, 'coldChimneys', info);

  // War: the town flies the banner, smoke rises past its edge.
  await hearth(page, (h, t: string) => {
    const s = h.session.getState();
    const other = Object.keys(s.towns).find((x) => x !== t);
    s.polity.wars.push({ id: 'e2e_war', aggressor: t, defender: other, started: s.day, duration: 9, raids: 0, status: 'active' });
  }, town);
  const sign = (await dev<any[]>(page, 'things', 4000)).find((x) => x.kind === 'signpost');
  await standAt(page, sign.x, sign.y);
  await seen(page, 'warSigns', info, 'war');

  // A letter from a neighbouring district: a rider walks in toward the town.
  const rider = await hearth(page, (h) => {
    const s = h.session.getState();
    const p = s.realm?.polity;
    if (!p) return false;
    const live = `d${s.realm.active.col}_${s.realm.active.row}`;
    const r: any = Object.values(p.relations).find((x: any) => x.a === live || x.b === live);
    if (!r) return false;
    r.courier = { from: r.a === live ? r.b : r.a, sent: s.day - 1, due: s.day + 1, kind: 'greeting' };
    return true;
  });
  if (rider) {
    const at = await expect.poll(async () => (await dev<any[]>(page, 'districtCouriers')).length).toBeGreaterThan(0).then(() => dev<any[]>(page, 'districtCouriers'));
    await standAt(page, at[0].x, at[0].y);
    await seen(page, 'districtCouriers', info, 'district-courier');
  }

  // Roads: worn roads show potholes, a broken one a barrier; a lost cart lies where it fell.
  await hearth(page, (h) => { const s = h.session.getState(); s.economyRoutes.forEach((r: any, i: number) => { r.condition = 0.3; if (i === 0) r.broken = true; }); });
  const brk = (await dev<{ x: number; y: number }[]>(page, 'roadBreaks'))[0]!;
  await standAt(page, brk.x, brk.y);
  await seen(page, 'roadBreaks', info, 'road-broken');
  await seen(page, 'roadWear', info);
  const wreck = await hearth(page, (h) => {
    const s = h.session.getState();
    const c = s.logistics?.carts?.[0];
    if (c) (s.logistics.wrecks ??= []).push({ cartId: 'e2e', itemId: c.itemId, qty: c.qty, at: { routeId: c.legs[0].routeId, from: c.legs[0].from, to: c.legs[0].to, f: 0.5 }, day: s.day });
    return h.dev.traffic().find((t: any) => t.kind === 'wreck') ?? null;
  });
  await expect.poll(() => dev<any[]>(page, 'traffic').then((t) => t.filter((x) => x.kind === 'wreck').length)).toBeGreaterThan(0);
  const w = wreck ?? (await dev<any[]>(page, 'traffic')).find((x) => x.kind === 'wreck');
  await standAt(page, w.x, w.y);
  await seen(page, 'wrecks', info, 'wreck');

  // Every registered dawn tick names what shows it (or why it is spoken, not drawn).
  const why = await dev<Record<string, { counters: string[]; why: string }>>(page, 'visualsWhy');
  for (const [id, row] of Object.entries(why)) expect(row.why.length, `reason for ${id}`).toBeGreaterThan(10);
  for (const [id, row] of Object.entries(why)) for (const c of row.counters) expect(proven[c] ?? 0, `${id} → ${c} shown`).toBeGreaterThan(0);
  console.log(`living visuals proven: ${JSON.stringify(proven)}`);
  await info.attach('visuals', { body: JSON.stringify(proven, null, 2), contentType: 'application/json' });
});
