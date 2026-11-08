import type { SimState } from './types/runtime';

/**
 * Named slots in the dawn pipeline. `advanceToDawn` runs the built-in ticks in their fixed order and
 * calls `runDawnSlot` at each slot, so a new system registers itself here instead of editing
 * scenario-advance.ts. Slot order is the pipeline order:
 *   season    - before the economy (sets the day's harvest, warmth and travel conditions)
 *   people    - after households (aging, death, minds)
 *   relations - after people (friendships, feuds, courtship)
 *   roads     - after logistics (road decay and repair, escorts)
 *   prices    - after roads (price waves along the roads)
 *   late      - after happenings, before the spark clamp
 */
export const DAWN_SLOTS = ['season', 'people', 'relations', 'roads', 'prices', 'late'] as const;
export type DawnSlot = (typeof DAWN_SLOTS)[number];

type DawnTick = (state: SimState) => void;
const ticks = new Map<DawnSlot, Map<string, DawnTick>>(DAWN_SLOTS.map((s) => [s, new Map()]));

/** Register (or replace) a dawn tick by id. Within a slot, ticks run in registration order. */
export function registerDawnTick(slot: DawnSlot, id: string, fn: DawnTick): void {
  ticks.get(slot)!.set(id, fn);
}

export function runDawnSlot(state: SimState, slot: DawnSlot): void {
  for (const fn of ticks.get(slot)!.values()) fn(state);
}

/** Registered tick ids per slot, in run order (for tests). */
export function dawnTickIds(): Record<DawnSlot, string[]> {
  return Object.fromEntries(DAWN_SLOTS.map((s) => [s, [...ticks.get(s)!.keys()]])) as Record<DawnSlot, string[]>;
}
