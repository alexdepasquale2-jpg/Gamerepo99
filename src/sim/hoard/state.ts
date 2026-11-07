/** Hoarder runtime state (saveable) + data accessors. Coin is a meter on player.coin; never a button. */

import type { DataTables } from '../load-data';
import type { SimState } from '../types/runtime';

export type StashRuntime = {
  siteId: string;
  coin: number;
  goods: Record<string, number>;
  guardsHired: number;
  lastTheftDay?: number;
};

export type HoardState = {
  notoriety: number;
  stash: Record<string, StashRuntime>;
  peakCoin: number;
  reigniteCount: number;
  lastStashActDay: number;
  /** Coin spent today (guard hire + upkeep); drives gain_flash_spend. */
  spend?: { day: number; coin: number };
  /** siteId -> person id with a stash-raid goal (att_rival_hoarder). */
  raiders?: Record<string, string>;
  /** Attractor ids that fired on a given dawn (read by refuse_tax). */
  attractorsToday?: { day: number; ids: string[] };
};

export type StashSiteDef = {
  id: string;
  townId: string;
  hideDifficulty: number;
  capacity: number;
  guardSlots: number;
  decayPerDawn: number;
  theftRiskBase: number;
};

export type StashActDef = { id: string; methodIds: string[]; amount?: number; coinCost?: number; upkeepPerDay?: number };

export type NotorietyRow = { id: string; add: number; when?: Record<string, number | boolean> };

export type NotorietyTrigger = { event: string; gainId: string; attractorId?: string; minGuards?: number; playerInTown?: boolean };

export type NotorietyTable = {
  triggers?: NotorietyTrigger[];
  gains: NotorietyRow[];
  losses: NotorietyRow[];
  fade: number;
  despair: { dampenAbove: number; collapseAbove: number; mul: number };
  attractorRollScale: number;
  roadWeightScale: number;
  leverage: { discount: number; tagsAny: string[] };
  spread: { rippleTag: string; kinDilution: number; emitPacketType: string };
  attractors: { id: string; minNotoriety: number; weight: number; spawn: string; channels: string[]; raidBonus?: number }[];
  hoardLegacy: { peakCoinMin: number; endingId: string };
};

export const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

export function ensureHoard(state: SimState): HoardState {
  return (state.hoard ??= { notoriety: 0, stash: {}, peakCoin: 0, reigniteCount: 0, lastStashActDay: 0 });
}

const dataOf = (state: SimState): Partial<DataTables> => (state.data ?? {}) as Partial<DataTables>;
export const notorietyTable = (state: SimState): NotorietyTable | undefined => dataOf(state).notoriety as NotorietyTable | undefined;
export const siteDefs = (state: SimState): StashSiteDef[] => (dataOf(state).stashSites?.sites ?? []) as StashSiteDef[];
export const actDefs = (state: SimState): StashActDef[] => (dataOf(state).stashSites?.acts ?? []) as StashActDef[];

export function ensureStash(state: SimState, siteId: string): StashRuntime {
  const h = ensureHoard(state);
  return (h.stash[siteId] ??= { siteId, coin: 0, goods: {}, guardsHired: 0 });
}

export const totalGoods = (s: StashRuntime): number => Object.values(s.goods).reduce((a, n) => a + n, 0);

/** Decision 4: visibleWealth = min(1, totalStashCoin / capacity). */
export function visibleWealth(state: SimState): number {
  const cap = siteDefs(state).reduce((a, d) => a + d.capacity, 0);
  const coin = Object.values(ensureHoard(state).stash).reduce((a, s) => a + s.coin, 0);
  return cap > 0 ? Math.min(1, coin / cap) : 0;
}

/** Track the high-water mark of all coin held (carried + stashed). */
export function notePeakCoin(state: SimState): void {
  const h = ensureHoard(state);
  const held = (state.player.coin ?? 0) + Object.values(h.stash).reduce((a, s) => a + s.coin, 0);
  if (held > h.peakCoin) h.peakCoin = held;
}
