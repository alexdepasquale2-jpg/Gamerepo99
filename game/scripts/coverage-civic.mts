/**
 * Coverage for the economy / civic / polity / realm / history tables: every row id in those files must be
 * exercised by the running game, not merely loaded. Each row records itself (sim/data-use-civic noteUse)
 * at the code path where it takes effect; this script boots whole worlds headless across seeds, walks
 * into neighbouring districts, plays the player's verbs (stash, patrons, hired travellers, brokering) and
 * forces the states a short run rarely reaches (high notoriety, a war, a grown town), then fails listing
 * every id never seen.
 *
 * Run: npx vite-node --config game/vite.config.ts game/scripts/coverage-civic.mts
 */
import sitesJson from '../src/data/civic/sites.json';
import zonesJson from '../src/data/civic/zones.json';
import districtPolityJson from '../src/data/civic/district-polity.json';
import polityJson from '../src/data/items/polity.json';
import dawnStockJson from '../src/data/economy/dawn-stock.json';
import resourcesJson from '../src/data/economy/economy-resources.json';
import facilitiesJson from '../src/data/economy/facilities.json';
import workersJson from '../src/data/economy/facility-workers.json';
import notorietyJson from '../src/data/economy/notoriety.json';
import patronsJson from '../src/data/economy/patrons.json';
import stashJson from '../src/data/economy/stash-sites.json';
import tradesJson from '../src/data/economy/travel-trades.json';
import sizesJson from '../src/data/world/history/settlementSizes.json';
import woundWeightsJson from '../src/data/world/history/woundWeights.json';
import { loadHistoryTables } from '../src/sim/gen/load/load-history';
import { generateWorld } from '../src/sim/gen/world';
import { usedIds } from '../src/sim/data-use-civic';
import { createPlaySession } from '../src/sim/play-session/play-session';
import type { PlaySession } from '../src/sim/play-session/play-session-types';
import type { SimState } from '../src/sim/types/runtime';
import { applyStashAct } from '../src/sim/hoard/stash';
import { siteDefs, actDefs } from '../src/sim/hoard/state';
import { acceptDeal } from '../src/sim/patrons/deals';
import { broker, ensurePolity, liveRelations } from '../src/sim/civic/district-relations';
import { stakePlan } from '../src/sim/economy/build-plans';
import { residentsOf } from '../src/sim/civic/tiers';
import { polityMul, TECHS } from '../src/sim/economy/polity';

// ---------- every row id, by file ----------
const expected = new Map<string, string[]>();
const want = (file: string, ids: string[]): void => void expected.set(file, [...(expected.get(file) ?? []), ...ids]);
const keys = (o: object | undefined): string[] => Object.keys(o ?? {});

want('civic/sites', sitesJson.kinds.map((k) => k.id));
want('civic/zones', [
  ...zonesJson.zones.map((z) => `zone:${z.id}`),
  ...keys(zonesJson.layouts).map((k) => `layout:${k}`),
  ...zonesJson.tiers.map((t) => `tier:${t.id}`),
  ...zonesJson.civicBuildings.map((b) => `building:${b.id}`),
]);
want('civic/district-polity', [
  ...districtPolityJson.rivalStyles.map(([a, b]) => `rival:${a}|${b}`),
  ...keys(districtPolityJson.woundFeud).map((w) => `wound:${w}`),
  ...keys(districtPolityJson.tuning.broker).map((b) => `broker:${b}`),
]);
want('items/polity', [...polityJson.techs.map((t) => `tech:${t.id}`), ...polityJson.creeds.map((c) => `creed:${c.id}`)]);
const roleStock = dawnStockJson.seedStockByRole;
want('economy/dawn-stock', [
  ...keys(dawnStockJson.seedStockByTown).map((t) => `town:${t}`),
  ...keys(roleStock.base).map((k) => `base:${k}`),
  ...keys(roleStock.landBonus).map((k) => `land:${k}`),
  ...keys(roleStock.landFood).map((k) => `landFood:${k}`),
  ...keys(dawnStockJson.openingShelves.byKind).map((k) => `shelves:${k}`),
]);
want('economy/economy-resources', resourcesJson.resources.map((r) => r.id));
want('economy/facilities', [
  ...facilitiesJson.facilities.map((f) => f.id),
  ...keys(facilitiesJson.roles.byLand).map((k) => `byLand:${k}`),
  ...keys(facilitiesJson.roles.byTownKind).map((k) => `byTownKind:${k}`),
]);
want('economy/facility-workers', workersJson.byKind.flatMap((b) => [`kind:${b.facilityKind}`, `shift:${b.facilityKind}`, ...b.workers.map((w) => `worker:${w.id}`)]));
want('economy/notoriety', [...notorietyJson.gains, ...notorietyJson.losses, ...notorietyJson.attractors].map((r) => r.id));
want('economy/patrons', patronsJson.patrons.flatMap((p) => [p.id, ...p.deals.map((d) => `deal:${d.id}`)]));
want('economy/stash-sites', [
  ...stashJson.sites.map((s) => `site:${s.id}`),
  ...keys(stashJson.roles.byKind).map((k) => `byKind:${k}`),
  ...stashJson.acts.map((a) => `act:${a.id}`),
]);
want('economy/travel-trades', [...tradesJson.trades.map((t) => `trade:${t.id}`), ...tradesJson.fastRouteUnlocks.map((u) => `unlock:${u.id}`)]);
want('world/history/historyBeats', loadHistoryTables().historyBeats.map((b) => b.id));
want('world/history/settlementSizes', sizesJson.settlementSizes.map((s) => s.id));
want('world/history/woundWeights', woundWeightsJson.woundWeights.map((w) => w.woundId));

// ---------- play ----------
const t0 = Date.now();
const boot = (seed: number): PlaySession => {
  const s = createPlaySession({ mode: 'play', seed, archetypeId: 'marrow' }) as PlaySession;
  s.start({ seed, archetypeId: 'marrow' });
  return s;
};
const st = (s: PlaySession): SimState => s.getState()!;

/** The player's stash verbs where they stand: hide coin, store goods, hire a guard, take it all back. */
function stashPlay(s: PlaySession): void {
  const state = st(s);
  state.player.coin = 200;
  for (const a of actDefs(state)) applyStashAct(state, a.id);
}

/** Every road out of here: ride with each traveller on offer today (a few days of offers), then walk back. */
function roadPlay(s: PlaySession, days: number): void {
  for (let d = 0; d < days; d++) {
    for (const road of s.roads()) {
      for (const o of road.offers) {
        const state = st(s);
        state.player.spark = Math.max(state.player.spark, 60);
        state.player.coin = Math.max(state.player.coin ?? 0, 40);
        const r = s.journey(road.routeId, o.tradeId);
        if (r?.ok) stashPlay(s);
        if (r?.ok) { const back = s.roads().find((x) => x.toId === road.toId || x.routeId === road.routeId); if (back) s.journey(back.routeId); }
      }
    }
    s.wait(1);
  }
}

/** Answer every caller at the player's door (visitors): pay, refuse, confront, give — each a notoriety row. */
function visitorPlay(s: PlaySession): void {
  const state = st(s);
  state.player.coin = Math.max(state.player.coin ?? 0, 60);
  for (const id of Object.keys(state.people).sort()) {
    if (!state.people[id]!.tags?.some((t) => t.startsWith('visitor'))) continue;
    const acts = s.listActions(id).map((a) => a.id).filter((a) => a.startsWith('call_') && !a.startsWith('call_ask'));
    // Refusing or confronting first where offered (they name you), else whatever the caller allows.
    const pick = acts.find((a) => a.startsWith('call_confront')) ?? acts.find((a) => a.startsWith('call_coin')) ?? acts[(st(s).day + id.length) % Math.max(1, acts.length)];
    if (pick) s.act(pick);
  }
}

/** Lend a hand at every facility's work spot in reach today (a shift's share comes home). */
function shiftPlay(s: PlaySession): void {
  for (const townId of Object.keys(st(s).towns ?? {})) {
    for (const t of s.tasksNear(townId)) if (t.source.type === 'facility') { delete st(s).flags.facilityShiftDay; s.workAt(t.id); }
  }
}

const SEEDS = Number(process.env.COVER_SEEDS ?? 24);
for (let seed = 1; seed <= SEEDS; seed++) {
  const s = boot(seed);
  const state = st(s);
  // Notoriety high enough that every attractor can fire and patrons open their books.
  state.hoard = { ...(state.hoard ?? { stash: {}, peakCoin: 0, reigniteCount: 0, lastStashActDay: 0 }), notoriety: 0.9 } as SimState['hoard'];
  for (let d = 0; d < 40; d++) { s.wait(1); visitorPlay(s); if (d % 10 === 0) shiftPlay(s); }
  // A big spend in one day (guards and their keep): the flash-spend row.
  st(s).player.coin = 400;
  stashPlay(s);
  // Patrons: accept each deal on the table (the broker's chip plays acceptDeal).
  for (const p of patronsJson.patrons) for (const d of p.deals) acceptDeal(st(s), p.id, d.id);
  // A friend on the road: bonds with everyone a fast road names.
  const lg = ((st(s) as { legacy?: { bonds: Record<string, { events: Record<string, number>; resentment: number }> } }).legacy ??= { bonds: {} } as never);
  for (const u of tradesJson.fastRouteUnlocks) for (const p of u.when.minBondWithAny) (lg.bonds ??= {})[p] = { events: { kept_word: 9 }, resentment: 0 };
  roadPlay(s, 3);
  // A town grown big: stake every civic kind (its tier gate is the council's; the founding flag skips it).
  for (const townId of Object.keys(st(s).towns ?? {})) {
    const owner = residentsOf(st(s), townId)[0];
    if (owner) for (const b of zonesJson.civicBuildings) stakePlan(st(s), owner, townId, b.id, { built: true, founding: true });
  }
  // A mill town in every other seed: towns reach village soon enough now to raise workshops over mills, so
  // the grain fork's water wheel (a town with more mills than farms) needs one town that kept to milling.
  const millTown = seed % 2 === 0 ? Object.keys(st(s).towns ?? {}).sort()[0] : undefined;
  const miller = millTown ? residentsOf(st(s), millTown)[0] : undefined;
  if (miller) for (let i = 0; i < 2; i++) stakePlan(st(s), miller, millTown!, 'mill', { built: true, founding: true });
  s.wait(60);
  // Each tech a town holds pays out through polityMul; a long run lets every fork be taken somewhere.
  for (const townId of Object.keys(st(s).towns ?? {})) polityMul(st(s), townId, 'farmer');
  // Brokering: force a war with one neighbour (peace to broker) and warm trust with another (a pact).
  const rels = liveRelations(st(s));
  if (rels[0]) { rels[0].state = 'war'; rels[0].warEnds = st(s).day + 20; }
  if (rels[1]) { rels[1].trust = 40; rels[1].state = 'peace'; }
  for (let i = 0; i < 2; i++) { st(s).player.spark = 99; broker(st(s)); s.wait(1); }
  // Other districts: their own towns (role stock, role facilities, stash spots), their own folk.
  for (const road of s.trunkRoads().slice(0, 3)) {
    st(s).player.spark = 99;
    if (s.journeyDistrict(road.to)) { s.wait(5); stashPlay(s); roadPlay(s, 1); s.wait(20); }
  }
  ensurePolity(st(s));
  void TECHS;
  console.log(`seed ${seed} done (${((Date.now() - t0) / 1000).toFixed(0)}s, ${usedIds().size} ids seen)`);
}

// The world's past across many more seeds (worldgen alone is cheap): the history chains each seed draws.
for (let seed = 1; seed <= 400; seed++) generateWorld({ seed, includeAnchors: true, peopleCount: 60 });

// ---------- report ----------
const seen = usedIds();
let missing = 0, total = 0;
for (const [file, ids] of expected) {
  const gone = [...new Set(ids)].filter((id) => !seen.has(`${file}#${id}`));
  total += new Set(ids).size;
  missing += gone.length;
  console.log(`${gone.length ? 'MISS' : 'ok  '} ${file}: ${new Set(ids).size - gone.length}/${new Set(ids).size}${gone.length ? `  uncovered: ${gone.join(', ')}` : ''}`);
}
console.log(`\n${total - missing}/${total} rows exercised${missing ? `, ${missing} uncovered` : ''}.`);
process.exit(missing ? 1 : 0);
