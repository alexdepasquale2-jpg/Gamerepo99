/** Player inventory + item table. Pure, data-driven (data/items/items.json). */

import itemsJson from '../../data/items/items.json';
import type { SimState } from '../types/runtime';
import { noteUse } from '../data-use-world';

export type ItemRow = {
  id: string; name: string; icon: string; color: string; price: number;
  economyResourceId?: string; tags: string[];
  use?: { spark?: number; hearthMemory?: boolean; correspondence?: boolean };
};
type AffinityRule = { personMatch: string; itemTag: string; weight: number };
export type MarketTable = { goods: string[]; sellFactor: number; buyFactor: number };
export type ItemsTable = {
  items: ItemRow[];
  market: MarketTable;
  startingInventory: Record<string, number>;
  giftAffinity: { rules: AffinityRule[] };
  deeds: {
    tradeMarkup: number; carryCargoQty: number; carryRewardCoin: number;
    shortageBelow: number; shortageDespairRelief: number;
  };
};

export const ITEMS = itemsJson as unknown as ItemsTable;
export const ITEM_BY_ID = new Map(ITEMS.items.map((i) => [i.id, i]));
export const itemName = (id: string): string => ITEM_BY_ID.get(id)?.name ?? id;

export function inventoryOf(state: SimState): Record<string, number> {
  if (!state.inventory) {
    state.inventory = { ...ITEMS.startingInventory };
    // The satchel you start with is how a keepsake and a letter are got at all.
    for (const id of Object.keys(ITEMS.startingInventory)) noteUse('items', id);
    if (typeof state.player.coin === 'number') state.inventory.coin = state.player.coin + (state.inventory.coin ?? 0);
  }
  return state.inventory;
}

export function addItem(state: SimState, itemId: string, qty: number): void {
  // Proof the item is really got (qty > 0) and spent (qty < 0) in play: game/scripts/coverage-world.mts.
  if (qty) noteUse(qty > 0 ? 'items' : 'items.use', itemId);
  const inv = inventoryOf(state);
  inv[itemId] = (inv[itemId] ?? 0) + qty;
  if (inv[itemId]! <= 0) delete inv[itemId];
  if (itemId === 'coin') state.player.coin = inv.coin ?? 0;
}

export function hasItem(state: SimState, itemId: string, qty = 1): boolean {
  return (inventoryOf(state)[itemId] ?? 0) >= qty;
}

export function removeItem(state: SimState, itemId: string, qty = 1): boolean {
  if (!hasItem(state, itemId, qty)) return false;
  addItem(state, itemId, -qty);
  return true;
}

/** Sorted non-empty stacks (stable order = item table order). */
export function listStacks(state: SimState): { item: ItemRow; qty: number }[] {
  const inv = inventoryOf(state);
  return ITEMS.items.filter((i) => (inv[i.id] ?? 0) > 0).map((item) => ({ item, qty: inv[item.id]! }));
}

/** Affinity of a person for an item: tag rules over the person's tags + wound. */
export function giftAffinity(state: SimState, personId: string, itemId: string): number {
  const p = state.people[personId];
  const item = ITEM_BY_ID.get(itemId);
  if (!p || !item) return 0;
  const hay = [...(p.tags ?? []), p.woundId ?? ''].join(' ').toLowerCase();
  let score = 0;
  for (const r of ITEMS.giftAffinity.rules) {
    if (item.tags.includes(r.itemTag) && (r.personMatch === '' || hay.includes(r.personMatch))) score += r.weight;
  }
  return score;
}

/** Best non-coin gift the player holds for this person. */
export function bestGift(state: SimState, personId: string): { itemId: string; affinity: number } | null {
  let best: { itemId: string; affinity: number } | null = null;
  for (const { item } of listStacks(state)) {
    if (item.id === 'coin') continue;
    const a = giftAffinity(state, personId, item.id);
    if (!best || a > best.affinity) best = { itemId: item.id, affinity: a };
  }
  return best;
}
