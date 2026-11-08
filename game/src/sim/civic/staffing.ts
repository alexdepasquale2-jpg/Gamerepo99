/**
 * Staffing (civic slice 2): who runs a site, who works it, what they are paid and whether they eat.
 * One dawn, per NPC company site, after the people tick (so the night's deaths and retirements are in):
 *   1. No manager: "wanted: manager" goes up; from the next dawn the best fit in town is promoted.
 *   2. The manager sets the wage (one more when the till is full).
 *   3. Wages from the till; unpaid `COMPANY.quitAfterUnpaid` dawns running, a worker quits.
 *   4. Each paid hand buys a day's ration from a food site in town (closing the coin loop); a town
 *      that went short at this dawn's meal leaves some hands unfed. Unfed long enough they fall sick,
 *      then leave, and each time the town's despair is nudged up.
 *   5. The owner draws profit above the reserve; the manager hires one hand when there is room and coin.
 * Coin only moves between tills and purses here (moveCoin logs each move): the loop creates and destroys
 * none. Road crews (crew-run sites) and the player's workshops keep their own rules. Pure + deterministic.
 */
import { BUILDING_BY_ID, PLAYER_OWNER, activePlans } from '../economy/build-plans';
import { COMPANY, companyOf, type Company } from '../economy/companies';
import { foodNeed, foodShortToday } from '../economy/food-stock';
import { HOUSEHOLD } from '../economy/village-economy';
import { ITEM_BY_ID } from '../goods/inventory';
import { JOBS, jobOf } from '../goods/jobs';
import { deriveRng } from '../rng';
import type { SimState } from '../types/runtime';
import {
  CIVIC, canWork, civicOf, companyOfSite, managedBy, moveCoin, remember, setWorkers, sitesIn, syncSites, vacate, type CivicNews, type Site,
} from './sites';

const NEWS_KEEP = 40;
const FOOD = new Set(HOUSEHOLD.food.eats);
/** Trades whose recipes put food on the table: their sites sell the day's ration. */
const FOOD_JOBS = new Set(JOBS.filter((j) => j.recipes.some((r) => Object.keys(r.out).some((i) => FOOD.has(i)))).map((j) => j.id));

/** Coin a day's ration costs: the household share of food at the ration item's list price. */
export const rationCoin = (): number => HOUSEHOLD.food.perPerson * (ITEM_BY_ID.get(CIVIC.rationItem)?.price ?? 1);

const tillOf = (s: Site): string => `site:${s.id}`;
const purseOf = (id: string): string => `purse:${id}`;
const sitesFood = (s: Site): boolean => (BUILDING_BY_ID.get(s.building)?.jobs ?? []).some((j) => FOOD_JOBS.has(j));

function news(state: SimState, n: Omit<CivicNews, 'day'>): void {
  const cv = civicOf(state);
  cv.news.push({ day: state.day, ...n });
  if (cv.news.length > NEWS_KEEP) cv.news.splice(0, cv.news.length - NEWS_KEEP);
}

function nudgeDespair(state: SimState, townId: string): void {
  const t = state.towns?.[townId];
  if (t) t.despair = Math.min(1, t.despair + CIVIC.unfedDespair);
}

/** How well someone fits running this site: their trade, time on its crew, owning it, and their flame. */
export function managerFit(state: SimState, site: Site, id: string): number {
  const jobs = BUILDING_BY_ID.get(site.building)?.jobs ?? [];
  const job = jobOf(state, id);
  let score = jobs.includes(job.id) ? 3 : job.recipes.length === 0 ? 1 : 0;
  if (site.workers.includes(id)) score += 2;
  if (site.ownerId === id) score += 1.5;
  return score + Math.max(0, Math.min(100, state.people[id]?.flame ?? 0)) / 100;
}

/** Not someone who just walked out of this site (they are not taken back for rehireCooldown dawns). */
const fresh = (state: SimState, site: Site, id: string): boolean =>
  state.day - (civicOf(state).left[`${site.id}|${id}`] ?? -Infinity) >= CIVIC.rehireCooldown;

/** The best person in town to take an empty post (null when nobody can). */
export function bestCandidate(state: SimState, site: Site): string | null {
  const own = companyOfSite(state, site);
  const busy = new Set(sitesIn(state).filter((s) => s.id !== site.id && s.managerId).map((s) => s.managerId!));
  let best: string | null = null, bestScore = -Infinity;
  for (const id of Object.keys(state.people).sort()) {
    const p = state.people[id]!;
    if (p.townId !== site.townId || !canWork(state, id) || busy.has(id) || !fresh(state, site, id)) continue;
    const at = companyOf(state, id);
    if (at && at !== own) continue;
    const score = managerFit(state, site, id);
    if (score > bestScore) { best = id; bestScore = score; }
  }
  return best;
}

/** Fill an empty post: the day it went up only posts it; from the next dawn the best fit is promoted. */
function fillPost(state: SimState, site: Site): void {
  if (site.managerId) return;
  if (site.wantedSince === undefined) {
    site.wantedSince = state.day;
    news(state, { siteId: site.id, townId: site.townId, kind: 'wanted' });
    return;
  }
  if (site.wantedSince >= state.day) return;
  const pick = bestCandidate(state, site);
  if (!pick) return;
  if (site.workers.includes(pick)) setWorkers(state, site, site.workers.filter((w) => w !== pick));
  site.managerId = pick;
  delete site.wantedSince;
  delete site.vacated;
  remember(site, { day: state.day, what: 'manager', personId: pick });
  news(state, { siteId: site.id, townId: site.townId, kind: 'promoted', personId: pick });
}

/** Someone leaves a site's crew (or post): off the payroll, not hired back for a while. */
function leave(state: SimState, site: Site, c: Company, id: string, why: 'quit' | 'unfed'): void {
  if (site.managerId === id) vacate(state, site, why === 'quit' ? 'unpaid' : 'hungry');
  else setWorkers(state, site, site.workers.filter((w) => w !== id));
  delete c.unpaid[id];
  delete site.unfed?.[id];
  civicOf(state).left[`${site.id}|${id}`] = state.day;
  remember(site, { day: state.day, what: 'quit', personId: id, note: why });
}

/** The hands a site pays: its workers, and a manager who does not own it. */
const payroll = (site: Site): string[] => [...site.workers, ...(site.managerId && site.managerId !== site.ownerId ? [site.managerId] : [])];

function payWages(state: SimState, site: Site, c: Company): string[] {
  const paid: string[] = [];
  for (const id of payroll(site)) {
    if (moveCoin(state, tillOf(site), purseOf(id), site.wage, 'wage') >= site.wage - 1e-9) {
      delete c.unpaid[id];
      paid.push(id);
      continue;
    }
    if ((c.unpaid[id] = (c.unpaid[id] ?? 0) + 1) >= COMPANY.quitAfterUnpaid) {
      leave(state, site, c, id, 'quit');
      news(state, { siteId: site.id, townId: site.townId, kind: 'unpaid-left', personId: id });
    }
  }
  return paid;
}

/** Everyone the site keeps fed: the payroll and the owner when they run it. */
function feedHands(state: SimState, site: Site, c: Company, sellers: Site[]): void {
  const need = foodNeed(state, site.townId);
  const shortShare = need > 0 ? Math.min(1, foodShortToday(state, site.townId) / need) : 0;
  const cost = rationCoin();
  const hands = [...payroll(site), ...(site.managerId && site.managerId === site.ownerId ? [site.managerId] : [])];
  const unfed = (site.unfed ??= {});
  for (const id of hands) {
    const rng = deriveRng(state.seed, 'ration', state.day, id);
    const bare = rng.next() < shortShare;
    const seller = sellers.length ? sellers[rng.int(0, sellers.length)]! : undefined;
    // No food site in town: they eat at home from the household larder (the ledger already fed them). An owner
    // who runs their own place draws no wage: short of coin, they eat at home too rather than go without.
    const bought = !!seller && moveCoin(state, purseOf(id), tillOf(seller), cost, 'ration') >= cost - 1e-9;
    const fed = !bare && (!seller || bought || id === site.ownerId);
    if (fed) { delete unfed[id]; continue; }
    const days = (unfed[id] = (unfed[id] ?? 0) + 1);
    const p = state.people[id];
    if (days >= CIVIC.sickAfterUnfed && p && !p.tags?.includes('sick')) {
      p.tags = [...(p.tags ?? []), 'sick'];
      civicOf(state).sick[id] = state.day;
      nudgeDespair(state, site.townId);
      remember(site, { day: state.day, what: 'sick', personId: id });
      news(state, { siteId: site.id, townId: site.townId, kind: 'sick', personId: id });
    }
    if (days >= CIVIC.leaveAfterUnfed) {
      leave(state, site, c, id, 'unfed');
      nudgeDespair(state, site.townId);
      news(state, { siteId: site.id, townId: site.townId, kind: 'unfed-left', personId: id });
    }
  }
}

function hire(state: SimState, site: Site, c: Company, residents: string[], busy: Set<string>): void {
  const def = BUILDING_BY_ID.get(site.building);
  if (!def?.slots || !site.managerId) return;
  if (1 + site.workers.length >= def.slots || c.coin < site.wage * COMPANY.hireBufferDays * (site.workers.length + 1)) return;
  const fits = residents.filter((id) => {
    if (busy.has(id) || !canWork(state, id) || !fresh(state, site, id) || companyOf(state, id)) return false;
    const job = jobOf(state, id);
    return job.recipes.length === 0 || def.jobs.includes(job.id);
  });
  // The manager's pick: someone in the trade first, then an idle hand.
  const pick = fits.find((id) => def.jobs.includes(jobOf(state, id).id)) ?? fits[0];
  if (!pick) return;
  setWorkers(state, site, [...site.workers, pick]);
  remember(site, { day: state.day, what: 'hired', personId: pick });
}

/** Days off hunger before the sick are well again. */
const MEND_DAYS = 2;

/** Hunger mends: once someone has been off every unfed count (fed again, or gone home) for MEND_DAYS. */
function mendSick(state: SimState): void {
  const cv = civicOf(state);
  const stillUnfed = new Set(sitesIn(state).flatMap((s) => Object.keys(s.unfed ?? {})));
  for (const id of Object.keys(cv.sick).sort()) {
    const p = state.people[id];
    if (!p) { delete cv.sick[id]; continue; }
    // Still going hungry: the clock starts again from today.
    if (stillUnfed.has(id)) { cv.sick[id] = state.day; continue; }
    if (state.day - cv.sick[id]! < MEND_DAYS) continue;
    p.tags = (p.tags ?? []).filter((t) => t !== 'sick');
    delete cv.sick[id];
  }
}

/** Manager death or retirement (economy/mortality): every post they held goes vacant at once. */
export function vacatePosts(state: SimState, personId: string, why: 'died' | 'retired'): void {
  for (const s of managedBy(state, personId)) {
    if (s.crewRun || s.managerId === PLAYER_OWNER) continue;
    // A site still going up, or a building nobody trades from, has no post to fill: the builder's heir carries on.
    if (s.status === 'building' || s.status === 'standing') s.managerId = undefined;
    else vacate(state, s, why);
  }
}

/** The dawn tick (registered in civic/index): sync the registry, then run every NPC company site. */
export function tickSites(state: SimState): void {
  if (!state.build && !state.companies && !state.facilityStaff) return;
  const cv = syncSites(state);
  for (const [k, day] of Object.entries(cv.left)) if (state.day - day > CIVIC.rehireCooldown) delete cv.left[k];
  const residents = new Map<string, string[]>();
  for (const id of Object.keys(state.people ?? {}).sort()) {
    const t = state.people[id]!.townId;
    if (t) (residents.get(t) ?? residents.set(t, []).get(t)!).push(id);
  }
  const sites = sitesIn(state).filter((s) => !s.crewRun);
  const sellersIn = (townId: string): Site[] => sites.filter((s) => s.townId === townId && s.source.type === 'company' && sitesFood(s));
  for (const site of sites) {
    if (site.ownerId === PLAYER_OWNER) continue;
    if (site.status === 'building') continue;
    const c = companyOfSite(state, site);
    if (!c) continue;
    fillPost(state, site);
    if (site.managerId) {
      // A raise once the till is full, back to the base wage only when it falls under the reserve (no flip-flop).
      const wage = c.coin >= CIVIC.wageRaiseAt ? COMPANY.wage + 1 : c.coin < COMPANY.reserve ? COMPANY.wage : site.wage;
      if (wage !== site.wage) remember(site, { day: state.day, what: 'wage', note: String(wage) });
      site.wage = wage;
      // Nobody runs an idle site, so nobody pays its hands: they wait for the post to be filled, and so does their count.
      payWages(state, site, c);
    }
    feedHands(state, site, c, sellersIn(site.townId));
    if (c.coin > COMPANY.reserve) moveCoin(state, tillOf(site), purseOf(c.ownerId), Math.floor((c.coin - COMPANY.reserve) * COMPANY.ownerDraw), 'draw');
    // Builders, and anyone who already runs a site, are not free to be hired.
    const busy = new Set([...activePlans(state).map((p) => p.ownerId), ...sitesIn(state).flatMap((s) => (s.managerId ? [s.managerId] : []))]);
    hire(state, site, c, residents.get(site.townId) ?? [], busy);
    site.coin = c.coin;
    site.status = site.managerId ? 'working' : 'idle';
  }
  mendSick(state);
}
