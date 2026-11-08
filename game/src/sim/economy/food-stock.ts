/**
 * One food stock (F6). A town's food is the village ledger's food pool (bread, fish, berries, grain):
 * households eat from it at dawn, and what they could not eat is `short.food`. The LOD resource
 * `food_grain` (routes, caravans, patrons, road encounters, facility shifts, deliveries) is only a name
 * for that pool: reads and writes of it go through here, never to `state.towns[id].stock`.
 * Despair reads the same pool (economy-lod starve). The pool's food sits in the town's stores (the granary,
 * the yard, sites' shelves: civic/town-stores); takes and spoilage go through those, and the ledger shows the
 * sum. Pure + deterministic.
 */

import { ITEMS } from '../goods/inventory';
import type { SimState } from '../types/runtime';
import { drawStores, spoilInTown } from '../civic/town-stores';
import { COVER_DAYS, HOUSEHOLD, supplyTown } from './village-economy';

/** The LOD resource id that names the town's food. */
export const FOOD_RES = 'food_grain';
/** What arriving bulk food (a grain crate, a mill's output) becomes in the ledger. */
const BULK_FOOD_ITEM = 'grain';

export const isFoodRes = (res: string | undefined): boolean => res === FOOD_RES;

const ledger = (state: SimState, townId: string) => state.villageEconomy?.towns[townId];

/** Units of food in the town's ledger. */
export function foodHave(state: SimState, townId: string): number {
  const g = ledger(state, townId)?.goods;
  return g ? HOUSEHOLD.food.eats.reduce((n, i) => n + Math.max(0, g[i] ?? 0), 0) : 0;
}

/** Food the town ate (or wanted) at the last dawn. 0 before its first dawn. */
export const foodNeed = (state: SimState, townId: string): number => ledger(state, townId)?.need.food ?? 0;

/** Days of food in store at the last dawn's appetite (Infinity when nobody needs feeding yet). */
export function foodCover(state: SimState, townId: string): number {
  const need = foodNeed(state, townId);
  return need > 0 ? foodHave(state, townId) / need : Infinity;
}

/** Food missing at the last dawn: households went without this much. */
export const foodShortToday = (state: SimState, townId: string): number => ledger(state, townId)?.short.food ?? 0;

/**
 * Hungry: households went short at the last dawn and the store still cannot feed a day (or is below
 * `below` units, the economy-lod starve line).
 */
export function foodStarving(state: SimState, townId: string, below = 1): boolean {
  return foodShortToday(state, townId) > 1e-9 && foodHave(state, townId) < Math.max(below, foodNeed(state, townId));
}

/** Remove up to `qty` food, bulk grain first, then what keeps worst. Returns what was taken. */
export function takeFood(state: SimState, townId: string, qty: number): number {
  if (!ledger(state, townId) || qty <= 0) return 0;
  let left = qty;
  // Food taken out of town (war rations, the LOD's hauls to a hungrier neighbour): named so the stores balance.
  for (const item of [BULK_FOOD_ITEM, 'berries', 'fish', 'bread']) left -= drawStores(state, townId, item, left, 'sink:taken');
  return qty - left;
}

/** Food spoils at the food resource's rate (economy-resources spoilPerDawn), item by item. */
export function spoilFood(state: SimState, townId: string, rate: number, floor = 0): void {
  const g = ledger(state, townId)?.goods;
  if (!g || !(rate > 0)) return;
  // Each store loses its share, so the floor holds for the town as a whole (spoilInTown).
  for (const item of HOUSEHOLD.food.eats) if (typeof g[item] === 'number') spoilInTown(state, townId, item, rate, floor);
}

// ---- Any LOD resource: food goes to the ledger, the rest to town.stock. ----

/** A town's stock of a resource; undefined when the town keeps no stock at all. */
export function stockOf(state: SimState, townId: string, res: string): number | undefined {
  if (isFoodRes(res)) return state.towns?.[townId] || ledger(state, townId) ? foodHave(state, townId) : undefined;
  return state.towns?.[townId]?.stock[res];
}

/** Add (or with a negative qty, take) stock. Never below zero. */
export function addStock(state: SimState, townId: string, res: string, qty: number): void {
  if (!townId || !qty) return;
  if (isFoodRes(res)) {
    if (qty > 0) supplyTown(state, townId, BULK_FOOD_ITEM, qty);
    else takeFood(state, townId, -qty);
    return;
  }
  const town = state.towns?.[townId];
  if (town) town.stock[res] = Math.max(0, (town.stock[res] ?? 0) + qty);
}

/**
 * The shortage line for a resource: below it the town is short. Food: COVER_DAYS of the town's
 * appetite (the same cover that raises food prices), never under the noticeboards' line.
 */
export function shortLine(state: SimState, townId: string, res: string): number {
  const base = ITEMS.deeds.shortageBelow;
  return isFoodRes(res) ? Math.max(base, foodNeed(state, townId) * COVER_DAYS) : base;
}

/**
 * How much the town lacks of a resource to be off the shortage line (0 when it is fine). A resource a
 * town keeps no entry for counts as empty; a town with no stock at all is never short.
 */
export function shortfall(state: SimState, townId: string, res: string): number {
  const have = stockOf(state, townId, res) ?? (state.towns?.[townId] ? 0 : undefined);
  return have === undefined ? 0 : Math.max(0, shortLine(state, townId, res) - have);
}

export const isShortOf = (state: SimState, townId: string, res: string): boolean => shortfall(state, townId, res) > 0;

/** 0 (well stocked) .. 1 (nothing in store) against the shortage line; 0 for goods the town does not keep (prices). */
export function scarcityOf(state: SimState, townId: string, res: string): number {
  const have = stockOf(state, townId, res);
  const line = shortLine(state, townId, res);
  return have === undefined || line <= 0 ? 0 : Math.max(0, line - have) / line;
}

/** Resources a town keeps, food first (for surplus and shortage scans). */
export function stockedResources(state: SimState, townId: string): string[] {
  const keys = Object.keys(state.towns?.[townId]?.stock ?? {}).filter((r) => !isFoodRes(r)).sort();
  return state.towns?.[townId] || ledger(state, townId) ? [FOOD_RES, ...keys] : keys;
}

/**
 * Old saves and authored seeds kept food in `town.stock.food_grain`: move it into the ledger once.
 * Idempotent (the key is gone afterwards).
 */
export function drainLegacyFood(state: SimState, townId: string): void {
  const stock = state.towns?.[townId]?.stock;
  if (!stock || typeof stock[FOOD_RES] !== 'number') return;
  const qty = stock[FOOD_RES]!;
  delete stock[FOOD_RES];
  if (qty > 0) supplyTown(state, townId, BULK_FOOD_ITEM, qty);
}
