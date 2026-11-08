/**
 * The level-of-detail day: what a stretch of days does to a district without running every person's
 * dawn. Used for long waits (civic/clock fastForward past FULL_DAYS) and for districts you were away
 * from (play-session enterDistrict, the away summaries in sim/realm-away). Its cost is a few scalars per
 * town per day plus one pass over the people for the whole window, so a hundred days cost about what a
 * handful of full dawns do.
 *
 * Per town, day by day (the same rules the dawn applies, on aggregates):
 *   - goods: each trade's recipes run at their expected rate (chance x workers x workshop/polity muls),
 *     limited by inputs in store; route deliveries as economy-lod makes them; spoilage; households eat.
 *   - despair: neglect, starvation and broken roads add (capped per dawn); burning people ease it.
 *   - doctrines: the dawn's own tick (cheap: a handful of meters), fed the same supply hook on hunger.
 * Once for the window: age and the hazard of death, retirement, couples, births as rates over the days
 * (real children, real deaths with heirs and stones), and coming of age. Happenings get one draw per
 * HAPPENING_EVERY days (a reduced rate: fewer things come to pass while nobody watches).
 * Pure + deterministic (deriveRng keyed on the window's first day), never Math.random.
 */
import type { DataTables } from '../load-data';
import { tickDoctrines } from '../doctrine-tick';
import { tickHappenings } from '../happenings';
import { JOBS } from '../goods/jobs';
import { tickCompanies, workJobId } from '../economy/companies';
import { tickBuildPlans, workshopMul } from '../economy/build-plans';
import { birthMul, polityMul, tickPolity } from '../economy/polity';
import { facilityStaffMul } from '../economy/facilities';
import { HOUSEHOLD } from '../economy/village-economy';
import { addStock, foodHave, foodStarving, isFoodRes, shortLine, spoilFood, takeFood, FOOD_RES } from '../economy/food-stock';
import { LOGISTICS } from '../economy/logistics';
import { ITEMS } from '../goods/inventory';
import { bearChild, formCouples, growUp, KIN, security } from '../economy/households';
import { deathless, hazard, isRetired, laidToRest, LIFE, retire } from '../economy/mortality';
import { deriveRng, type Rng } from '../rng';
import type { SimState } from '../types/runtime';

/** One happening draw per this many days of LOD (the full dawn draws every day). */
export const HAPPENING_EVERY = 7;
/**
 * The town's own growth (build plans, companies hiring, techs and creeds) is the slow part of a dawn
 * that changes what a town makes: it runs whole, but only every DEVELOP_EVERY days, and the trades and
 * multipliers the goods day reads are re-read after it.
 */
export const DEVELOP_EVERY = 2;

/** What a window did, for the morning's news (civic/clock keeps the last one; contrib/clock tells it). */
export type LodReport = { from: number; to: number; born: string[]; died: string[]; grown: number; wed: number };

type Ledger = { goods: Record<string, number>; need: Record<string, number>; short: Record<string, number> };
type Flow = { item: string; perDay: number };
type TownRun = { id: string; ledger: Ledger; pop: number; jobs: { jobId: string; workers: number; mul: number }[]; inflow: Flow[] };

const folkOf = (state: SimState, townId: string) =>
  Object.values(state.people).filter((p) => p.townId === townId && !isRetired(p));

/** Route deliveries per day into a town, as economy-lod steps 1–2 make them (facilities at today's crew). */
function routeInflow(state: SimState, townId: string, data: DataTables): Flow[] {
  const lod = data.economyLod;
  const byId = new Map(data.facilities.map((f) => [f.id, f]));
  const out = new Map<string, number>();
  for (const route of state.economyRoutes ?? []) {
    if (route.fromTownId !== townId && route.toTownId !== townId) continue;
    if (route.broken && lod.flow.skipWhenRouteBroken) continue;
    const ext = lod.flow.extractiveDefaults;
    const share = route.receiveShare?.[townId] ?? (route.extractive ? (townId === route.toTownId ? ext.city : ext.village) : 0);
    if (!(share > 0)) continue;
    for (const fid of route.facilityIds) {
      const fac = byId.get(fid);
      if (!fac) continue;
      for (const o of fac.outputs) {
        const q = o.qtyPerDawn * fac.staffedMul * facilityStaffMul(state, fac.id, fac.kind) * route.condition * share;
        if (q > 0) out.set(o.resourceId, (out.get(o.resourceId) ?? 0) + q);
      }
    }
  }
  return [...out].sort(([a], [b]) => a.localeCompare(b)).map(([item, perDay]) => ({ item, perDay }));
}

function townRuns(state: SimState, data: DataTables | undefined): TownRun[] {
  const ve = (state.villageEconomy ??= { towns: {} });
  const byTown = new Map<string, string[]>(Object.keys(state.towns ?? {}).map((id) => [id, []]));
  for (const p of Object.values(state.people)) if (p.townId) (byTown.get(p.townId) ?? byTown.set(p.townId, []).get(p.townId)!).push(p.id);
  const kidsBy = new Map<string, number>();
  for (const c of state.kin?.children ?? []) if (c.status === 'child') kidsBy.set(c.townId, (kidsBy.get(c.townId) ?? 0) + 1);
  return [...byTown.keys()].sort().map((id) => {
    const people = byTown.get(id)!;
    const kids = kidsBy.get(id) ?? 0;
    const count = new Map<string, number>();
    for (const pid of people) { const j = workJobId(state, pid); count.set(j, (count.get(j) ?? 0) + 1); }
    // JOBS order, as the village economy runs them: raw trades before the processors that use their output.
    const jobs = JOBS.filter((j) => count.has(j.id)).map((j) => ({ jobId: j.id, workers: count.get(j.id)!, mul: workshopMul(state, id, j.id) * polityMul(state, id, j.id) }));
    const town = state.towns?.[id];
    return {
      id,
      ledger: (ve.towns[id] ??= { goods: {}, need: {}, short: {} }),
      pop: people.length + 0.5 * kids,
      jobs,
      inflow: town?.economyOptIn && data?.economyLod ? routeInflow(state, id, data) : [],
    };
  });
}

/** One aggregate day of a town's goods: deliveries, spoilage, expected production, households eat. */
function goodsDay(state: SimState, t: TownRun, data: DataTables | undefined): void {
  const g = t.ledger.goods;
  for (const f of t.inflow) addStock(state, t.id, f.item, f.perDay);
  const town = state.towns?.[t.id];
  if (data?.dawnStock?.spoil.apply && town) {
    const floor = data.dawnStock.stockFloor;
    for (const r of data.economyResources) {
      if (isFoodRes(r.id)) spoilFood(state, t.id, r.spoilPerDawn, floor);
      else if (r.spoilPerDawn > 0 && typeof town.stock[r.id] === 'number') town.stock[r.id] = Math.max(floor, town.stock[r.id]! * (1 - r.spoilPerDawn));
    }
  }
  for (const j of t.jobs) {
    for (const r of JOBS.find((x) => x.id === j.jobId)!.recipes) {
      let runs = j.workers * (r.chance ?? 1);
      for (const [item, q] of Object.entries(r.in ?? {})) runs = Math.min(runs, Math.max(0, g[item] ?? 0) / q);
      if (!(runs > 0)) continue;
      for (const [item, q] of Object.entries(r.in ?? {})) g[item] = (g[item] ?? 0) - q * runs;
      for (const [item, q] of Object.entries(r.out)) g[item] = (g[item] ?? 0) + q * runs * j.mul;
    }
  }
  // Households eat and wear things out exactly as the village economy has them (need and short included,
  // so tomorrow's starve check reads the same ledger fields).
  const l = t.ledger;
  l.need = {}; l.short = {};
  let food = t.pop * HOUSEHOLD.food.perPerson;
  l.need.food = food;
  for (const item of HOUSEHOLD.food.eats) { const take = Math.min(food, g[item] ?? 0); g[item] = (g[item] ?? 0) - take; food -= take; }
  if (food > 1e-9) l.short.food = food;
  for (const [item, per] of Object.entries(HOUSEHOLD.goods)) {
    const want = t.pop * per, take = Math.min(want, g[item] ?? 0);
    g[item] = (g[item] ?? 0) - take;
    l.need[item] = want;
    if (want - take > 1e-9) l.short[item] = want - take;
  }
}

/**
 * The roads between towns, folded: a town under its food shortage line gets a day's cart from the town
 * with the most to spare above its reserve (logistics' rule), and every unit that lands in a shortage
 * eases despair as a caravan's crate does (caravan-visit). Carts in the dark are not drawn or lost.
 */
function haulDay(state: SimState, runs: TownRun[]): void {
  for (const t of runs) {
    const line = shortLine(state, t.id, FOOD_RES), have = foodHave(state, t.id);
    if (have >= line) continue;
    const spare = (o: TownRun): number => foodHave(state, o.id) - LOGISTICS.reserveDays * (o.ledger.need.food ?? 0);
    const from = runs.filter((o) => o !== t && spare(o) > 0).sort((a, b) => spare(b) - spare(a) || a.id.localeCompare(b.id))[0];
    if (!from) continue;
    // Whole crates, as a cart carries them: each one that lands while the town is still short eases it.
    const crates = Math.min(Math.ceil(line - have), Math.floor(spare(from)), LOGISTICS.cartCapacity);
    const town = state.towns?.[t.id];
    for (let i = 0; i < crates; i++) {
      if (town?.economyOptIn && foodHave(state, t.id) < line) town.despair = Math.max(0, town.despair - ITEMS.deeds.shortageDespairRelief);
      addStock(state, t.id, FOOD_RES, takeFood(state, from.id, 1));
    }
  }
}

/**
 * One aggregate day of a town's despair: economy-lod's neglect, starve, broken-road and flame-relief rules
 * (opted-out towns are not simulated, at a dawn or here).
 */
function despairDay(state: SimState, townId: string, lit: number, data: DataTables): void {
  const town = state.towns?.[townId];
  const cfg = data.economyLod?.despair as (DataTables['economyLod']['despair'] & {
    neglect?: { enabled?: boolean; onNeglect: number; graceDawns: number; neglectCap: number };
    flameRelief?: { perDawn: number; minShare: number };
  }) | undefined;
  if (!town?.economyOptIn || !cfg) return;
  const [lo, hi] = cfg.clamp;
  const hook = state.economyHooks?.doctrine;
  let add = 0;
  for (const r of state.economyRoutes ?? []) {
    if ((r.fromTownId !== townId && r.toTownId !== townId) || !r.broken || !data.economyLod.flow.skipWhenRouteBroken) continue;
    add += cfg.onRouteBroken;
    hook?.(state, { townId, reason: 'route_broken', deltaRealDelivery: cfg.doctrineRealDeliveryHitOnBroken });
  }
  if (foodStarving(state, townId, cfg.starveWhenFoodBelow)) {
    add += cfg.onStarve;
    hook?.(state, { townId, reason: 'starve', deltaRealDelivery: 0 });
  }
  const neg = cfg.neglect;
  if (neg?.enabled) {
    const last = (state.flags.lastTouchDayByTown as Record<string, number> | undefined)?.[townId];
    const neglected = last === undefined ? state.day >= neg.graceDawns : state.day - last >= neg.graceDawns;
    if (neglected && town.despair < neg.neglectCap) add += Math.min(neg.onNeglect, neg.neglectCap - town.despair);
  }
  add = Math.min(add, cfg.maxAddPerDawn);
  if (add > 0) town.despair = Math.min(hi, Math.max(lo, town.despair + add));
  const relief = cfg.flameRelief;
  if (relief && lit >= relief.minShare && town.despair > lo) town.despair = Math.max(lo, town.despair - relief.perDawn * lit);
}

/** Poisson-ish count for an expected `mean` (Knuth; means here are small). */
function countOf(rng: Rng, mean: number): number {
  if (!(mean > 0)) return 0;
  const limit = Math.exp(-Math.min(mean, 30));
  let k = 0, p = rng.next();
  while (p > limit && k < 60) { k++; p *= rng.next(); }
  return k;
}

/** Aging, retirement and death over the window, each person rolled once for the whole stretch. */
function lifeOver(state: SimState, from: number, to: number, rep: LodReport): void {
  const days = to - from;
  const birthdays = Math.floor(to / LIFE.yearDays) - Math.floor(from / LIFE.yearDays);
  const struckPerTown = new Map<string, number>();
  for (const id of Object.keys(state.people).sort()) {
    const p = state.people[id];
    if (!p) continue;
    if (p.age === undefined) p.age = deriveRng(state.seed, 'first-age', id).int(LIFE.firstAge[0], LIFE.firstAge[1]);
    const age0 = p.age;
    p.age += birthdays;
    const rng = deriveRng(state.seed, 'lod-life', from, id);
    // Retirement: one chance per birthday past retireAge (or certain by retireBy), as the dawn has it.
    const tries = Math.max(0, Math.min(birthdays, p.age - LIFE.retireAge + 1));
    const roll = rng.next();
    if (!isRetired(p) && !p.tags?.includes('legacy_player') && (p.age >= LIFE.retireBy || (tries > 0 && roll < 1 - (1 - LIFE.retireChance) ** tries))) retire(state, id);
    if (deathless(state, p)) continue;
    // The dawn strikes at most one person a town a day, and maxDeathsPerDawn in all: the window keeps both caps.
    const town = p.townId ?? id;
    if ((struckPerTown.get(town) ?? 0) >= days || rep.died.length >= LIFE.maxDeathsPerDawn * days) continue;
    const perDay = hazard((age0 + p.age) / 2) / LIFE.yearDays;
    if (p.age < LIFE.oldest && rng.next() >= 1 - (1 - perDay) ** days) continue;
    const name = p.name ?? id;
    if (laidToRest(state, id)) { struckPerTown.set(town, (struckPerTown.get(town) ?? 0) + 1); rep.died.push(name); }
  }
}

/** Couples, then births as a rate over the days each household could have them, then coming of age. */
function kinOver(state: SimState, from: number, to: number, rep: LodReport): void {
  const days = to - from;
  const before = state.kin?.households.length ?? 0;
  // A couple that forms in the window is dated to its expected day (a dawn's chance waits ~1/chance days),
  // so its children have the rest of the window, as they would day by day.
  formCouples(state, 1 - (1 - KIN.pairChance) ** days, from + Math.min(Math.ceil(days / 2), Math.round(1 / KIN.pairChance)));
  rep.wed = (state.kin?.households.length ?? 0) - before;
  for (const h of [...(state.kin?.households ?? [])].sort((a, z) => a.id.localeCompare(z.id))) {
    if (h.adults.length < 2 || !h.adults.every((a) => state.people[a])) continue;
    const opens = Math.max(from, h.formed + KIN.settleDays);
    if (opens >= to || h.kids.length >= KIN.maxKids) continue;
    const sec = security(state, h);
    if (sec < KIN.birthSecurity) continue;
    const rng = deriveRng(state.seed, 'lod-birth', from, h.id);
    const n = Math.min(KIN.maxKids - h.kids.length, countOf(rng, (to - opens) * KIN.birthChance * birthMul(state, h.townId)));
    for (let i = 0; i < n; i++) {
      const born = opens + 1 + rng.int(0, to - opens);
      rep.born.push(bearChild(state, h, sec, rng, born).given);
    }
  }
  const grownBefore = (state.kin?.children ?? []).filter((c) => c.status === 'adult').length;
  growUp(state);
  rep.grown = (state.kin?.children ?? []).filter((c) => c.status === 'adult').length - grownBefore;
}

/**
 * Run the district through days (state.day, state.day + days] on aggregates; state.day ends on the last.
 * `daily` runs each day too (civic/clock passes the player's own clocks: mail on the road, packets).
 */
export function lodDays(state: SimState, days: number, daily?: (state: SimState) => void): LodReport {
  const from = state.day, to = from + Math.max(0, Math.floor(days));
  const rep: LodReport = { from, to, born: [], died: [], grown: 0, wed: 0 };
  if (to <= from) return rep;
  const data = state.data as DataTables | undefined;
  const burnAt = data?.reigniteThreshold ?? 35;
  let runs = townRuns(state, data);
  // The share burning is held for the window: flames move by deeds, and nobody is acting here.
  const lit = new Map(runs.map((t) => {
    const folk = folkOf(state, t.id);
    return [t.id, folk.length ? folk.filter((p) => p.flame >= burnAt).length / folk.length : 0];
  }));
  for (let d = from + 1; d <= to; d++) {
    state.day = d;
    // Despair first, as the dawn has it: yesterday's hunger (the ledger's short) is what starves today.
    if (data) for (const t of runs) despairDay(state, t.id, lit.get(t.id) ?? 0, data);
    for (const t of runs) goodsDay(state, t, data);
    haulDay(state, runs);
    if ((d - from) % DEVELOP_EVERY === 0) {
      tickBuildPlans(state);
      tickCompanies(state);
      tickPolity(state);
      runs = townRuns(state, data);
    }
    if (state.towns && data?.doctrines) tickDoctrines(state);
    if ((d - from) % HAPPENING_EVERY === 0 || d === to) tickHappenings(state);
    daily?.(state);
  }
  lifeOver(state, from, to, rep);
  kinOver(state, from, to, rep);
  return rep;
}

/**
 * Food a district makes less what it eats in a day, as the goods day would reckon it with full stores
 * (expected recipes, route deliveries, households): an away summary drifts by it (civic/lod-away).
 */
export function foodPerDay(state: SimState): number {
  const data = state.data as DataTables | undefined;
  const food = new Set(HOUSEHOLD.food.eats);
  const isFood = (item: string): boolean => food.has(item) || isFoodRes(item);
  let net = 0;
  for (const t of townRuns(state, data)) {
    for (const j of t.jobs) {
      for (const r of JOBS.find((x) => x.id === j.jobId)!.recipes) {
        const made = Object.entries(r.out).reduce((n, [i, q]) => n + (isFood(i) ? q * j.mul : 0), 0);
        const used = Object.entries(r.in ?? {}).reduce((n, [i, q]) => n + (isFood(i) ? q : 0), 0);
        net += j.workers * (r.chance ?? 1) * (made - used);
      }
    }
    for (const f of t.inflow) if (isFood(f.item)) net += f.perDay;
    net -= t.pop * HOUSEHOLD.food.perPerson;
  }
  return net;
}

/** Food in a district's towns (for summaries and the perf comparison). */
export const districtFood = (state: SimState): number =>
  Object.keys(state.towns ?? {}).reduce((n, id) => n + foodHave(state, id), 0);
