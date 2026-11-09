/**
 * What the council spends its treasury on, beyond its own builders (civic-zoning pays those first):
 *   food    the granary is under `belowDays` of the town's meal: buy grain off passing carters. The coin
 *           leaves the district; the grain arrives through town-stores as `source:purchase`, so the
 *           world's goods still only change by named sources and sinks (scripts/check-civic.mts).
 *   road    a road out of town is worn or broken: pay a resident to mend it (the coin stays in the world,
 *           in their purse); the mend stops at the crews' ceiling, like any NPC crew.
 *   repair  a road facility of this town has stood with no crew at work for `idleDays`: hire a resident
 *           fit to work there, which puts it back to work in the staffing the facilities sim already keeps.
 * Each at most once a dawn and once per its gap, in that order (hunger first). The leader tells the
 * player's town at dawn. Tuning and lines in data/civic/council-works.json. Pure, deterministic.
 */
import worksJson from '../../data/civic/council-works.json';
import { granaryFood, openTown, STORES, supplyStores } from '../civic/town-stores';
import { room, total } from '../civic/store';
import type { TownCivic } from '../civic/zoning';
import { registerDawnLines } from '../dawn-lines';
import { FACILITY_WORKERS, facilityPlaces, fitToWork, rolesFor, type FacilityPlace } from '../economy/facilities';
import { noteRoadNews, ROADS, roadNeedsMending } from '../economy/roads';
import { priceAt } from '../goods/deed-goods';
import { prettyTownId } from '../map/districts';
import { deriveRng } from '../rng';
import type { SimState } from '../types/runtime';
import { firstNameOf } from '../names';

type Works = {
  reserve: number;
  food: { item: string; belowDays: number; toDays: number; maxPerDawn: number; priceMul: number; gap: number };
  road: { below: number; gain: number; wage: number; gap: number };
  repair: { idleDays: number; wage: number; gap: number };
  newsKeep: number;
  lines: Record<WorkKind, string[]>;
};
export const WORKS = worksJson as unknown as Works;

export type WorkKind = 'food' | 'road' | 'repair';
/** `reopened`: the mend reopened a broken road, which the roads' own dawn line already tells. */
export type WorkNews = { day: number; kind: WorkKind; by?: string; hand?: string; qty?: number; item?: string; coin: number; routeId?: string; facilityId?: string; reopened?: boolean };
/** Lives on the town's civic record (state.build.civic, so saves carry it); made on the first spend. */
type CouncilWorks = { last: Partial<Record<WorkKind, number>>; news: WorkNews[] };
type WithWorks = TownCivic & { works?: CouncilWorks };

export const worksIfAny = (c: TownCivic | undefined): CouncilWorks | undefined => (c as WithWorks | undefined)?.works;
const worksOf = (c: TownCivic): CouncilWorks => ((c as WithWorks).works ??= { last: {}, news: [] });
const ready = (state: SimState, c: TownCivic, kind: WorkKind, gap: number): boolean => state.day - (worksIfAny(c)?.last[kind] ?? -1e9) >= gap;
const spendable = (c: TownCivic): number => Math.max(0, c.treasury - WORKS.reserve);

function note(state: SimState, c: TownCivic, n: Omit<WorkNews, 'day'>): void {
  const w = worksOf(c);
  w.last[n.kind] = state.day;
  w.news.push({ day: state.day, ...n });
  if (w.news.length > WORKS.newsKeep) w.news.splice(0, w.news.length - WORKS.newsKeep);
}

/** Levy coin into a resident's purse (builders' wages in civic-zoning too): it stays in the world. */
export const payHand = (state: SimState, hand: string, coin: number): void => {
  const purse = (state.companies ??= { list: [], next: 1, purse: {} }).purse;
  purse[hand] = (purse[hand] ?? 0) + coin;
};

/** A resident picked by the seed for a job (stable within the day and the job's key). */
function handFor(state: SimState, folk: string[], ...key: (string | number)[]): string | undefined {
  return folk.length ? folk[deriveRng(state.seed, 'council-works', state.day, ...key).int(0, folk.length)] : undefined;
}

/** Grain into a granary under its meal's cover, bought from outside (true when it bought). */
function buyFood(state: SimState, townId: string, c: TownCivic, by?: string): boolean {
  const F = WORKS.food;
  const need = state.villageEconomy?.towns[townId]?.need.food ?? 0;
  if (!(need > 0) || !ready(state, c, 'food', F.gap)) return false;
  const ts = openTown(state, townId);
  // Food that spilled into the yard still feeds the town: count it before buying more.
  const have = granaryFood(state, townId) + STORES.granaryItems.reduce((n, i) => n + total(ts.yard, i), 0);
  if (have >= need * F.belowDays) return false;
  const price = Math.max(1, priceAt(state, townId, F.item) * F.priceMul);
  const space = room(ts.granary);
  const qty = Math.floor(Math.min(need * F.toDays - have, F.maxPerDawn, space, spendable(c) / price));
  if (qty < 1) return false;
  const got = supplyStores(state, townId, F.item, qty, 'source:purchase');
  if (got <= 0) return false;
  const coin = Math.round(got * price * 100) / 100;
  c.treasury -= coin;
  note(state, c, { kind: 'food', by, qty: Math.round(got), item: F.item, coin: Math.round(coin) });
  return true;
}

/** Pay a resident to mend the worst road out of town (true when paid). */
function mendRoad(state: SimState, townId: string, c: TownCivic, folk: string[], by?: string): boolean {
  const R = WORKS.road;
  if (!ready(state, c, 'road', R.gap) || spendable(c) < R.wage) return false;
  const roads = (state.economyRoutes ?? [])
    .filter((r) => (r.fromTownId === townId || r.toTownId === townId) && roadNeedsMending(r) && (r.broken || r.condition < R.below))
    .sort((a, b) => Number(b.broken) - Number(a.broken) || a.condition - b.condition || a.id.localeCompare(b.id));
  const r = roads[0];
  const hand = r && handFor(state, folk, 'road', r.id);
  if (!r || !hand) return false;
  r.condition = Math.min(ROADS.crewCeiling, r.condition + R.gain);
  // Reopening is road news like any crew's (the roads' own dawn line tells it, so the council's stays quiet).
  const reopened = r.broken && r.condition >= ROADS.reopenAt;
  if (reopened) { r.broken = false; noteRoadNews(state, { routeId: r.id, kind: 'reopened', by: hand }); }
  payHand(state, hand, R.wage);
  c.treasury -= R.wage;
  note(state, c, { kind: 'road', by, hand, coin: R.wage, routeId: r.id, ...(reopened ? { reopened } : {}) });
  return true;
}

/** Can this person take a crew slot here today (the facilities sim keeps anyone who can at dawn)? */
const ableAt = (state: SimState, place: FacilityPlace, pid: string | null): boolean => fitToWork(state, place, pid, FACILITY_WORKERS.staffing.ableFlame);

/** Hire a crew back into a facility of this town's roads that has stood idle too long (true when hired). */
function repairFacility(state: SimState, townId: string, c: TownCivic, folk: string[], by?: string): boolean {
  const P = WORKS.repair;
  const staff = state.facilityStaff;
  if (!staff || !ready(state, c, 'repair', P.gap) || spendable(c) < P.wage) return false;
  const mine = facilityPlaces(state).filter((f) => f.townIds.includes(townId) && staff[f.id]?.idle).sort((a, b) => a.id.localeCompare(b.id));
  // A facility dealt no crew at all has no idle day on record: its idle time counts from when the council first sees it.
  for (const f of mine) staff[f.id]!.changedDay ??= state.day;
  const derelict = mine.filter((f) => state.day - staff[f.id]!.changedDay! >= P.idleDays);
  if (!derelict.length) return false;
  const taken = new Set(Object.values(staff).flatMap((s) => s.crew.filter((x): x is string => !!x)));
  for (const place of derelict) {
    const able = folk.filter((id) => !taken.has(id) && ableAt(state, place, id));
    const hand = handFor(state, able, 'repair', place.id);
    if (!hand) continue;
    const s = staff[place.id]!;
    while (s.crew.length < rolesFor(place.kind)) s.crew.push(null);
    const slot = s.crew.findIndex((x) => !ableAt(state, place, x));
    s.crew[slot < 0 ? 0 : slot] = hand;
    s.staffed = s.crew.filter((x) => ableAt(state, place, x)).length;
    s.idle = false;
    s.changedDay = state.day;
    s.change = 'restaffed';
    s.by = hand;
    payHand(state, hand, P.wage);
    c.treasury -= P.wage;
    note(state, c, { kind: 'repair', by, hand, coin: P.wage, facilityId: place.id });
    return true;
  }
  return false;
}

/** One dawn of the council's spending in a town, after its builders are paid. */
export function spendTreasury(state: SimState, townId: string, c: TownCivic, leader: string | undefined, folk: string[]): void {
  if (!(spendable(c) > 0)) return;
  buyFood(state, townId, c, leader);
  mendRoad(state, townId, c, folk, leader);
  repairFacility(state, townId, c, folk, leader);
}

// ---- Dawn lines: the leader tells the player's town what the levy bought. ----

const first = (state: SimState, id: string | undefined): string => (id ? firstNameOf(state.people[id]?.name ?? 'Someone')! : 'Someone');

export function worksLine(state: SimState, townId: string, n: WorkNews): string {
  const pool = WORKS.lines[n.kind] ?? [];
  if (!pool.length) return '';
  const tpl = pool[deriveRng(state.seed, `council-works-${n.kind}`, n.day, townId).int(0, pool.length)]!;
  const route = n.routeId ? state.economyRoutes?.find((r) => r.id === n.routeId) : undefined;
  const slots: Record<string, string> = {
    who: first(state, n.by), town: prettyTownId(townId), qty: String(n.qty ?? 0), item: n.item ?? 'grain', coin: String(n.coin),
    road: route ? prettyTownId(route.fromTownId === townId ? route.toTownId : route.fromTownId) : 'the next town',
    place: (n.facilityId && facilityPlaces(state).find((f) => f.id === n.facilityId)?.name) || 'old works',
  };
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => slots[k] ?? m);
}

export function worksDawnLines(state: SimState): string[] {
  const here = state.player.townId;
  const news = here ? worksIfAny(state.build?.civic?.[here])?.news ?? [] : [];
  return news.filter((n) => n.day === state.day && !n.reopened).map((n) => worksLine(state, here!, n)).filter(Boolean).slice(0, 2);
}
registerDawnLines('council-works', worksDawnLines);
