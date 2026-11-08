/** Hoarder runtime state (saveable) + data accessors. Coin is a meter on player.coin; never a button. */

import stashSitesJson from '../../data/economy/stash-sites.json';
import { townRole } from '../economy/town-roles';
import { districtOfTown } from '../map/districts';
import { deriveRng } from '../rng';
import type { Effect } from '../types/data';
import type { DataTables } from '../load-data';
import type { SimState } from '../types/runtime';

export type StashRuntime = {
  siteId: string;
  coin: number;
  goods: Record<string, number>;
  guardsHired: number;
  lastTheftDay?: number;
  /** Fractional rot carried between dawns so a small pile still spoils over time. */
  decayCarry?: number;
};

/** What happened to a stash on a given dawn (read by the dawn lines; cleared each dawn). */
export type HoardNews = {
  day: number;
  kind: 'theft' | 'decay' | 'guard_left';
  siteId: string;
  townId: string;
  /** Who noticed (lines come through people). */
  personId?: string;
  coin?: number;
  goods?: number;
};

/** Hoard ending offer: dawns the ending has held, whether it is on screen, and when it was set aside. */
export type HoardEndingState = { dawns: number; open?: boolean; dismissedDay?: number };

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
  /** This dawn's stash happenings (theft, rot, a guard walking off). */
  news?: HoardNews[];
  /** The ash_hoard ending offer (optional; older saves have none). */
  ending?: HoardEndingState;
};

export type StashSiteDef = {
  id: string;
  townId: string;
  name?: string;
  hideDifficulty: number;
  capacity: number;
  guardSlots: number;
  decayPerDawn: number;
  theftRiskBase: number;
};

export type StashActDef = {
  id: string;
  methodIds: string[];
  amount?: number;
  coinCost?: number;
  upkeepPerDay?: number;
  /** stash_store: carried items with any of these tags go into the stash. */
  goodsTagsAny?: string[];
};

export type HoardEndingUi = {
  title: string;
  opening: string;
  bought: string;
  guards: string;
  nameByNotoriety: { below: number; line: string }[];
  townsLead: string;
  townByDespair: { below: number; line: string }[];
  buttons: { continue: string; quit: string };
  restedLine: string;
};

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
  attractors: { id: string; minNotoriety: number; weight: number; spawn: string; channels: string[]; raidBonus?: number; effects?: Effect[] }[];
  hoardLegacy: { peakCoinMin: number; endingId: string; offerAfterDawns?: number; ui?: HoardEndingUi };
};

export const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

export function ensureHoard(state: SimState): HoardState {
  return (state.hoard ??= { notoriety: 0, stash: {}, peakCoin: 0, reigniteCount: 0, lastStashActDay: 0 });
}

const dataOf = (state: SimState): Partial<DataTables> => (state.data ?? {}) as Partial<DataTables>;
export const notorietyTable = (state: SimState): NotorietyTable | undefined => dataOf(state).notoriety as NotorietyTable | undefined;

type StashRoles = {
  byKind: Record<string, Omit<StashSiteDef, 'id' | 'townId' | 'name'>>;
  namesByLand?: Record<string, string[]>;
  namesByCulture?: Record<string, string[]>;
  namesByKind?: Record<string, string[]>;
};
const ROLES = (stashSitesJson as { roles?: StashRoles }).roles;
const GEN_PREFIX = 'stash_';

/** A generated district town's hidden spot: numbers by town kind, a name from its land, culture and kind. */
function roleSite(seed: number, townId: string): StashSiteDef | undefined {
  const role = townRole(seed, townId);
  const k = role && ROLES?.byKind[role.kind];
  if (!role || !k) return undefined;
  const pool = [...(ROLES!.namesByLand?.[role.land] ?? []), ...(ROLES!.namesByCulture?.[role.culture] ?? []), ...(ROLES!.namesByKind?.[role.kind] ?? [])];
  // One seeded start per district, stepped by the town's index, so neighbours rarely share a name.
  const i = Number(/_t(\d+)$/.exec(townId)?.[1] ?? 0);
  const name = pool.length ? pool[(deriveRng(seed, 'stash-site', role.districtId).int(0, pool.length) + i) % pool.length] : undefined;
  return { id: `${GEN_PREFIX}${townId}`, townId, name, ...k };
}

// siteDefs is read every frame by the chest layer and per site in the dawn loops. The generated rows only
// change when the live towns are rebound (a new state.towns object) or the hoard gains a stash, so they
// are cached on the towns object and checked by a cheap signature.
const GEN_CACHE = new WeakMap<object, { sig: string; out: StashSiteDef[] }>();

/**
 * Authored sites (all of them, as before), then one generated site per district town that has none:
 * the live district's towns, plus any district town the hoard still holds a stash in (it travels with
 * you, so a cache left in another district keeps rotting and being robbed like an authored one would).
 */
export const siteDefs = (state: SimState): StashSiteDef[] => {
  const authored = (dataOf(state).stashSites?.sites ?? []) as StashSiteDef[];
  const holder: object = state.towns ?? state;
  const stashIds = Object.keys(state.hoard?.stash ?? {});
  const sig = `${state.seed}|${Object.keys(state.towns ?? {}).length}|${stashIds.length}|${authored.length}`;
  const hit = GEN_CACHE.get(holder);
  if (hit?.sig === sig) return hit.out;
  const towns = new Set<string>();
  for (const id of Object.keys(state.towns ?? {})) if (districtOfTown(id)) towns.add(id);
  for (const id of stashIds) {
    const t = id.startsWith(GEN_PREFIX) ? id.slice(GEN_PREFIX.length) : '';
    if (districtOfTown(t)) towns.add(t);
  }
  const have = new Set(authored.map((d) => d.townId));
  const gen = [...towns].sort().filter((t) => !have.has(t)).map((t) => roleSite(state.seed, t)).filter((d): d is StashSiteDef => !!d);
  const out = gen.length ? [...authored, ...gen] : authored;
  GEN_CACHE.set(holder, { sig, out });
  return out;
};
export const actDefs = (state: SimState): StashActDef[] => (dataOf(state).stashSites?.acts ?? []) as StashActDef[];

/** The stash site in a town (one per town), if any. */
export const siteInTown = (state: SimState, townId: string | undefined): StashSiteDef | undefined =>
  townId ? siteDefs(state).find((d) => d.townId === townId) : undefined;

/** Carried coin moves: player.coin is the meter; the satchel's coin stack follows by the same delta. */
export function shiftCarriedCoin(state: SimState, delta: number): void {
  state.player.coin = Math.max(0, (state.player.coin ?? 0) + delta);
  const inv = state.inventory;
  if (!inv || inv.coin === undefined) return;
  inv.coin = Math.max(0, inv.coin + delta);
  if (inv.coin <= 0) delete inv.coin;
}

export function ensureStash(state: SimState, siteId: string): StashRuntime {
  const h = ensureHoard(state);
  return (h.stash[siteId] ??= { siteId, coin: 0, goods: {}, guardsHired: 0 });
}

export const totalGoods = (s: StashRuntime): number => Object.values(s.goods).reduce((a, n) => a + n, 0);

/**
 * Decision 4: visibleWealth = min(1, totalStashCoin / capacity), both over this world's towns only: a
 * cache left in another district is out of sight here (and its capacity is not counted either).
 */
export function visibleWealth(state: SimState): number {
  const live = state.towns && Object.keys(state.towns).length ? state.towns : undefined;
  const here = siteDefs(state).filter((d) => !live || live[d.townId]);
  const cap = here.reduce((a, d) => a + d.capacity, 0);
  const stash = ensureHoard(state).stash;
  const coin = here.reduce((a, d) => a + (stash[d.id]?.coin ?? 0), 0);
  return cap > 0 ? Math.min(1, coin / cap) : 0;
}

/** Track the high-water mark of all coin held (carried + stashed). */
export function notePeakCoin(state: SimState): void {
  const h = ensureHoard(state);
  const held = (state.player.coin ?? 0) + Object.values(h.stash).reduce((a, s) => a + s.coin, 0);
  if (held > h.peakCoin) h.peakCoin = held;
}
