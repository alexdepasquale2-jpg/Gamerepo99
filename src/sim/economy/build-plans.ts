/**
 * Ambitions and build plans. A villager may want a building for their trade: they claim a free
 * plot near the town centre, list the goods it needs, draw what the town has, and shortfalls post
 * as town need (price + logistics requests). When the goods are on site and enough labor is done,
 * the building stands and boosts its trade in that town. The player helps by gifting the owner a
 * needed item. Plots are abstract cells around the town centre; the map places them later.
 * Pure + deterministic.
 */

import buildingsJson from '../../data/items/buildings.json';
import { jobOf } from '../goods/jobs';
import { deriveRng } from '../rng';
import type { SimState } from '../types/runtime';

export type BuildingDef = { id: string; name: string; jobs: string[]; cost: Record<string, number>; labor: number; w: number; h: number };
const T = buildingsJson as unknown as { workshopMul: number; buildings: BuildingDef[] };
export const BUILDINGS = T.buildings;
export const BUILDING_BY_ID = new Map(BUILDINGS.map((b) => [b.id, b]));

export const PLANS = {
  /** Chance per dawn that a villager without a plan takes up an ambition. */
  ambitionChance: 0.03,
  /** Plans under way per town at once. */
  activePerTown: 3,
  /** One building of a kind per this many residents. */
  residentsPerBuilding: 10,
  /** Dawns without any goods arriving before the plan is given up. */
  stallDays: 40,
  /** Town centre reserve (cells from 0,0) and furthest plot ring. */
  centerRadius: 1,
  maxRing: 9,
};

export type Claim = { id: string; planId: string; ownerId: string; townId: string; dx: number; dy: number; w: number; h: number; kind: string; status: 'claimed' | 'built' };
export type BuildPlan = {
  id: string; ownerId: string; townId: string; kind: string; claimId: string;
  stage: 'gathering' | 'building' | 'done' | 'abandoned';
  have: Record<string, number>; laborDone: number; startDay: number; stalledDays: number; doneDay?: number;
};
export type BuildState = { plans: BuildPlan[]; claims: Claim[]; next: number };

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
  const p = activePlans(state).find((x) => x.ownerId === personId && x.stage === 'gathering' && (BUILDING_BY_ID.get(x.kind)!.cost[itemId] ?? 0) > (x.have[itemId] ?? 0));
  if (!p) return null;
  p.have[itemId] = (p.have[itemId] ?? 0) + 1;
  p.stalledDays = 0;
  return `It goes toward their ${BUILDING_BY_ID.get(p.kind)!.name}.`;
}

/** First free spot, nearest the centre ring by ring, outside the town-centre reserve. */
function findPlot(state: SimState, townId: string, w: number, h: number): { dx: number; dy: number } | null {
  const taken = claimsIn(state, townId);
  const R = PLANS.centerRadius;
  const hit = (dx: number, dy: number): boolean => {
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
    if (plan.stage === 'gathering') {
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
      const kinds = BUILDINGS.filter((k) => k.jobs.includes(job));
      const def = (kinds.length ? kinds : [BUILDING_BY_ID.get('house')!])[rng.int(0, kinds.length || 1)]!;
      const have = b.plans.filter((p) => p.townId === townId && p.kind === def.id && p.stage !== 'abandoned').length;
      if (have >= Math.ceil(ids.length / PLANS.residentsPerBuilding)) continue;
      const plot = findPlot(state, townId, def.w, def.h);
      if (!plot) continue;
      const planId = `plan${b.next++}`, claimId = `claim${b.next++}`;
      b.claims.push({ id: claimId, planId, ownerId: id, townId, dx: plot.dx, dy: plot.dy, w: def.w, h: def.h, kind: def.id, status: 'claimed' });
      b.plans.push({ id: planId, ownerId: id, townId, kind: def.id, claimId, stage: 'gathering', have: {}, laborDone: 0, startDay: state.day, stalledDays: 0 });
    }
  }
}
