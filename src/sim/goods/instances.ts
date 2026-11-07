/** Item instances: provenance for individual goods. Side table over the count-based inventory (counts stay authoritative). */

import type { SimState } from '../types/runtime';
import { inventoryOf } from './inventory';

export type ItemInstance = {
  id: string; itemId: string; madeBy: string; townId: string; dawn: number;
  /** 'player' or a person id once given away. */
  heldBy: string;
};

export function mintInstance(state: SimState, itemId: string, madeBy: string, townId: string): ItemInstance {
  const list = (state.itemInstances ??= []);
  const inst: ItemInstance = { id: `${itemId}#${list.length + 1}_${state.day}`, itemId, madeBy, townId, dawn: state.day, heldBy: 'player' };
  list.push(inst);
  return inst;
}

/** Instances the player holds for an item (oldest first), never more than the count says. */
export function playerInstances(state: SimState, itemId: string): ItemInstance[] {
  const n = inventoryOf(state)[itemId] ?? 0;
  return (state.itemInstances ?? []).filter((i) => i.itemId === itemId && i.heldBy === 'player').slice(0, n);
}

/** Hand the oldest held instance of an item to a person (call after removeItem). Anonymous stock returns null. */
export function giveInstance(state: SimState, itemId: string, personId: string): ItemInstance | null {
  const inst = (state.itemInstances ?? []).find((i) => i.itemId === itemId && i.heldBy === 'player');
  if (inst) inst.heldBy = personId;
  return inst ?? null;
}

/** Instances a person has been given. */
export const instancesHeldBy = (state: SimState, personId: string): ItemInstance[] =>
  (state.itemInstances ?? []).filter((i) => i.heldBy === personId);

/** Drop an instance for a consumed/sold item (call after removeItem). */
export function consumeInstance(state: SimState, itemId: string): void {
  const list = state.itemInstances;
  const k = list?.findIndex((i) => i.itemId === itemId && i.heldBy === 'player') ?? -1;
  if (k >= 0) list!.splice(k, 1);
}
