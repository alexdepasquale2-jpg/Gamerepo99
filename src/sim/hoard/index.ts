import type { SimState } from '../types/runtime';
import { rollAttractors, tickNotorietyDawn } from './notoriety';
import { tickStashDawn } from './stash';
import { notorietyTable } from './state';
import { pushJuice } from '../packets';

export * from './state';
export { addNotoriety, tickNotorietyDawn, rollAttractors, attractorRoadBonus, leverageDiscount, despairMul } from './notoriety';
export { applyStashAct, tickStashDawn, theftP, unguarded, decayLoss } from './stash';
export { detectEnding } from './neglect';

/** Dawn beat: stash decay/theft, notoriety fade, dawn attractors (juice only; spawns are Task B/M6). */
export function tickHoardDawn(state: SimState): void {
  if (!notorietyTable(state)) return;
  tickStashDawn(state);
  tickNotorietyDawn(state);
  for (const id of rollAttractors(state, 'dawn')) pushJuice(state, 'notoriety.attractor', { attractorId: id });
}
