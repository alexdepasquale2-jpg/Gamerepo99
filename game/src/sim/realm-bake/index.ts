/**
 * The realm's baked past in play. A game holds only how long the bake ran (RealmState.bake.dawns); the
 * bake itself is worked out again from (seed, dawns) when something asks (sim/realm-bake/bake, memoized).
 * With no bake (0 dawns, and every save from before this) every reader falls back to the seed, so the
 * world is exactly the one the game always made.
 *
 * What the bake changes in play:
 *   - every district's despair and head count as the map, the trunk roads and district wars know them;
 *   - how neighbouring districts stand (trust, feud, pact or war) on day 1;
 *   - a district the first time it is live (the home one at the start): its towns' despair, how its
 *     hearths burn, what is in its stores, and its history, which its people retell.
 * Pure over SimState. No Phaser/DOM.
 */
import { foodHave, takeFood } from '../economy/food-stock';
import { supplyTown } from '../economy/village-economy';
import { roleFoodItem } from '../economy/town-roles';
import { FLAME_MAX } from '../effects';
import type { DataTables } from '../load-data';
import { districtAt, isHome } from '../map/districts';
import { realmIfAny, realmOf, refId, type DistrictRef } from '../realm';
import { deriveRng } from '../rng';
import type { SimState } from '../types/runtime';
import { BAKE, bakeRealm, clampDawns, pairKey, type BakedDistrict, type BakedPair, type RealmBake } from './bake';
import { BAKE_TAG, bakedHistory } from './tell';

export * from './bake';
export * from './tell';

/** Dawns this game's realm was baked for (0: a young world). */
export const bakeDawnsOf = (state: SimState | undefined): number => realmIfAny(state)?.bake?.dawns ?? 0;
/** This game's baked realm, or undefined for a young world. */
export function bakeOf(state: SimState | undefined): RealmBake | undefined {
  const dawns = bakeDawnsOf(state);
  return dawns > 0 && state ? bakeRealm(state.seed, dawns) : undefined;
}
export const bakedDistrict = (state: SimState | undefined, id: string): BakedDistrict | undefined => bakeOf(state)?.byId[id];
/** A district's despair after the bake (the seed's, with none). */
export const bakedDespair = (state: SimState | undefined, id: string): number | undefined => bakedDistrict(state, id)?.despair;
/** How two neighbouring districts stood when the bake ended. */
export const bakedPair = (state: SimState | undefined, a: string, b: string): BakedPair | undefined => bakeOf(state)?.pairs[pairKey(a, b)];

/** Set how long this game's realm was baked (once, at New game). */
export function setBake(state: SimState, dawns: number): number {
  const n = clampDawns(dawns);
  if (n > 0) realmOf(state).bake = { dawns: n };
  return n;
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** The bake's history laid into state.history (idempotent: stable ids). Call whenever a district becomes live. */
export function layBakedHistory(state: SimState, d: DistrictRef): void {
  const bake = bakeOf(state);
  if (!bake) return;
  const have = new Set((state.history ?? []).map((h) => h.id));
  const towns = Object.keys(state.towns ?? {}).sort();
  for (const h of bakedHistory(bake, refId(d), towns)) if (!have.has(h.id)) (state.history ??= []).push(h);
}

/**
 * A district's first live day after the bake (the home district at New game, any other the first time
 * you enter it): its towns carry the baked despair (as a shift from the seed's, so each town keeps its own
 * lean), a share of its folk are already lit where it glows (or the ash lies deeper where it does not), and
 * its stores are as full as the bake left them. Once per district (flags.baked).
 */
export function applyBake(state: SimState, d: DistrictRef): boolean {
  const bake = bakeOf(state);
  const id = refId(d);
  const b = bake?.byId[id];
  const done = (state.flags.baked ??= {}) as Record<string, boolean>;
  if (!bake || !b || done[id]) return false;
  done[id] = true;
  const shift = b.despair - districtAt(state.seed, d.col, d.row).despair;
  const townIds = Object.keys(state.towns ?? {}).sort();
  for (const tid of townIds) {
    const t = state.towns![tid]!;
    t.despair = clamp((t.despair ?? 0) + shift, isHome(d.col, d.row) ? 0 : 0.03, 0.95);
    // Stores: 20 days is where every district began; fuller or emptier in proportion.
    const have = foodHave(state, tid), want = have * clamp(b.food / BAKE.tuning.food.start, 0.15, 2.5);
    if (want > have) supplyTown(state, tid, roleFoodItem(state.seed, tid), Math.round(want - have));
    else if (want < have) takeFood(state, tid, Math.round(have - want));
  }
  const burnAt = (state.data as DataTables | undefined)?.reigniteThreshold ?? 35;
  for (const pid of Object.keys(state.people).sort()) {
    const p = state.people[pid]!;
    if (!p.townId || !state.towns?.[p.townId] || p.tags?.includes('legacy_player')) continue;
    const rng = deriveRng(state.seed, 'bake-flame', pid);
    const roll = rng.next();
    if (b.glow > 0) {
      // Someone lit them before you came: the brighter the land, the more of them.
      if (p.flame < burnAt && roll < b.glow * 0.8) p.flame = Math.min(FLAME_MAX, burnAt + 5 + Math.floor(rng.next() * 30));
    } else if (b.glow < 0) p.flame = Math.max(0, Math.round(p.flame * (1 + b.glow * (0.4 + roll * 0.5))));
  }
  layBakedHistory(state, d);
  return true;
}

/** Baked beats in a history list (kept through a reload: they are regenerated, not saved). */
export const isBakedBeat = (h: { tags?: string[] }): boolean => !!h.tags?.includes(BAKE_TAG);
