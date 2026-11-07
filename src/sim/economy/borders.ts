/**
 * Land, estates, borders and disputes. Plot cells map to tiles around each town's centre; a town's
 * reach grows with what is claimed and built; where two towns' reach overlaps, border tension builds
 * (phase 8 reads it for diplomacy and war). Inside a town, stalled claims invite claim-jumpers and
 * disputes are settled by standing. Pure + deterministic.
 */

import { deriveRng } from '../rng';
import type { SimState } from '../types/runtime';
import { BUILDING_BY_ID, CELL_TILES, activePlans, claimsIn, type Claim } from './build-plans';
import { companyOf, purseOf } from './companies';
import { householdOf, security } from './households';

export const LAND = {
  /** Tiles per plot cell side. */
  cellTiles: CELL_TILES,
  /** A town's reach in tiles with nothing built, plus per built / claimed building, capped. */
  baseReach: 12,
  perBuilt: 2.5,
  perClaimed: 1,
  maxReach: 45,
  /** Border tension: gain per dawn while overlapping (+ overlap/divisor), loss per dawn otherwise. */
  tensionBase: 1,
  tensionDivisor: 5,
  tensionDecay: 5,
  tensionMax: 100,
  /** Claim-jumping: how long a claim must stall, chance per dawn per town, savings needed, dawns to settle. */
  stalledDays: 10,
  jumpChance: 0.02,
  jumperPurse: 10,
  settleDays: 8,
  incumbency: 0.25,
};

export type TileRect = { q0: number; r0: number; q1: number; r1: number };
export type BorderPair = { a: string; b: string; dist: number; reachA: number; reachB: number; overlap: number; tension: number; since: number };
export type Dispute = { id: string; townId: string; claimId: string; challengerId: string; holderId: string; opened: number; status: 'open' | 'upheld' | 'dismissed' };
export type Borders = { pairs: Record<string, BorderPair>; disputes: Dispute[]; next: number };

const bd = (state: SimState): Borders => (state.borders ??= { pairs: {}, disputes: [], next: 1 });
const origin = (state: SimState, townId: string): { q: number; r: number } | undefined => {
  const t = state.towns?.[townId];
  return t?.q === undefined || t.r === undefined ? undefined : { q: t.q, r: t.r };
};

/** A claim's footprint in map tiles, or null when the town has no map position. */
export function claimRect(state: SimState, c: Claim): TileRect | null {
  const o = origin(state, c.townId);
  if (!o) return null;
  const k = LAND.cellTiles;
  return { q0: o.q + c.dx * k, r0: o.r + c.dy * k, q1: o.q + (c.dx + c.w) * k, r1: o.r + (c.dy + c.h) * k };
}

/** Everything one person holds: claims, how many stand, and the tile bounds around them. */
export function estateOf(state: SimState, ownerId: string): { claims: Claim[]; built: number; rect: TileRect | null } {
  const claims = (state.build?.claims ?? []).filter((c) => c.ownerId === ownerId);
  const rects = claims.map((c) => claimRect(state, c)).filter((r): r is TileRect => !!r);
  const rect = rects.length ? { q0: Math.min(...rects.map((r) => r.q0)), r0: Math.min(...rects.map((r) => r.r0)), q1: Math.max(...rects.map((r) => r.q1)), r1: Math.max(...rects.map((r) => r.r1)) } : null;
  return { claims, built: claims.filter((c) => c.status === 'built').length, rect };
}

/** How far a town's land reaches from its centre, in tiles: grows with what is built and claimed. */
export function townReach(state: SimState, townId: string): number {
  const cs = claimsIn(state, townId);
  const built = cs.filter((c) => c.status === 'built').length;
  const far = Math.max(0, ...cs.map((c) => Math.max(Math.abs(c.dx) + c.w, Math.abs(c.dy) + c.h) * LAND.cellTiles));
  return Math.min(LAND.maxReach, Math.max(LAND.baseReach + LAND.perBuilt * built + LAND.perClaimed * (cs.length - built), far));
}

export const tension = (state: SimState, a: string, b: string): number => state.borders?.pairs[a < b ? `${a}|${b}` : `${b}|${a}`]?.tension ?? 0;
export const bordersOf = (state: SimState, townId: string): BorderPair[] => Object.values(state.borders?.pairs ?? {}).filter((p) => p.a === townId || p.b === townId);

/** Standing for a dispute: savings, company, household security, plus a stake in the claim for the holder. */
export function standing(state: SimState, personId: string): number {
  const h = householdOf(state, personId);
  return purseOf(state, personId) / 50 + (companyOf(state, personId)?.coin ?? 0) / 50 + (h ? 0.5 * security(state, h) : 0);
}
const stake = (state: SimState, planId: string): number => {
  const p = state.build?.plans.find((x) => x.id === planId);
  if (!p) return 0;
  const cost = Object.entries(BUILDING_BY_ID.get(p.kind)!.cost);
  return cost.reduce((n, [i, q]) => n + Math.min(q, p.have[i] ?? 0), 0) / cost.reduce((n, [, q]) => n + q, 0);
};

export function tickBorders(state: SimState): void {
  const b = bd(state);

  // 1. Town borders: overlap of reach builds tension.
  const towns = Object.keys(state.towns ?? {}).filter((id) => origin(state, id)).sort();
  for (const [i, ta] of towns.entries()) for (const tb of towns.slice(i + 1)) {
    const oa = origin(state, ta)!, ob = origin(state, tb)!;
    const dist = Math.hypot(oa.q - ob.q, oa.r - ob.r);
    const reachA = townReach(state, ta), reachB = townReach(state, tb);
    const overlap = reachA + reachB - dist;
    const key = `${ta}|${tb}`;
    const was = b.pairs[key];
    if (overlap <= 0 && !was) continue;
    const t = overlap > 0 ? Math.min(LAND.tensionMax, (was?.tension ?? 0) + LAND.tensionBase + overlap / LAND.tensionDivisor) : Math.max(0, (was?.tension ?? 0) - LAND.tensionDecay);
    if (t <= 0 && overlap <= 0) { delete b.pairs[key]; continue; }
    b.pairs[key] = { a: ta, b: tb, dist, reachA, reachB, overlap, tension: t, since: was?.since ?? state.day };
  }

  // 2. Claim disputes: settle those that are due, then let stalled claims attract jumpers.
  for (const d of b.disputes) {
    if (d.status !== 'open' || state.day - d.opened < LAND.settleDays) continue;
    const claim = state.build?.claims.find((c) => c.id === d.claimId);
    const plan = state.build?.plans.find((p) => p.id === claim?.planId);
    if (!claim || !plan || claim.ownerId !== d.holderId || !state.people[d.challengerId]) { d.status = 'dismissed'; continue; }
    if (standing(state, d.challengerId) > standing(state, d.holderId) + stake(state, plan.id) + LAND.incumbency) {
      claim.ownerId = plan.ownerId = d.challengerId;
      plan.stalledDays = 0;
      d.status = 'upheld';
    } else d.status = 'dismissed';
  }
  b.disputes = b.disputes.filter((d) => d.status === 'open' || state.day - d.opened < 60);
  const residents = new Map<string, string[]>();
  for (const [id, p] of Object.entries(state.people ?? {})) if (p.townId) (residents.get(p.townId) ?? residents.set(p.townId, []).get(p.townId)!).push(id);
  for (const [townId, ids] of [...residents].sort(([x], [y]) => x.localeCompare(y))) {
    const contested = new Set(b.disputes.filter((d) => d.status === 'open').map((d) => d.claimId));
    const target = activePlans(state, townId).filter((p) => p.stage === 'gathering' && p.stalledDays >= LAND.stalledDays && !contested.has(p.claimId)).sort((x, y) => x.id.localeCompare(y.id))[0];
    if (!target || deriveRng(state.seed, 'jump', state.day, townId).next() >= LAND.jumpChance) continue;
    const busy = new Set(activePlans(state).map((p) => p.ownerId));
    const challenger = [...ids].sort().find((id) => id !== target.ownerId && !busy.has(id) && purseOf(state, id) >= LAND.jumperPurse);
    if (!challenger) continue;
    b.disputes.push({ id: `dsp${b.next++}`, townId, claimId: target.claimId, challengerId: challenger, holderId: target.ownerId, opened: state.day, status: 'open' });
  }
}

