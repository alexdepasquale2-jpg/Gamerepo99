/**
 * The civic loop, proved on whole worlds (docs/superpowers/plans/civic/index.md, slices 1-2):
 *   - 30- and 120-dawn runs save byte-identical per seed;
 *   - the civic tick conserves coin (wages, rations and draws only move it) and goods (the town ledger is
 *     untouched by it this wave);
 *   - no company earns at a dawn its site starts with no manager;
 *   - a manager's death leaves the post wanted and the best fit takes it;
 *   - unpaid hands quit, unfed hands fall sick and leave.
 *
 * Run: npx vite-node --config game/vite.config.ts game/scripts/check-civic.mts
 */
import { civicIfAny, sitesIn, type Site } from '../src/sim/civic';
import { registerDawnTick } from '../src/sim/dawn-ticks';
import { COMPANY, companyManaged } from '../src/sim/economy/companies';
import { laidToRest } from '../src/sim/economy/mortality';
import { CIVIC } from '../src/sim/civic/sites';
import { tickSites } from '../src/sim/civic/staffing';
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

for (const r of rows) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name.padEnd(34)} ${r.note}`);
const failed = rows.filter((r) => !r.ok).length;
console.log(failed ? `check-civic: ${failed} failed` : `check-civic: ok (${rows.length} checks)`);
process.exit(failed ? 1 : 0);
