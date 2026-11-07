import type { SimState } from '../types/runtime';
import { rollAttractors, tickNotorietyDawn } from './notoriety';
import { tickStashDawn } from './stash';
import { notorietyTable } from './state';
import { syncRaiders, tickGuardUpkeep } from './events';
import { pushJuice } from '../packets';

export * from './state';
export { addNotoriety, tickNotorietyDawn, rollAttractors, attractorRoadBonus, leverageDiscount, despairMul } from './notoriety';
export { applyStashAct, tickStashDawn, theftP, unguarded, decayLoss } from './stash';
export { fireNotorietyEvent, noteCoinSpend, tickGuardUpkeep, syncRaiders, raidBonus } from './events';
export { detectEnding } from './neglect';

/** Dawn beat: stash decay/theft, notoriety fade, dawn attractors (juice only; spawns are Task B/M6). */
export function tickHoardDawn(state: SimState): void {
  if (!notorietyTable(state)) return;
  tickGuardUpkeep(state);
  const fired = rollAttractors(state, 'dawn');
  syncRaiders(state, fired);
  tickStashDawn(state);
  tickNotorietyDawn(state);
  for (const id of fired) pushJuice(state, 'notoriety.attractor', { attractorId: id });
}
