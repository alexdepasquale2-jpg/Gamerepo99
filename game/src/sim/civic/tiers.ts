/**
 * Civic tiers: hamlet → village → town → city, judged by population and finished buildings
 * (data/civic/zones.json tiers). A tier unlocks building kinds (granary, market, barracks, town hall):
 * an ambition, the council or the player may stake one only from that tier on. A generated district
 * town counts its founding people (sim/map/districts) when the live sim embodies fewer of them.
 * Pure, deterministic, no Phaser/DOM; reads state.build directly so build-plans can import it.
 */
import type { SimState } from '../types/runtime';
import { districtTown, ZONES } from './zoning';

export type Tier = (typeof ZONES.tiers)[number];
export const TIERS = ZONES.tiers;
export const tierIndex = (id: string | undefined): number => Math.max(0, TIERS.findIndex((t) => t.id === id));

/** A town's own folk (visitors and folk on the road or retired are not counted). */
export function residentsOf(state: SimState, townId: string): string[] {
  return Object.keys(state.people ?? {}).sort().filter((id) => {
    const p = state.people[id]!;
    return p.townId === townId && !id.startsWith('vis_') && !p.tags?.some((t) => t === 'on_road' || t === 'retired');
  });
}

/** Population for the tier: the residents, or a district town's founding people if more. */
export function townPopulation(state: SimState, townId: string): number {
  const live = residentsOf(state, townId).length;
  return Math.max(live, districtTown(state.seed, townId)?.people ?? 0);
}

export const builtCount = (state: SimState, townId: string): number =>
  (state.build?.claims ?? []).filter((c) => c.townId === townId && c.status === 'built').length;

/** The highest tier whose population and buildings the town meets. */
export function tierOf(state: SimState, townId: string, pop = townPopulation(state, townId), built = builtCount(state, townId)): Tier {
  let best = TIERS[0]!;
  for (const t of TIERS) if (pop >= t.pop && built >= t.built) best = t;
  return best;
}
export const nextTier = (t: Tier): Tier | undefined => TIERS[tierIndex(t.id) + 1];

/** The tier a kind needs (undefined: any town may raise it). */
export const tierNeeded = (kind: string): Tier | undefined => {
  const id = ZONES.unlocks[kind];
  return id ? TIERS[tierIndex(id)] : undefined;
};
export const unlockedIn = (state: SimState, townId: string, kind: string): boolean => {
  const need = tierNeeded(kind);
  return !need || tierIndex(tierOf(state, townId).id) >= tierIndex(need.id);
};
/** Kinds the tier unlocks, in table order. */
export const unlocksAt = (tierId: string): string[] => Object.entries(ZONES.unlocks).filter(([, t]) => t === tierId).map(([k]) => k);
