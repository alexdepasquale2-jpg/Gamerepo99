/**
 * The civic loop, proved on whole worlds (docs/superpowers/plans/civic/index.md, slices 1-3):
 *   - 30- and 120-dawn runs save byte-identical per seed;
 *   - the civic tick conserves coin (wages, rations and draws only move it) and goods (the town ledger is
 *     untouched by it);
 *   - no company earns at a dawn its site starts with no manager;
 *   - a manager's death leaves the post wanted and the best fit takes it;
 *   - unpaid hands quit, unfed hands fall sick and leave;
 *   - slice 3: the world's goods (every store and cart) only change by named sources and sinks (production,
 *     opening balances, outside writes; eating, wear, use, spoilage, loss), the ledger is the stores' sum,
 *     haulers carry a site's goods to the granary, food spoils and timber keeps, and a save from before
 *     stores (ledger only) builds them on first touch.
 *
 * Run: npx vite-node --config game/vite.config.ts game/scripts/check-civic.mts
 */
import { SITE_KIND_BY_ID, civicIfAny, siteById as siteOf, sitesIn, type Site } from '../src/sim/civic';
import { registerDawnTick } from '../src/sim/dawn-ticks';
import { COMPANY, companyManaged } from '../src/sim/economy/companies';
import { laidToRest } from '../src/sim/economy/mortality';
import { CIVIC } from '../src/sim/civic/sites';
import { tickSites } from '../src/sim/civic/staffing';
import { DEPOTS, netFlows, openTown, spoilTown, storesIfAny, storesOf, supplyStores, viewTotal, worldGoods } from '../src/sim/civic/town-stores';
import { haulCapacity } from '../src/sim/civic/hauling';
import { total } from '../src/sim/civic/store';
import { createPlaySession } from '../src/sim/play-session/play-session';
import type { PlaySession } from '../src/sim/play-session/play-session-types';
import { saveState, serializeSave } from '../src/sim/save';
import type { SimState } from '../src/sim/types/runtime';

type Row = { name: string; ok: boolean; note: string };
const rows: Row[] = [];
const row = (name: string, ok: boolean, note: string): void => void rows.push({ name, ok, note });

// ---- Watchers around the civic tick (re-registered under the same id, so it keeps its place in the slot). ----
let drift = { coin: 0, goods: 0, dawns: 0 };
const coinTotal = (s: SimState): number =>
  (s.companies?.list ?? []).reduce((n, c) => n + c.coin, 0) + Object.values(s.companies?.purse ?? {}).reduce((n, q) => n + q, 0);
const goodsTotal = (s: SimState): number =>
  Object.values(s.villageEconomy?.towns ?? {}).reduce((n, l) => n + Object.values(l.goods).reduce((m, q) => m + q, 0), 0);
// Player-owned workshops pay out of the player's satchel (companies.ts), outside the civic tick: excluded by construction.
/** A forced case's change, made just before the civic tick (after the day's production and meal). */
let pre: ((s: SimState) => void) | undefined;
registerDawnTick('people', 'civic-sites', (s) => {
  pre?.(s);
  const c0 = coinTotal(s), g0 = goodsTotal(s);
  tickSites(s);
  drift.coin = Math.max(drift.coin, Math.abs(coinTotal(s) - c0));
  drift.goods = Math.max(drift.goods, Math.abs(goodsTotal(s) - g0));
  drift.dawns++;
});

// Revenue at the start of each dawn for companies whose site has nobody running it.
let unmanagedAtDawn = new Map<string, number>();
let producedUnmanaged: string[] = [];
let unmanagedDawns = 0;
registerDawnTick('season', 'check-civic-snap', (s) => {
  unmanagedAtDawn = new Map((s.companies?.list ?? []).filter((c) => !companyManaged(s, c)).map((c) => [c.id, c.revenue]));
  unmanagedDawns += unmanagedAtDawn.size;
});
registerDawnTick('roads', 'check-civic-produce', (s) => {
  for (const c of s.companies?.list ?? []) {
    const r = unmanagedAtDawn.get(c.id);
    if (r !== undefined && c.revenue > r + 1e-9) producedUnmanaged.push(`${c.id}@${s.day}`);
  }
});

// Goods conservation across stores, and the ledger as their view, at the end of every dawn of every run.
let goodsDrift = 0, viewDrift = 0, goodsDawns = 0;
registerDawnTick('late', 'check-civic-goods', (s) => {
  const world = worldGoods(s);
  goodsDrift = Math.max(goodsDrift, Math.abs(world - netFlows(s)) / Math.max(1, world));
  goodsDawns++;
});
registerDawnTick('prices', 'check-civic-view', (s) => {
  // Right after hauling (registered first in this slot): no one has written behind the stores' back yet.
  for (const [townId, l] of Object.entries(s.villageEconomy?.towns ?? {})) {
    if (!storesIfAny(s)?.towns[townId]) continue;
    for (const item of Object.keys(l.goods)) viewDrift = Math.max(viewDrift, Math.abs((l.goods[item] ?? 0) - viewTotal(s, townId, item)));
  }
});

function boot(seed: number): PlaySession {
  const session = createPlaySession({ mode: 'play', seed, archetypeId: 'marrow' }) as PlaySession;
  session.start({ seed, archetypeId: 'marrow' });
  return session;
}
const advance = (session: PlaySession, days: number): SimState => {
  // An idle player burns out in a few weeks (spark is scarce) and, heirless, the run ends there. These checks
  // are about the towns, not the player: keep the player's fire fed so the world turns to the dawns they need.
  for (let i = 0; i < days; i++) {
    const st = session.getState();
    if (st) st.player.spark = Math.max(st.player.spark, 80);
    session.tick();
  }
  return session.getState()!;
};
const blobAfter = (seed: number, days: number): string => serializeSave(saveState(advance(boot(seed), days)));

// ---- Determinism ----
for (const seed of [42, 7]) {
  for (const days of [30, 120]) {
    const t = Date.now();
    const a = blobAfter(seed, days), b = blobAfter(seed, days);
    row(`same ${days} dawns, seed ${seed}`, a === b, a === b ? `${a.length} bytes identical (${Date.now() - t} ms for two runs)` : 'saves differ');
  }
}
row('civic tick conserves coin', drift.coin < 1e-6 && drift.dawns > 0, `worst drift ${drift.coin.toExponential(2)} over ${drift.dawns} dawns`);
row('civic tick conserves goods', drift.goods < 1e-9, `worst ledger change ${drift.goods.toExponential(2)}`);
row('goods only change by named flows', goodsDawns > 0 && goodsDrift < 1e-6, `worst |stores+carts - (sources-sinks)| ${goodsDrift.toExponential(2)} (relative) over ${goodsDawns} dawns`);
row('ledger is the stores view', viewDrift < 1e-6, `worst ledger vs stores gap ${viewDrift.toExponential(2)}`);
row('no site produces without a manager', producedUnmanaged.length === 0, producedUnmanaged.length ? `earned while unmanaged: ${producedUnmanaged.slice(0, 5).join(' ')}` : `${unmanagedDawns} company-dawns without a manager earned nothing`);

// ---- Forced cases, each on its own world at dawn 80 ----
const staffed = (s: SimState): Site | undefined =>
  sitesIn(s).find((x) => !x.crewRun && x.source.type === 'company' && x.ownerId !== 'player' && x.workers.length > 0 && x.managerId && s.people[x.managerId]);

{
  const session = boot(42);
  const s = advance(session, 80);
  const site = staffed(s);
  if (!site) row('succession', false, 'no staffed company site at dawn 80');
  else {
    const dead = site.managerId!;
    const deadName = s.people[dead]?.name ?? dead;
    laidToRest(s, dead);
    const posted = !site.managerId && site.status === 'idle' && !!civicIfAny(s)?.news.some((n) => n.kind === 'wanted' && n.siteId === site.id && n.day === s.day);
    advance(session, 1);
    const after = civicIfAny(s)!.sites[site.id]!;
    const ok = posted && !!after.managerId && after.managerId !== dead && after.status === 'working';
    row('succession', ok, `${site.name}: ${deadName} died -> wanted posted ${posted} -> ${after.managerId ? (s.people[after.managerId]?.name ?? after.managerId) : 'nobody'} runs it (${after.status})`);
  }
}
{
  const session = boot(42);
  const s = advance(session, 80);
  const site = staffed(s);
  const c = site && s.companies!.list.find((x) => x.id === site.source.ref);
  if (!site || !c) row('unpaid hands quit', false, 'no staffed company site at dawn 80');
  else {
    const hands = [...site.workers];
    pre = (st) => { const k = st.companies!.list.find((x) => x.id === c.id); if (k) k.coin = 0; };
    advance(session, COMPANY.quitAfterUnpaid);
    pre = undefined;
    const still = hands.filter((h) => civicIfAny(s)!.sites[site.id]!.workers.includes(h));
    row('unpaid hands quit', still.length === 0, `${site.name}: ${hands.length} hands, ${still.length} left after ${COMPANY.quitAfterUnpaid} unpaid dawns`);
  }
}
{
  const session = boot(42);
  const s = advance(session, 80);
  const site = staffed(s);
  if (!site) row('unfed hands leave', false, 'no staffed company site at dawn 80');
  else {
    const hands = [...site.workers];
    const despair = s.towns![site.townId]!.despair;
    // The town's meal falls wholly short each dawn: nobody there eats.
    pre = (st) => { const l = st.villageEconomy!.towns[site.townId]!; l.short.food = l.need.food ?? 1; };
    advance(session, CIVIC.sickAfterUnfed);
    const sick = hands.filter((h) => s.people[h]?.tags?.includes('sick')).length;
    advance(session, CIVIC.leaveAfterUnfed - CIVIC.sickAfterUnfed);
    pre = undefined;
    const still = hands.filter((h) => civicIfAny(s)!.sites[site.id]!.workers.includes(h));
    const ok = sick === hands.length && still.length === 0;
    row('unfed hands leave', ok, `${site.name}: ${sick}/${hands.length} sick after ${CIVIC.sickAfterUnfed} dawns, ${still.length} still there after ${CIVIC.leaveAfterUnfed}; despair ${despair.toFixed(3)} -> ${s.towns![site.townId]!.despair.toFixed(3)}`);
  }
}

{
  // Haulers: put a pile of grain on a working site's shelves and see it carried to the granary next dawn.
  const session = boot(42);
  const s = advance(session, 80);
  const site = sitesIn(s).find((x) => !x.crewRun && x.source.type === 'company' && x.status === 'working' && haulCapacity(s, x) > 0 && !(SITE_KIND_BY_ID.get(x.kind)?.inputs ?? []).includes('grain'));
  if (!site) row('haulers carry to the granary', false, 'no working site with carriers at dawn 80');
  else {
    const ts = openTown(s, site.townId);
    const before = total(ts.granary, 'grain') + total(ts.yard, 'grain');
    // A source like any other (named, so conservation still holds): the shelves get a pile of grain.
    site.store.items.grain = total(site.store, 'grain') + 12;
    const shelf0 = site.store.items.grain;
    storesOf(s).flows['source:check'] = (storesOf(s).flows['source:check'] ?? 0) + 12;
    s.villageEconomy!.towns[site.townId]!.goods.grain = viewTotal(s, site.townId, 'grain');
    ts.seen.grain = s.villageEconomy!.towns[site.townId]!.goods.grain!;
    const carry = haulCapacity(s, site);
    advance(session, 1);
    const after = total(ts.granary, 'grain') + total(ts.yard, 'grain');
    const left = total(siteOf(s, site.id)?.store ?? site.store, 'grain');
    const ok = left < shelf0 - 1e-6;
    row('haulers carry to the granary', ok, `${site.name}: carries ${carry}/dawn (${site.haulers.length} hauler${site.haulers.length === 1 ? '' : 's'}); shelf grain ${shelf0.toFixed(1)} -> ${left.toFixed(2)}, town grain in depots ${before.toFixed(1)} -> ${after.toFixed(1)}`);
  }
}
{
  // Spoilage per good and shelter: bread in the open goes stale, timber keeps; the loss is the named sink.
  const s = advance(boot(7), 5);
  const townId = Object.keys(s.villageEconomy!.towns).sort()[0]!;
  const ts = openTown(s, townId);
  supplyStores(s, townId, 'bread', 10);
  supplyStores(s, townId, 'timber', 10);
  const bread0 = viewTotal(s, townId, 'bread'), timber0 = viewTotal(s, townId, 'timber');
  const sunk0 = storesOf(s).flows['sink:spoiled'] ?? 0;
  const lost = spoilTown(s, townId);
  const bread1 = viewTotal(s, townId, 'bread'), timber1 = viewTotal(s, townId, 'timber');
  const sunk = (storesOf(s).flows['sink:spoiled'] ?? 0) - sunk0;
  const ok = bread1 < bread0 && Math.abs(timber1 - timber0) < 1e-9 && Math.abs(sunk - lost) < 1e-9 && lost > 0 && !!ts;
  row('food spoils, timber keeps', ok, `${townId}: bread ${bread0.toFixed(2)} -> ${bread1.toFixed(2)}, timber ${timber0} -> ${timber1}; ${lost.toFixed(3)} to sink:spoiled`);
}
{
  // A save from before stores: only the ledger. The first touch builds the stores from it, goods for goods.
  const session = boot(42);
  const s = advance(session, 30);
  for (const site of sitesIn(s)) for (const item of Object.keys(site.store.items)) {
    const l = s.villageEconomy!.towns[site.townId];
    if (l) l.goods[item] = Math.max(0, (l.goods[item] ?? 0) - total(site.store, item));
    delete site.store.items[item];
  }
  for (const site of Object.values(civicIfAny(s)!.sites)) site.store.items = {};
  delete (s as { townStores?: unknown }).townStores;
  const ledger = Object.values(s.villageEconomy!.towns).reduce((n, l) => n + Object.values(l.goods).reduce((m, q) => m + Math.max(0, q), 0), 0);
  for (const townId of Object.keys(s.villageEconomy!.towns).sort()) openTown(s, townId);
  const stores = Object.values(storesIfAny(s)!.towns).reduce((n, ts) => n + DEPOTS.reduce((m, d) => m + total(ts[d]), 0), 0);
  const opening = storesIfAny(s)!.flows['source:opening'] ?? 0;
  let ran = true;
  try { advance(session, 2); } catch { ran = false; }
  const ok = Math.abs(stores - ledger) < 1e-6 * Math.max(1, ledger) && Math.abs(opening - ledger) < 1e-6 * Math.max(1, ledger) && ran;
  row('old ledgers become stores', ok, `ledger ${ledger.toFixed(1)} -> stores ${stores.toFixed(1)} (opening ${opening.toFixed(1)}); ran on: ${ran}`);
}

for (const r of rows) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name.padEnd(34)} ${r.note}`);
const failed = rows.filter((r) => !r.ok).length;
console.log(failed ? `check-civic: ${failed} failed` : `check-civic: ok (${rows.length} checks)`);
process.exit(failed ? 1 : 0);
