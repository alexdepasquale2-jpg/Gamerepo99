import type { SimState } from '../types/runtime';
import { rollAttractors, tickNotorietyDawn } from './notoriety';
import { tickStashDawn } from './stash';
import { notorietyTable } from './state';
import { syncRaiders, tickGuardUpkeep } from './events';
import { pushJuice } from '../packets';
import { applyEffect } from '../effects';
import { deriveRng } from '../rng';
import type { DataTables } from '../load-data';

export * from './state';
export { addNotoriety, tickNotorietyDawn, rollAttractors, attractorRoadBonus, leverageDiscount, despairMul } from './notoriety';
export { applyStashAct, tickStashDawn, theftP, unguarded, decayLoss } from './stash';
export { fireNotorietyEvent, noteCoinSpend, tickGuardUpkeep, syncRaiders, raidBonus } from './events';
export { detectEnding } from './neglect';

/** Dawn beat: stash decay/theft, notoriety fade, dawn attractors (juice + authored effects scaled by notoriety). */
export function tickHoardDawn(state: SimState): void {
  if (!notorietyTable(state)) return;
  tickGuardUpkeep(state);
  const fired = rollAttractors(state, 'dawn');
  syncRaiders(state, fired);
  tickStashDawn(state);
  tickNotorietyDawn(state);
  for (const id of fired) {
    pushJuice(state, 'notoriety.attractor', { attractorId: id });
    applyAttractorEffects(state, id);
  }
}

/** Apply a fired attractor's authored effects through the shared effect path. Deterministic per seed/day/attractor. */
export function applyAttractorEffects(state: SimState, attractorId: string): void {
  const row = notorietyTable(state)?.attractors.find((a) => a.id === attractorId);
  if (!row?.effects?.length || !state.data) return;
  const rng = deriveRng(state.seed, 'attractor_fx', state.day, attractorId);
  const townDespair = state.towns?.[state.player.townId ?? '']?.despair;
  for (const effect of row.effects) applyEffect(state, effect, { data: state.data as DataTables, rng, townDespair });
}
