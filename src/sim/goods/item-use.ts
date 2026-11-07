import type { SimState } from '../types/runtime';
import { encodeUnspokenForState } from '../social/unspoken';
import { ITEM_BY_ID, addItem, hasItem, removeItem } from './inventory';
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

export type DropTarget = { kind: 'person'; id: string } | { kind: 'ground' } | null;
export type DropAction = { kind: 'gift_give'; personId: string; itemId: string } | { kind: 'drop'; itemId: string } | { kind: 'none' };

/** What dropping a hotbar stack on a target means. Gifts reuse the gift_give deed; coin is never gifted. */
export function resolveDrop(stack: { itemId: string; qty: number } | undefined, target: DropTarget): DropAction {
  if (!stack || stack.qty <= 0 || !target) return { kind: 'none' };
  if (target.kind === 'ground') return { kind: 'drop', itemId: stack.itemId };
  return stack.itemId === 'coin' ? { kind: 'none' } : { kind: 'gift_give', personId: target.id, itemId: stack.itemId };
}

/** Set one carried item down in the world; its instance (if any) stays with it. */
export function dropItem(state: SimState, itemId: string, at: { x: number; y: number }): NonNullable<SimState['groundItems']>[number] | null {
  if (!removeItem(state, itemId)) return null;
  const inst = (state.itemInstances ?? []).find((i) => i.itemId === itemId && i.heldBy === 'player');
  if (inst) inst.heldBy = 'ground';
  const list = (state.groundItems ??= []);
  const g = { id: `g${state.day}_${list.length}_${Math.round(at.x)}_${Math.round(at.y)}`, itemId, x: at.x, y: at.y, instId: inst?.id };
  list.push(g);
  return g;
}

export function pickUpItem(state: SimState, groundId: string): boolean {
  const list = state.groundItems ?? [];
  const k = list.findIndex((g) => g.id === groundId);
  if (k < 0) return false;
  const [g] = list.splice(k, 1);
  addItem(state, g!.itemId, 1);
  const inst = (state.itemInstances ?? []).find((i) => i.id === g!.instId);
  if (inst) inst.heldBy = 'player';
  return true;
}
