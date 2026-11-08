/**
 * Ambitions and build plans. A villager may want a building for their trade: they claim a free
 * plot near the town centre, list the goods it needs, draw what the town has, and shortfalls post
 * as town need (price + logistics requests). When the goods are on site and enough labor is done,
 * the building stands and boosts its trade in that town. The player helps by gifting the owner a
 * needed item. Plots are abstract cells around the town centre; the map places them later.
 * The player can own a plan too (ownerId PLAYER_OWNER, see economy/workshops): its goods come only from
 * what the player brings or buys, and it never stalls out.
 * Zoning (civic/zoning): plot cells fall into zoned lots, and a claim must sit in its kind's zone; an
 * ambition turned away for want of ground is counted for the council. Tiers (civic/tiers) gate the civic
 * kinds (granary, market, barracks, town hall; data/civic/zones.json). Pure + deterministic.
 */

import buildingsJson from '../../data/items/buildings.json';
import { jobOf } from '../goods/jobs';
import { biomeAt } from '../map/terrain';
import { deriveRng } from '../rng';
import { civicOf, fitsZone, zoneFor, zoneName, ZONES, type TownCivic } from '../civic/zoning';
import { tierNeeded, unlockedIn } from '../civic/tiers';
import type { SimState } from '../types/runtime';
import { noteUse } from '../data-use-world';

export type BuildingDef = { id: string; name: string; jobs: string[]; cost: Record<string, number>; labor: number; w: number; h: number; slots?: number };
const T = buildingsJson as unknown as { workshopMul: number; buildings: BuildingDef[] };
/** The trades' buildings plus the civic kinds a tier unlocks. */
export const BUILDINGS: BuildingDef[] = [...T.buildings, ...ZONES.civicBuildings.filter((c) => !T.buildings.some((b) => b.id === c.id))];
export const BUILDING_BY_ID = new Map(BUILDINGS.map((b) => [b.id, b]));

/** Tiles per plot cell side (borders map plots to tiles with this). */
export const CELL_TILES = 3;
/** The settlement art covers this many tiles from a town's centre; it is always dry land. */
const TOWN_TILES = 13;

export const PLANS = {
  /** Chance per dawn that a villager without a plan takes up an ambition. */
  ambitionChance: 0.03,
  /** Plans under way per town at once. */
  activePerTown: 3,
  /** One building of a kind per this many residents. */
  residentsPerBuilding: 10,
  /** Dawns without any goods arriving before the plan is given up. */
  stallDays: 40,
  /** Town centre reserve (cells from 0,0; the settlement art spans about 13 tiles = 5 cells) and furthest plot ring. */
  centerRadius: 5,
  maxRing: 11,
};

export type Claim = { id: string; planId: string; ownerId: string; townId: string; dx: number; dy: number; w: number; h: number; kind: string; status: 'claimed' | 'built';
  /** The zone the claim was staked in (older saves lack it; civic/zoning can work it out from dx, dy). */
  zone?: string;
};
export type BuildPlan = {
  id: string; ownerId: string; townId: string; kind: string; claimId: string;
  stage: 'gathering' | 'building' | 'done' | 'abandoned';
  have: Record<string, number>; laborDone: number; startDay: number; stalledDays: number; doneDay?: number;
  /** Staked by the council for the town (its levy pays the builders; contrib/civic-zoning). */
  council?: boolean;
};
export type BuildState = {
  plans: BuildPlan[]; claims: Claim[]; next: number;
  /** Each town's zoning overrides, tax, treasury and civic news (civic/zoning). */
  civic?: Record<string, TownCivic>;
};

/** ownerId of a plan, claim or company the player owns. */
export const PLAYER_OWNER = 'player';

const bs = (state: SimState): BuildState => (state.build ??= { plans: [], claims: [], next: 1 });
const live = (p: BuildPlan): boolean => p.stage === 'gathering' || p.stage === 'building';

export const activePlans = (state: SimState, townId?: string): BuildPlan[] => (state.build?.plans ?? []).filter((p) => live(p) && (!townId || p.townId === townId));
export const claimsIn = (state: SimState, townId: string): Claim[] => (state.build?.claims ?? []).filter((c) => c.townId === townId);

/** Goods a town's active builds still lack, summed. For the needs board and the player's help. */
export function buildNeeds(state: SimState, townId: string): { itemId: string; qty: number }[] {
  const out: Record<string, number> = {};
  for (const p of activePlans(state, townId)) {
    if (p.stage !== 'gathering') continue;
    for (const [item, q] of Object.entries(BUILDING_BY_ID.get(p.kind)!.cost)) out[item] = (out[item] ?? 0) + Math.max(0, q - (p.have[item] ?? 0));
  }
  return Object.entries(out).filter(([, q]) => q > 0).map(([itemId, qty]) => ({ itemId, qty })).sort((a, b) => b.qty - a.qty || a.itemId.localeCompare(b.itemId));
}

/** Production multiplier for a job in a town that has finished a building for it. */
export function workshopMul(state: SimState, townId: string, jobId: string): number {
  return (state.build?.claims ?? []).some((c) => c.status === 'built' && c.townId === townId && BUILDING_BY_ID.get(c.kind)?.jobs.includes(jobId)) ? T.workshopMul : 1;
}

/** The player gives the owner a good their build needs: it goes to the site. Returns a line, or null. */
export function contributeToPlan(state: SimState, personId: string, itemId: string): string | null {
  const here = state.player.townId;
  const fits = (x: BuildPlan): boolean => x.ownerId === personId && x.stage === 'gathering' && (BUILDING_BY_ID.get(x.kind)!.cost[itemId] ?? 0) > (x.have[itemId] ?? 0);
  // The player's own builds: the one in this town first.
  const p = activePlans(state).filter(fits).sort((a, b) => Number(b.townId === here) - Number(a.townId === here))[0];
  if (!p) return null;
  p.have[itemId] = (p.have[itemId] ?? 0) + 1;
  p.stalledDays = 0;
  return `It goes toward ${p.ownerId === PLAYER_OWNER ? 'your' : 'their'} ${BUILDING_BY_ID.get(p.kind)!.name}.`;
}

/** Why a kind cannot be staked in this town yet (its tier), or null. */
export function claimBlocked(state: SimState, townId: string, kind: string): string | null {
  const need = tierNeeded(kind);
  if (!need || unlockedIn(state, townId, kind)) return null;
  return `A ${BUILDING_BY_ID.get(kind)?.name ?? kind} wants a ${need.name}; this place is not one yet.`;
}

/**
 * First free spot, nearest the centre ring by ring, outside the town-centre reserve. With a kind, the
 * claim's corner must also sit in that kind's zone.
 */
export function findPlot(state: SimState, townId: string, w: number, h: number, kind?: string): { dx: number; dy: number } | null {
  const taken = claimsIn(state, townId);
  const R = PLANS.centerRadius;
  const o = state.towns?.[townId];
  /** With a map position: the whole footprint must be off water (v2 map tiles run negative too, so no sign check). */
  const unbuildable = (dx: number, dy: number): boolean => {
    if (o?.q === undefined || o.r === undefined) return false;
    for (let i = 0; i < w * CELL_TILES; i++) for (let j = 0; j < h * CELL_TILES; j++) {
      const tq = o.q + dx * CELL_TILES + i, tr = o.r + dy * CELL_TILES + j;
      if (Math.abs(tq - o.q) > TOWN_TILES || Math.abs(tr - o.r) > TOWN_TILES) { if (biomeAt(state.seed, tq, tr) === 'water') return true; }
    }
    return false;
  };
  const hit = (dx: number, dy: number): boolean => {
    if (kind && !fitsZone(state, townId, kind, dx, dy, w, h)) return true;
    if (unbuildable(dx, dy)) return true;
    if (dx <= R && dx + w > -R && dy <= R && dy + h > -R) return true;
    return taken.some((c) => dx < c.dx + c.w && dx + w > c.dx && dy < c.dy + c.h && dy + h > c.dy);
  };
  for (let ring = R + 1; ring <= PLANS.maxRing; ring++) {
    for (let dy = -ring; dy <= ring; dy++) for (let dx = -ring; dx <= ring; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) === ring && !hit(dx, dy)) return { dx, dy };
    }
  }
  return null;
}

/**
 * Stake a plot for a kind and open its plan: the one path ambitions, the council and founding share. A kind
 * the tier has not unlocked, or no ground left in its zone, stakes nothing (the latter is counted as wanted
 * for the council). `built` places a finished building, `day` dates it, `founding` (a generated town's
 * pre-aged buildings, which its tier already implies) skips the tier gate and the council's count.
 */
export function stakePlan(
  state: SimState, ownerId: string, townId: string, kind: string,
  opts: { built?: boolean; day?: number; founding?: boolean; council?: boolean } = {},
): { plan: BuildPlan; claim: Claim } | null {
  const def = BUILDING_BY_ID.get(kind);
  if (!def || (!opts.founding && claimBlocked(state, townId, kind))) return null;
  const plot = findPlot(state, townId, def.w, def.h, kind);
  const zone = zoneFor(kind);
  if (!plot) {
    if (opts.founding) return null;
    const c = civicOf(state, townId);
    c.wanted[zone] = (c.wanted[zone] ?? 0) + 1;
    return null;
  }
  const b = bs(state);
  const day = opts.day ?? state.day;
  const planId = `plan${b.next++}`, claimId = `claim${b.next++}`;
  const claim: Claim = { id: claimId, planId, ownerId, townId, dx: plot.dx, dy: plot.dy, w: def.w, h: def.h, kind, status: opts.built ? 'built' : 'claimed', zone };
  const plan: BuildPlan = opts.built
    ? { id: planId, ownerId, townId, kind, claimId, stage: 'done', have: { ...def.cost }, laborDone: def.labor, startDay: day - def.labor, stalledDays: 0, doneDay: day }
    : { id: planId, ownerId, townId, kind, claimId, stage: 'gathering', have: {}, laborDone: 0, startDay: day, stalledDays: 0, ...(opts.council ? { council: true } : {}) };
  b.claims.push(claim);
  b.plans.push(plan);
  return { plan, claim };
}

/** What zone a kind needs, in words (for lines). */
export const zoneWords = (kind: string): string => zoneName(zoneFor(kind));

export function tickBuildPlans(state: SimState): void {
  const ve = state.villageEconomy;
  if (!ve) return;
  const b = bs(state);
  const pop = new Map<string, string[]>();
  for (const [id, p] of Object.entries(state.people ?? {})) if (p.townId) (pop.get(p.townId) ?? pop.set(p.townId, []).get(p.townId)!).push(id);

  // 1. Existing plans: draw goods, build, finish or give up.
  for (const plan of [...b.plans].sort((a, c) => a.id.localeCompare(c.id))) {
    if (!live(plan)) continue;
    const def = BUILDING_BY_ID.get(plan.kind)!;
    const l = ve.towns[plan.townId];
    if (plan.stage === 'gathering' && plan.ownerId === PLAYER_OWNER) {
      // The player's own build: goods come from what they bring or buy, and it waits for them.
      if (Object.entries(def.cost).every(([i, q]) => (plan.have[i] ?? 0) >= q)) plan.stage = 'building';
      plan.stalledDays = 0;
    } else if (plan.stage === 'gathering') {
      let moved = 0;
      for (const [item, q] of Object.entries(def.cost)) {
        const missing = q - (plan.have[item] ?? 0);
        if (missing <= 0) continue;
        const take = Math.min(missing, Math.floor(l?.goods[item] ?? 0));
        if (take > 0 && l) { l.goods[item]! -= take; plan.have[item] = (plan.have[item] ?? 0) + take; moved += take; }
        const still = missing - take;
        if (still > 0 && l) { l.need[item] = (l.need[item] ?? 0) + still; l.short[item] = (l.short[item] ?? 0) + still; }
      }
      plan.stalledDays = moved > 0 ? 0 : plan.stalledDays + 1;
      if (Object.entries(def.cost).every(([i, q]) => (plan.have[i] ?? 0) >= q)) plan.stage = 'building';
      else if (plan.stalledDays >= PLANS.stallDays) {
        plan.stage = 'abandoned';
        if (l) for (const [i, q] of Object.entries(plan.have)) l.goods[i] = (l.goods[i] ?? 0) + q;
        b.claims = b.claims.filter((c) => c.id !== plan.claimId);
      }
    } else {
      plan.laborDone += 1 + Math.floor((pop.get(plan.townId)?.length ?? 0) / 10);
      if (plan.laborDone >= def.labor) {
        plan.stage = 'done';
        plan.doneDay = state.day;
        const claim = b.claims.find((c) => c.id === plan.claimId);
        if (claim) claim.status = 'built';
        noteUse('buildings', plan.kind);
      }
    }
  }

  // 2. New ambitions: a villager without a plan may decide to build for their trade.
  for (const [townId, ids] of [...pop].sort(([x], [y]) => x.localeCompare(y))) {
    for (const id of [...ids].sort()) {
      if (activePlans(state, townId).length >= PLANS.activePerTown) break;
      if (b.plans.some((p) => p.ownerId === id && live(p))) continue;
      const rng = deriveRng(state.seed, 'ambition', state.day, id);
      if (rng.next() >= PLANS.ambitionChance) continue;
      const job = jobOf(state, id).id;
      // Only kinds the town's tier allows (a granary waits for a village, a market for a town).
      const kinds = BUILDINGS.filter((k) => k.jobs.includes(job) && unlockedIn(state, townId, k.id));
      const def = (kinds.length ? kinds : [BUILDING_BY_ID.get('house')!])[rng.int(0, kinds.length || 1)]!;
      const have = b.plans.filter((p) => p.townId === townId && p.kind === def.id && p.stage !== 'abandoned').length;
      if (have >= Math.ceil(ids.length / PLANS.residentsPerBuilding)) continue;
      stakePlan(state, id, townId, def.id);
    }
  }
}
