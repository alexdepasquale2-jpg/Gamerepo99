/** Advance play clocks (dusk/dawn/day/ticks) and fire dusk personal-cost hooks. */

import { runHooks } from './hooks';
import type { DataTables } from './load-data';
import { pushJuice } from './packets';
import type { Rng } from './rng';
import type { SimState } from './types/runtime';

export type AdvanceTarget = 'dusk' | 'dawn' | 'day' | { ticks: number };

export function parseAdvanceAction(actionId: string): AdvanceTarget | null {
  if (actionId === 'advance:dusk') return 'dusk';
  if (actionId === 'advance:dawn') return 'dawn';
  if (actionId === 'advance:day') return 'day';
  if (actionId.startsWith('advance:ticks:')) {
    const n = Number(actionId.slice('advance:ticks:'.length));
    if (!Number.isFinite(n) || n < 0) return null;
    return { ticks: Math.floor(n) };
  }
  return null;
}

function anyBurningAdjacent(state: SimState): boolean {
  const burnAt = (state.data as DataTables | undefined)?.reigniteThreshold ?? 35;
  const burning = Object.values(state.people).filter((p) => p.flame >= burnAt);
  if (burning.length === 0) return false;
  const placed = burning.filter((p) => typeof p.x === 'number' && typeof p.y === 'number');
  if (placed.length === 0) return false;
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i]!;
      const b = placed[j]!;
      if (Math.abs((a.x as number) - (b.x as number)) + Math.abs((a.y as number) - (b.y as number)) <= 3) {
        return true;
      }
    }
  }
  return false;
}

/** Advance one dusk beat: personal-cost hooks + optional spark.spend juice. */
export function advanceToDusk(state: SimState): void {
  state.flags.noBurningAdjacent = !anyBurningAdjacent(state);
  const data = state.data as DataTables | undefined;
  const rng = state.rng as Rng | undefined;
  if (!data || !rng) return;
  const sparkBefore = state.player.spark;
  runHooks(state, 'dusk', { data, rng });
  if (state.player.spark < sparkBefore) {
    pushJuice(state, 'spark.spend', {
      amount: sparkBefore - state.player.spark,
      reason: 'dusk',
    });
  }
  state.day += 1;
  state.flags.kindSuccessToday = false;
}

export function advanceToDawn(state: SimState): void {
  state.day += 1;
  state.flags.kindSuccessToday = false;
}

export function advanceDays(state: SimState, days: number): void {
  for (let i = 0; i < days; i++) advanceToDawn(state);
}
