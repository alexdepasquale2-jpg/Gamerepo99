/**
 * A new town's opening shelves. The ledger only fills when its people work a dawn, so a world fresh
 * from the start has stalls and counters with nothing on them until the player has slept once. A
 * town that comes into being (a new world, a district first entered) gets a little of what its shops
 * sell from data/economy/dawn-stock.json openingShelves, by settlement kind.
 *
 * The goods go into the town's stores (civic/town-stores) under the named source `source:opening`, the
 * same name the stores give a ledger they were opened from, so the world's goods still change only by
 * named flows (scripts/check-civic.mts). Saved towns are never seeded again. Pure + deterministic.
 */
import dawnStockJson from '../../data/economy/dawn-stock.json';
import { supplyStores } from '../civic/town-stores';
import { noteUse } from '../data-use-civic';
import type { SettlementKind } from '../map/world-layout';
import type { SimState } from '../types/runtime';

type Shelves = Record<SettlementKind, Record<string, number>>;
const SHELVES = (dawnStockJson as unknown as { openingShelves: { byKind: Shelves } }).openingShelves.byKind;

/** Put a new town's opening goods into its stores (once, when the town first appears). */
export function stockOpeningShelves(state: SimState, townId: string, kind: SettlementKind | undefined): void {
  const k: SettlementKind = kind && SHELVES[kind] ? kind : 'village';
  noteUse('economy/dawn-stock', `shelves:${k}`);
  // Sorted, so the stores fill in the same order whatever order the JSON was written in.
  for (const [item, qty] of Object.entries(SHELVES[k]).sort(([a], [b]) => a.localeCompare(b))) {
    if (qty > 0) supplyStores(state, townId, item, qty, 'source:opening');
  }
}
