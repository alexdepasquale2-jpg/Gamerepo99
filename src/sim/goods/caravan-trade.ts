/** Real caravan cargo and coin, never an unlimited shop. */
import type { SimState } from '../types/runtime';
import { ITEMS, addItem, hasItem, removeItem } from './inventory';
export function caravanItem(state: SimState, id: string) {
  const m = state.caravans?.find((m) => m.id === id);
  return ITEMS.items.find((i) => i.economyResourceId === m?.cargoResourceId);
}
export function tradeCaravan(state: SimState, id: string, buying: boolean): string {
  const m = state.caravans?.find((m) => m.id === id), item = caravanItem(state, id);
  if (!m || !item) return 'This caravan has moved on.';
  const cost = item.price;
  m.coin ??= 20;
  if (buying) {
    if (m.qty < 1) return 'The wagon is empty.';
    if (!hasItem(state, 'coin', cost)) return `You need ${cost} coin.`;
    removeItem(state, 'coin', cost); addItem(state, item.id, 1); m.qty--; m.coin += cost;
    return `Bought ${item.name} for ${cost} coin.`;
  }
  if (!hasItem(state, item.id)) return `They need ${item.name}; gather some first.`;
  if (m.coin < cost) return 'The trader has no coin left.';
  removeItem(state, item.id); addItem(state, 'coin', cost); m.qty++; m.coin -= cost;
  return `Sold ${item.name} for ${cost} coin. It will travel with the caravan.`;
}
