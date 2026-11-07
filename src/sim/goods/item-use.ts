import type { SimState } from '../types/runtime';
import { encodeUnspokenForState } from '../social/unspoken';
import { ITEM_BY_ID, hasItem, removeItem } from './inventory';
export function useItem(state: SimState, itemId: string, hearthTownId?: string): string {
  const item = ITEM_BY_ID.get(itemId);
  if (!item || !hasItem(state, itemId)) return 'Select an item you are carrying.';
  if (item.use?.spark) {
    const cap = state.player.sparkMax ?? 100;
    if (state.player.spark >= cap) return 'You are rested enough. Save the food.';
    const gain = Math.min(item.use.spark, cap - state.player.spark);
    removeItem(state, itemId); state.player.spark += gain;
    return `Ate ${item.name}. Recovered ${gain.toFixed(0)} spark.`;
  }
  if (item.use?.hearthMemory) {
    if (!hearthTownId) return 'Bring this keepsake to a hearth, then use it.';
    if (state.hearthKeepsakes?.[hearthTownId]) return 'A keepsake already rests at this hearth.';
    const people = Object.values(state.people).filter((p) => p.townId === hearthTownId).sort((a, b) => a.id.localeCompare(b.id));
    if (!people.length) return 'No one here can remember it yet.';
    removeItem(state, itemId);
    (state.hearthKeepsakes ??= {})[hearthTownId] = { day: state.day, by: state.player.id };
    for (const p of people.slice(0, 3)) encodeUnspokenForState(state, 'gift_give', p.id, { tags: ['memory', 'kin', 'hearth'] });
    const touched = (state.flags.lastTouchDayByTown ??= {}) as Record<string, number>;
    touched[hearthTownId] = state.day;
    return 'You place the keepsake beside the fire. Neighbours stop to remember.';
  }
  return `${item.name} is used through work, gifts, trade or deliveries.`;
}
