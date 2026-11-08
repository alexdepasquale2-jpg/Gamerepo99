/**
 * Dawn lines: short things the player hears when they wake (what a sibling overheard, a happening,
 * a deal coming due…). Systems register a contributor in their own module (imported from ./contrib);
 * the overworld shows every collected line after "Dawn. Day N." Lines should come through people
 * ("Marta says the mill stopped"), never as system notices. Pure: no Phaser/DOM.
 */
import type { SimState } from './types/runtime';

export type DawnLineSource = (state: SimState) => string[];

const sources = new Map<string, DawnLineSource>();

/** Register (or replace) a contributor under a stable id. */
export function registerDawnLines(id: string, fn: DawnLineSource): void {
  sources.set(id, fn);
}

/** This dawn's lines grouped by contributor id (each source runs once). */
export function collectDawnLinesBySource(state: SimState): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [id, fn] of sources) out[id] = fn(state).filter((l) => !!l);
  return out;
}

/** Every line contributed for this dawn, in registration order. */
export function collectDawnLines(state: SimState): string[] {
  return Object.values(collectDawnLinesBySource(state)).flat();
}
