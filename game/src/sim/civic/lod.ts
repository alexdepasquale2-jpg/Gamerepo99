/**
 * The level-of-detail day: what a stretch of days does to a district without running every person's
 * dawn. Used for long waits (civic/clock fastForward past FULL_DAYS) and for districts you were away
 * from (play-session enterDistrict, the away summaries in sim/realm-away). Its saving is the people:
 * nobody's work is rolled one by one and nobody's life is rolled day by day.
 *
 * Each day, per town, on aggregates:
 *   - goods: each trade's recipes run at their expected rate (chance x workers x workshop/polity muls),
 *     limited by inputs in store; households eat. A company's hands work its trade only while its site
 *     has a manager (companies workJobId: an idle site's hands work their own trade), and its till takes
 *     the share of what they make that creditCompany books at a dawn.
 * The dawn's own ticks, in the dawn's order. Daily: build plans, doctrines, the caravans and the live
 * district's war (the levy, fed from the seat). Stepped every few days, each step counting all its days
 * (the *_EVERY constants below): the economy LOD (route deliveries, facility crews, spoilage,
 * starve/neglect/broken-road despair, flame relief), the civic sites (civic/staffing: empty posts posted
 * and filled, wages, rations, the unfed falling sick and leaving, hiring), the carts (logistics: the goods
 * build plans wait on), store spoilage (as the dawn's hauling has it) and the live district's relations.
 * Without these a long wait drifted from the dawns: no carts meant no finished workshops, no companies
 * and no coin; no war, no levy to feed (perf-civic, seed 42: food 595 against the dawns' 366).
 * Slower: companies, borders and polity every DEVELOP_EVERY days, the realm's far pairs every FAR_EVERY,
 * and happenings get one draw per HAPPENING_EVERY days (fewer things come to pass while nobody watches).
 * Every LIFE_EVERY days: age and the hazard of death, retirement, couples, births as rates over those
 * days (real children, who then eat; real deaths with heirs and stones), and coming of age.
 * Pure + deterministic (deriveRng keyed on each stretch's first day), never Math.random.
 */
import type { DataTables } from '../load-data';
import { tickDoctrines } from '../doctrine-tick';
import { tickStoryteller } from '../storyteller/director';
import { JOBS } from '../goods/jobs';
import { ITEM_BY_ID } from '../goods/inventory';
import { COMPANY, companyManaged, companyOf, tickCompanies, workJobId, type Company } from '../economy/companies';
import { tickBuildPlans, workshopMul } from '../economy/build-plans';
import { tickBorders } from '../economy/borders';
import { tickEconomyLod } from '../economy/economy-lod';
import { birthMul, polityMul, tickPolity } from '../economy/polity';
import { facilityStaffMul } from '../economy/facilities';
import { HOUSEHOLD } from '../economy/village-economy';
import { foodHave, isFoodRes } from '../economy/food-stock';
import { tickLogistics } from '../economy/logistics';
import { bearChild, formCouples, growUp, KIN, security } from '../economy/households';
import { deathless, hazard, isRetired, laidToRest, LIFE, retire } from '../economy/mortality';
import { deriveRng, type Rng } from '../rng';
import type { SimState } from '../types/runtime';
import { tickDistrictRelations } from './district-relations';
import { tickLiveWar } from './district-war';
import { tickSites } from './staffing';
import { spoilTown } from './town-stores';

/** One happening draw per this many days of LOD (the full dawn draws every day). */
export const HAPPENING_EVERY = 7;
/**
 * Every this many days: companies are founded (finished workshops open for trade), borders and the towns'
 * polity (trust, feuds, techs, raids) step, and the hands the goods day counts are re-read.
 */
export const DEVELOP_EVERY = 2;
/**
 * The realm's far pairs of districts step every this many days (one day's worth each time); the live
 * district's own pairs step every RELATIONS_EVERY days for all of them (their wars raise the levy and
 * eat the seat's food). Far wars are only news here.
 */
export const FAR_EVERY = 14;
/**
 * Births, deaths and retirements land every LIFE_EVERY days rather than once at the window's end, so a
 * child born in the stretch eats in it and the dead stop eating.
 */
export const LIFE_EVERY = 10;
/*
 * Stepped ticks: each runs every N days (and on the stretch's last day, so no day is dropped) with its
 * per-day amounts scaled by the days the step stands for. Daily they made a 100-day wait cost a third or
 * more of the full dawns; stepped, about a quarter (scripts/perf-civic.mts). Over 16 seeds food in store
 * agrees with the dawns within half on 13 (14 when daily) and coin on 13 (12 daily), and the daily LOD's
 * food ran high on most seeds (it lacked store spoilage): coin follows which workshops get built, one
 * run's luck either way. Build plans stay daily:
 * a plan grabs its goods as they are made, before the processors eat them (stepped, seed 42 founded 2
 * companies against the dawns' 9, and coin wandered); so do new ambitions (rolled every few days with the
 * chance compounded, agreement fell to 11 of 16 on both).
 */
/** The economy LOD (economy/economy-lod): deliveries, despair and relief per day, spoilage compounded. */
export const ECONOMY_EVERY = 4;
/** The civic sites (civic/staffing): wages and rations for every day of the step, one round of hiring. */
export const SITES_EVERY = 3;
/** The carts (economy/logistics): travel, the road's hazard and each town's departures for the step. */
export const CARTS_EVERY = 4;
/** Store spoilage (civic/town-stores spoilTown, the dawn's hauling slot): each day's rate compounded. */
export const SPOIL_EVERY = 5;
/** The live district's own relations (civic/district-relations): their drifts scaled by the step. */
export const RELATIONS_EVERY = 5;

/** What a window did, for the morning's news (civic/clock keeps the last one; contrib/clock tells it). */
export type LodReport = { from: number; to: number; born: string[]; died: string[]; grown: number; wed: number };

type Ledger = { goods: Record<string, number>; need: Record<string, number>; short: Record<string, number> };
type Flow = { item: string; perDay: number };
/** Hands of one trade; `company`: the managed company they make for (its till is credited). */
type JobRun = { jobId: string; workers: number; mul: number; company?: Company };
type TownRun = { id: string; ledger: Ledger; pop: number; jobs: JobRun[] };

const JOB_RANK = new Map(JOBS.map((j, i) => [j.id, i]));
const JOB_BY_ID = new Map(JOBS.map((j) => [j.id, j]));

/** Route deliveries per day into a town, as economy-lod makes them (facilities at today's crew): for the away rates. */
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

function townRuns(state: SimState): TownRun[] {
  const ve = (state.villageEconomy ??= { towns: {} });
  const byTown = new Map<string, string[]>(Object.keys(state.towns ?? {}).map((id) => [id, []]));
  for (const p of Object.values(state.people)) if (p.townId) (byTown.get(p.townId) ?? byTown.set(p.townId, []).get(p.townId)!).push(p.id);
  const kidsBy = new Map<string, number>();
  for (const c of state.kin?.children ?? []) if (c.status === 'child') kidsBy.set(c.townId, (kidsBy.get(c.townId) ?? 0) + 1);
  return [...byTown.keys()].sort().map((id) => {
    const people = byTown.get(id)!;
    const kids = kidsBy.get(id) ?? 0;
    // Hands grouped by trade and by the company they make for.
    const groups = new Map<string, { jobId: string; workers: number; company?: Company }>();
    for (const pid of people) {
      const jobId = workJobId(state, pid);
      const c = companyOf(state, pid);
      const company = c && companyManaged(state, c) ? c : undefined;
      const key = `${jobId}|${company?.id ?? ''}`;
      const g = groups.get(key) ?? groups.set(key, { jobId, workers: 0, company }).get(key)!;
      g.workers += 1;
    }
    // JOBS order, as the village economy runs them: raw trades before the processors that use their output.
    const jobs: JobRun[] = [...groups.entries()]
      .filter(([, g]) => JOB_RANK.has(g.jobId))
      .sort(([ka, a], [kb, b]) => JOB_RANK.get(a.jobId)! - JOB_RANK.get(b.jobId)! || ka.localeCompare(kb))
      .map(([, g]) => ({ ...g, mul: workshopMul(state, id, g.jobId) * polityMul(state, id, g.jobId) }));
    return { id, ledger: (ve.towns[id] ??= { goods: {}, need: {}, short: {} }), pop: people.length + 0.5 * kids, jobs };
  });
}

/** One aggregate day of a town's goods: expected production (and the tills' share), households eat. */
function goodsDay(t: TownRun): void {
  const g = t.ledger.goods;
  for (const j of t.jobs) {
    for (const r of JOB_BY_ID.get(j.jobId)!.recipes) {
      let runs = j.workers * (r.chance ?? 1);
      for (const [item, q] of Object.entries(r.in ?? {})) runs = Math.min(runs, Math.max(0, g[item] ?? 0) / q);
      if (!(runs > 0)) continue;
      for (const [item, q] of Object.entries(r.in ?? {})) g[item] = (g[item] ?? 0) - q * runs;
      let worth = 0;
      for (const [item, q] of Object.entries(r.out)) {
        g[item] = (g[item] ?? 0) + q * runs * j.mul;
        worth += q * runs * j.mul * (ITEM_BY_ID.get(item)?.price ?? 0);
      }
      // The till's share of the sale, as creditCompany books each member's make at a dawn.
      if (j.company) {
        j.company.coin += worth * COMPANY.revenueShare;
        j.company.revenue += worth * COMPANY.revenueShare;
      }
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

/** Poisson-ish count for an expected `mean` (Knuth; means here are small). */
function countOf(rng: Rng, mean: number): number {
  if (!(mean > 0)) return 0;
  const limit = Math.exp(-Math.min(mean, 30));
  let k = 0, p = rng.next();
  while (p > limit && k < 60) { k++; p *= rng.next(); }
  return k;
}

/** Aging, retirement and death over a stretch, each person rolled once for the whole of it. */
function lifeOver(state: SimState, from: number, to: number, rep: LodReport): void {
  const days = to - from;
  const birthdays = Math.floor(to / LIFE.yearDays) - Math.floor(from / LIFE.yearDays);
  const struckPerTown = new Map<string, number>();
  const diedBefore = rep.died.length;
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
    // The dawn strikes at most one person a town a day, and maxDeathsPerDawn in all: the stretch keeps both caps.
    const town = p.townId ?? id;
    if ((struckPerTown.get(town) ?? 0) >= days || rep.died.length - diedBefore >= LIFE.maxDeathsPerDawn * days) continue;
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
  // A couple that forms in the stretch is dated to its expected day (a dawn's chance waits ~1/chance days),
  // so its children have the rest of the stretch, as they would day by day.
  formCouples(state, 1 - (1 - KIN.pairChance) ** days, from + Math.min(Math.ceil(days / 2), Math.round(1 / KIN.pairChance)));
  rep.wed += (state.kin?.households.length ?? 0) - before;
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
  rep.grown += (state.kin?.children ?? []).filter((c) => c.status === 'adult').length - grownBefore;
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
  let runs = townRuns(state);
  let lived = from, economyAt = from, sitesAt = from, cartsAt = from, relationsAt = from, spoiledAt = from;
  for (let d = from + 1; d <= to; d++) {
    state.day = d;
    const n = d - from;
    // The dawn's order: the economy LOD (yesterday's hunger starves today), the village's goods, plans
    // and companies, the people slot (sites), polity, carts, doctrines, happenings, the late slot (war).
    // The caravans keep their own daily schedule, so between economy steps only their hook runs.
    if (n % ECONOMY_EVERY === 0 || d === to) {
      tickEconomyLod(state, undefined, d - economyAt);
      economyAt = d;
    } else state.economyHooks?.caravan?.(state);
    for (const t of runs) goodsDay(t);
    tickBuildPlans(state);
    if (n % DEVELOP_EVERY === 0) tickCompanies(state);
    if (n % SITES_EVERY === 0 || d === to) {
      tickSites(state, d - sitesAt);
      sitesAt = d;
    }
    if (n % DEVELOP_EVERY === 0) {
      tickBorders(state);
      tickPolity(state);
    }
    // The carts read the shortfalls today's plans and goods day posted, as the daily carts did.
    if (n % CARTS_EVERY === 0 || d === to) {
      tickLogistics(state, d - cartsAt);
      cartsAt = d;
    }
    // The stores spoil as the dawn's hauling has them (civic/hauling, after the carts): food going stale in
    // the granary, the storehouse and on site shelves. Without it a long wait kept the food the dawns lose
    // (seed 42: 618 in store against the dawns' 247).
    if (n % SPOIL_EVERY === 0 || d === to) {
      for (const t of runs) spoilTown(state, t.id, d - spoiledAt);
      spoiledAt = d;
    }
    if (state.towns && data?.doctrines) tickDoctrines(state);
    if (n % HAPPENING_EVERY === 0 || d === to) tickStoryteller(state);
    const far = n % FAR_EVERY === 0;
    if (far || n % RELATIONS_EVERY === 0 || d === to) {
      tickDistrictRelations(state, !far, d - relationsAt);
      relationsAt = d;
    }
    tickLiveWar(state);
    daily?.(state);
    const life = n % LIFE_EVERY === 0 || d === to;
    if (life) {
      lifeOver(state, lived, d, rep);
      kinOver(state, lived, d, rep);
      lived = d;
    }
    // Sites hire and lose hands, the levy marches, people are born and die: the hands are re-read
    // every other day, and after every stretch of lives.
    if (life || n % DEVELOP_EVERY === 0) runs = townRuns(state);
  }
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
  for (const t of townRuns(state)) {
    for (const j of t.jobs) {
      for (const r of JOB_BY_ID.get(j.jobId)!.recipes) {
        const made = Object.entries(r.out).reduce((n, [i, q]) => n + (isFood(i) ? q * j.mul : 0), 0);
        const used = Object.entries(r.in ?? {}).reduce((n, [i, q]) => n + (isFood(i) ? q : 0), 0);
        net += j.workers * (r.chance ?? 1) * (made - used);
      }
    }
    if (data?.economyLod && state.towns?.[t.id]?.economyOptIn) for (const f of routeInflow(state, t.id, data)) if (isFood(f.item)) net += f.perDay;
    net -= t.pop * HOUSEHOLD.food.perPerson;
  }
  return net;
}

/** Food in a district's towns (for summaries and the perf comparison). */
export const districtFood = (state: SimState): number =>
  Object.keys(state.towns ?? {}).reduce((n, id) => n + foodHave(state, id), 0);
